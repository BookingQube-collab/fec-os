"use server";

import { z } from "zod";

import { createAuthenticatedAction } from "@/lib/server/create-action";

const ComplaintStatus = z.enum(["new", "investigating", "resolved", "escalated", "dismissed"]);

const ComplaintFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    status: ComplaintStatus.nullable().optional(),
  })
  .default({});

export const listComplaints = createAuthenticatedAction(
  ComplaintFilter,
  async (data, context) => {
    let q = context.supabase
      .from("complaints")
      .select(
        "id, location_id, channel, severity, category, summary, guest_name, guest_contact, status, ai_triage, created_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "customer.view_complaints" } },
);

export const createComplaint = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    channel: z.string().min(1).max(40),
    severity: z.string().min(1).max(20),
    category: z.string().max(100).nullable().optional(),
    summary: z.string().min(3).max(2000),
    guest_name: z.string().max(200).nullable().optional(),
    guest_contact: z.string().max(200).nullable().optional(),
  }),
  async (data, context) => {
    const { data: id, error } = await context.supabase.rpc("create_complaint", {
      _location_id: data.location_id,
      _channel: data.channel,
      _severity: data.severity,
      _category: data.category ?? "general",
      _summary: data.summary,
      _guest_name: data.guest_name ?? undefined,
      _guest_contact: data.guest_contact ?? undefined,
    });
    if (error) throw error;
    return { id: id as string };
  },
  { auth: { capability: "customer.view_complaints" } },
);

export const resolveComplaint = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    resolution_notes: z.string().min(3).max(4000),
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("resolve_complaint", {
      _id: data.id,
      _notes: data.resolution_notes,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "customer.resolve_complaint" } },
);

export const updateComplaintStatus = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: ComplaintStatus,
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("update_complaint_status", {
      _id: data.id,
      _status: data.status,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "customer.resolve_complaint" } },
);

export const triageComplaintWithAI = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    summary: z.string().min(3).max(2000),
    channel: z.string().max(40),
  }),
  async (data, context) => {
    const fallback = {
      category: "general",
      severity: "low" as const,
      sentiment: "neutral" as const,
      suggested_actions: [] as string[],
      reasoning: "",
    };

    const apiKey = process.env.LOVABLE_API_KEY;
    let triage = { ...fallback };
    if (apiKey) {
      const prompt = `You are a guest experience triage assistant. Analyse this complaint and reply ONLY with JSON: {"category":"...","severity":"low|medium|high|critical","sentiment":"neutral|frustrated|angry|satisfied","suggested_actions":["..."],"reasoning":"..."}\n\nChannel: ${data.channel}\nSummary: ${data.summary}`;
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (res.ok) {
          const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const text = j.choices?.[0]?.message?.content ?? "{}";
          const match = text.match(/\{[\s\S]*\}/);
          const parsed = match ? JSON.parse(match[0]) : {};
          triage = {
            category: typeof parsed.category === "string" ? parsed.category : "general",
            severity: ["low", "medium", "high", "critical"].includes(parsed.severity)
              ? parsed.severity
              : "low",
            sentiment: ["neutral", "frustrated", "angry", "satisfied"].includes(parsed.sentiment)
              ? parsed.sentiment
              : "neutral",
            suggested_actions: Array.isArray(parsed.suggested_actions)
              ? parsed.suggested_actions.slice(0, 5).map(String)
              : [],
            reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
          };
        } else {
          triage = { ...fallback, reasoning: "AI gateway error" };
        }
      } catch {
        triage = { ...fallback, reasoning: "AI triage failed" };
      }
    }

    const { error } = await context.supabase.rpc("save_complaint_triage", {
      _id: data.id,
      _triage: triage as never,
    });
    if (error) throw error;
    return triage;
  },
  { auth: { capability: "customer.view_complaints" } },
);
