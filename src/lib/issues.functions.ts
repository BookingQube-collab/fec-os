"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

const TicketStatusEnum = z.enum([
  "open",
  "assigned",
  "in_progress",
  "blocked",
  "resolved",
  "closed",
  "cancelled",
]);
const TicketPriorityEnum = z.enum(["low", "normal", "high", "urgent"]);

const IssueFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    status: TicketStatusEnum.nullable().optional(),
    priority: TicketPriorityEnum.nullable().optional(),
  })
  .default({});

function slaForPriority(priority: string): string {
  const hours: Record<string, number> = { urgent: 2, high: 8, normal: 24, low: 72 };
  const h = hours[priority] ?? 24;
  return new Date(Date.now() + h * 3600_000).toISOString();
}

export const listIssues = createAuthenticatedAction(
  IssueFilter,
  async (data, context) => {
    let q = context.supabase
      .from("tickets")
      .select(
        "id, location_id, title, category, priority, status, sla_due_at, created_at, updated_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    if (data.priority) q = q.eq("priority", data.priority);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "issues.view" } },
);

export const getIssue = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: ticket, error } = await context.supabase
      .from("tickets")
      .select(
        "id, location_id, asset_id, title, description, category, priority, status, sla_due_at, created_at, updated_at, verified_at, verified_by, reported_by, assigned_to",
      )
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (error) throw error;

    const [{ data: location }, { data: asset }, { data: work_orders }] = await Promise.all([
      context.supabase
        .from("locations")
        .select("id, code, name, city")
        .eq("id", ticket.location_id)
        .maybeSingle(),
      ticket.asset_id
        ? context.supabase
            .from("assets")
            .select("id, tag, name, category")
            .eq("id", ticket.asset_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      context.supabase
        .from("work_orders")
        .select("id, title, kind, status, planned_end")
        .eq("ticket_id", data.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    return { ticket, location, asset, work_orders: work_orders ?? [] };
  },
  { auth: { capability: "issues.view" } },
);

export const createIssue = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    title: z.string().min(3).max(200),
    description: z.string().max(4000).optional(),
    priority: TicketPriorityEnum.default("normal"),
    category: z.string().max(100).optional(),
    asset_id: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("tickets")
      .insert({
        location_id: data.location_id,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        category: data.category ?? null,
        asset_id: data.asset_id ?? null,
        reported_by: context.userId,
        sla_due_at: slaForPriority(data.priority),
        status: "open",
      })
      .select("id")
      .single();
    if (error) throw error;
    await context.supabase.rpc("log_audit", {
      _action: "ticket.created",
      _table_name: "tickets",
      _row_id: row.id,
      _location_id: data.location_id,
      _after: { title: data.title, priority: data.priority },
      _metadata: {},
    });
    return { id: row.id };
  },
  { auth: { capability: "issues.create" } },
);

export const updateIssueStatus = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), status: TicketStatusEnum }),
  async (data, context) => {
    if (data.status === "closed") {
      const { data: t } = await context.supabase
        .from("tickets")
        .select("verified_at")
        .eq("id", data.id)
        .single();
      if (!t?.verified_at) throw new Error("Ticket must be verified before closing");
    }
    const patch = {
      status: data.status,
      ...(data.status === "resolved" || data.status === "closed"
        ? { resolved_at: new Date().toISOString() }
        : {}),
    };
    const { error } = await context.supabase.from("tickets").update(patch).eq("id", data.id);
    if (error) throw error;
    await context.supabase.rpc("log_audit", {
      _action: "ticket.status_changed",
      _table_name: "tickets",
      _row_id: data.id,
      _after: { status: data.status },
      _metadata: {},
    });
    return { ok: true };
  },
  { auth: { anyCapability: ["issues.assign", "issues.close"] } },
);

export const verifyIssue = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("tickets")
      .update({
        verified_at: new Date().toISOString(),
        verified_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "issues.close" } },
);

export const addIssuePhoto = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    path: z.string().min(1).max(500),
    kind: z.string().max(40).default("evidence"),
  }),
  async (data, context) => {
    const { data: ticket, error: fetchErr } = await context.supabase
      .from("tickets")
      .select("metadata")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    const meta = (ticket.metadata ?? {}) as Record<string, unknown>;
    const photos = Array.isArray(meta.photos) ? [...meta.photos] : [];
    photos.push({
      path: data.path,
      kind: data.kind,
      uploaded_at: new Date().toISOString(),
      uploaded_by: context.userId,
    });
    const { error } = await context.supabase
      .from("tickets")
      .update({ metadata: { ...meta, photos } })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "issues.create" } },
);

export const listIssuePhotos = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: ticket, error } = await context.supabase
      .from("tickets")
      .select("metadata")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const meta = (ticket.metadata ?? {}) as { photos?: Array<{ path: string; kind?: string }> };
    const photos = meta.photos ?? [];
    const out = await Promise.all(
      photos.map(async (p) => {
        const { data: signed } = await context.supabase.storage
          .from("ticket-photos")
          .createSignedUrl(p.path, 600);
        return { path: p.path, kind: p.kind ?? "evidence", url: signed?.signedUrl ?? null };
      }),
    );
    return out;
  },
  { auth: { capability: "issues.view" } },
);

export const softDeleteIssue = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("tickets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "issues.close" } },
);

export const triageIssueWithAI = createAuthenticatedAction(
  z.object({
    title: z.string().min(3).max(200),
    description: z.string().max(4000).optional(),
  }),
  async (data) => {
    const fallback = { priority: "normal" as const, category: "general", reasoning: "" };
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ...fallback, reasoning: "AI unavailable (no LOVABLE_API_KEY)" };

    const prompt = `You are a front-line ops triage assistant for a Qatar family entertainment centre. Classify this ticket. Reply ONLY with JSON: {"priority":"low|normal|high|urgent","category":"short category","reasoning":"one sentence"}\n\nTitle: ${data.title}\nDescription: ${data.description ?? "(none)"}`;

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!resp.ok) return { ...fallback, reasoning: `AI gateway error ${resp.status}` };
      const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = json.choices?.[0]?.message?.content ?? "{}";
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      const priority = ["low", "normal", "high", "urgent"].includes(parsed.priority)
        ? parsed.priority
        : "normal";
      return {
        priority: priority as "low" | "normal" | "high" | "urgent",
        category: typeof parsed.category === "string" ? parsed.category : "general",
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      };
    } catch (e) {
      return { ...fallback, reasoning: `AI triage failed: ${(e as Error).message}` };
    }
  },
  { auth: { capability: "issues.create" } },
);

export const listAccessibleLocations = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("locations")
    .select("id, code, name, city, region, status")
    .eq("status", "active")
    .order("code");
  if (error) throw error;
  return data ?? [];
}, { auth: { capability: "dashboard.view" } });

export const listAssetsForLocation = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    const { data: rows, error } = await context.supabase
      .from("assets")
      .select("id, tag, name, category, criticality")
      .eq("location_id", data.locationId)
      .is("deleted_at", null)
      .order("tag");
    if (error) throw error;
    return rows ?? [];
  },
  { auth: { capability: "issues.view" } },
);
