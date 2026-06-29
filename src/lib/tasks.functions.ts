"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";

const CHECKLIST_KINDS = ["opening", "daily", "closing", "supervisor_ops", "hourly", "safety", "custom"] as const;
type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

type ChecklistItemDraft = {
  label: string;
  requires_photo: boolean;
  required: boolean;
};

const BRANCH_CONTEXT: Record<string, string> = {
  KDS: "Kids Driving School — mini electric cars, traffic signs, road safety training for children",
  INFLATAPARK: "Inflatapark — inflatable bounce structures, soft play, party packages",
  "URBAN-ARENA": "Urban Arena — trampolines, ninja courses, dodgeball courts, active play",
  "CRAYONS-VENDOME": "Crayons & Bricks (Vendome Mall) — creative play, LEGO/DUPLO builds, art stations",
  "CRAYONS-DAS": "Crayons & Bricks (Dar Al Salam Mall) — creative play, LEGO/DUPLO builds, art stations",
  CARAOUSEL: "Caraousel — carousel rides, family rides, classic amusement at Aspire Park",
};

function defaultChecklistItems(kind: ChecklistKind, branchCode: string): ChecklistItemDraft[] {
  const branch = branchCode.toUpperCase();
  const isDriving = branch === "KDS";
  const isInflatable = branch === "INFLATAPARK";
  const isUrban = branch === "URBAN-ARENA";
  const isCreative = branch.startsWith("CRAYONS");
  const isCarousel = branch === "CARAOUSEL";

  const opening: ChecklistItemDraft[] = [
    { label: "Unlock entrance and verify signage is lit", requires_photo: false, required: true },
    { label: "Walk the floor — confirm attractions powered and safe", requires_photo: true, required: true },
    { label: "Brief on-duty staff on today's events and VIP bookings", requires_photo: false, required: true },
    { label: "Verify first-aid kit stocked and incident log ready", requires_photo: false, required: true },
  ];
  const closing: ChecklistItemDraft[] = [
    { label: "Confirm all guests exited and wristbands collected", requires_photo: false, required: true },
    { label: "Power down attractions per SOP", requires_photo: true, required: true },
    { label: "Cash reconciliation and POS end-of-day report", requires_photo: true, required: true },
    { label: "Secure premises — alarms, gates, storage locked", requires_photo: false, required: true },
  ];
  const daily: ChecklistItemDraft[] = [
    { label: "Mid-shift safety walk — harnesses, padding, barriers", requires_photo: true, required: true },
    { label: "Queue management and wait-time signage checked", requires_photo: false, required: true },
    { label: "Restock consumables (socks, wristbands, party supplies)", requires_photo: false, required: false },
    { label: "Log any maintenance flags for engineering", requires_photo: false, required: true },
  ];
  const supervisorOps: ChecklistItemDraft[] = [
    { label: "Staff attendance and uniform compliance", requires_photo: false, required: true },
    { label: "Review open issues/tickets from prior shift", requires_photo: false, required: true },
    { label: "Customer complaint follow-ups closed or escalated", requires_photo: false, required: true },
    { label: "Handover notes for duty manager / next supervisor", requires_photo: false, required: true },
  ];

  if (isDriving) {
    opening.push({ label: "Test emergency stop on track vehicles", requires_photo: true, required: true });
    daily.push({ label: "Inspect track barriers and traffic light sequence", requires_photo: true, required: true });
  }
  if (isInflatable) {
    opening.push({ label: "Inflation pressure and anchor straps inspected", requires_photo: true, required: true });
    daily.push({ label: "Sock station sanitised and stock counted", requires_photo: false, required: true });
  }
  if (isUrban) {
    opening.push({ label: "Trampoline springs and padding walk-through", requires_photo: true, required: true });
    daily.push({ label: "Ninja course grip tape and foam pits checked", requires_photo: true, required: true });
  }
  if (isCreative) {
    opening.push({ label: "LEGO/DUPLO stations sorted — choke-hazard sweep", requires_photo: false, required: true });
    daily.push({ label: "Art materials stocked and age labels visible", requires_photo: false, required: true });
  }
  if (isCarousel) {
    opening.push({ label: "Carousel pre-ride mechanical visual check", requires_photo: true, required: true });
    closing.push({ label: "Ride cycle count logged in maintenance book", requires_photo: false, required: true });
  }

  switch (kind) {
    case "opening":
      return opening;
    case "closing":
      return closing;
    case "supervisor_ops":
      return supervisorOps;
    case "daily":
    default:
      return daily;
  }
}

async function callChecklistAi(prompt: string): Promise<ChecklistItemDraft[] | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (lovableKey) {
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (resp.ok) {
        const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content ?? "";
        const items = parseChecklistJson(text);
        if (items.length > 0) return items;
      }
    } catch {
      /* fall through to OpenAI or defaults */
    }
  }

  if (openaiKey) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
        }),
      });
      if (resp.ok) {
        const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content ?? "";
        const items = parseChecklistJson(text);
        if (items.length > 0) return items;
      }
    } catch {
      /* fall through */
    }
  }

  return null;
}

function parseChecklistJson(text: string): ChecklistItemDraft[] {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as {
      items?: Array<{ label?: string; requires_photo?: boolean; required?: boolean }>;
    } | Array<{ label?: string; requires_photo?: boolean; required?: boolean }>;
    const raw = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
    return raw
      .filter((it) => typeof it.label === "string" && it.label.trim().length > 0)
      .slice(0, 25)
      .map((it) => ({
        label: it.label!.trim().slice(0, 200),
        requires_photo: !!it.requires_photo,
        required: it.required !== false,
      }));
  } catch {
    return [];
  }
}

function startOfDayQatar(isoDate: string): string {
  return `${isoDate}T00:00:00+03:00`;
}

function endOfDayQatar(isoDate: string): string {
  return `${isoDate}T23:59:59+03:00`;
}

export const listTaskTemplates = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    let q = context.supabase
      .from("task_templates")
      .select("id, location_id, title, kind, description, active, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "tasks.view" } },
);

export const getTaskTemplate = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: tpl, error } = await context.supabase
      .from("task_templates")
      .select("id, location_id, title, kind, description, active")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: items } = await context.supabase
      .from("task_template_items")
      .select("id, position, label, requires_photo, required")
      .eq("template_id", data.id)
      .order("position");
    return { template: tpl, items: items ?? [] };
  },
  { auth: { capability: "tasks.view" } },
);

export const createTaskTemplate = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    title: z.string().min(3).max(200),
    kind: z.string().min(2).max(40).default("custom"),
    description: z.string().max(2000).optional(),
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(200),
          requires_photo: z.boolean().default(false),
          required: z.boolean().default(true),
        }),
      )
      .min(1)
      .max(100),
  }),
  async (data, context) => {
    const { data: tpl, error } = await context.supabase
      .from("task_templates")
      .insert({
        location_id: data.location_id,
        title: data.title,
        kind: data.kind,
        description: data.description ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    const rows = data.items.map((it, idx) => ({
      template_id: tpl.id,
      position: idx,
      label: it.label,
      requires_photo: it.requires_photo,
      required: it.required,
    }));
    const { error: e2 } = await context.supabase.from("task_template_items").insert(rows);
    if (e2) throw e2;
    await context.supabase.rpc("log_audit", {
      _action: "task.template_created",
      _table_name: "task_templates",
      _row_id: tpl.id,
      _location_id: data.location_id,
      _after: { items: rows.length },
      _metadata: {},
    });
    return { id: tpl.id };
  },
  { auth: { capability: "tasks.manage_templates" } },
);

export const spawnTaskInstance = createAuthenticatedAction(
  z.object({
    template_id: z.string().uuid(),
    due_at: z.string().datetime().optional(),
    assigned_to: z.string().uuid().optional(),
  }),
  async (data, context) => {
    const { data: id, error } = await context.supabase.rpc("spawn_task_instance", {
      _template_id: data.template_id,
      _due_at: data.due_at ?? undefined,
      _assigned_to: data.assigned_to ?? undefined,
    });
    if (error) throw error;
    return { id: id as string };
  },
  { auth: { capability: "tasks.manage_templates" } },
);

export const listTaskInstances = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    status: z.string().nullable().optional(),
  }),
  async (data, context) => {
    let q = context.supabase
      .from("task_instances")
      .select(
        "id, template_id, location_id, title, due_at, status, assigned_to, submitted_at, verified_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "tasks.view" } },
);

export const getTaskInstance = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: inst, error } = await context.supabase
      .from("task_instances")
      .select("id, template_id, location_id, title, due_at, status, submitted_at, verified_at")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: items } = await context.supabase
      .from("task_template_items")
      .select("id, position, label, requires_photo, required")
      .eq("template_id", inst.template_id)
      .order("position");
    const { data: results } = await context.supabase
      .from("task_item_results")
      .select("item_id, checked, photo_path, note, completed_by, completed_at")
      .eq("instance_id", data.id);
    return { instance: inst, items: items ?? [], results: results ?? [] };
  },
  { auth: { capability: "tasks.view" } },
);

export const completeTaskItem = createAuthenticatedAction(
  z.object({
    instance_id: z.string().uuid(),
    item_id: z.string().uuid(),
    checked: z.boolean(),
    photo_path: z.string().max(500).optional(),
    note: z.string().max(2000).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("complete_task_item", {
      _instance_id: data.instance_id,
      _item_id: data.item_id,
      _checked: data.checked,
      _photo_path: data.photo_path ?? undefined,
      _note: data.note ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "tasks.complete" } },
);

export const submitTaskInstance = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("submit_task_instance", { _instance_id: data.id });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "tasks.complete" } },
);

export const uploadTaskPhoto = createAuthenticatedAction(
  z.object({
    instance_id: z.string().uuid(),
    item_id: z.string().uuid(),
    filename: z.string().min(1).max(200),
    data_base64: z.string().min(10).max(10_000_000),
    content_type: z.string().max(100).default("image/jpeg"),
  }),
  async (data, context) => {
    validateUploadMime(data.content_type, "image");
    validateBase64Size(data.data_base64, 10 * 1024 * 1024);
    const path = `${data.instance_id}/${data.item_id}-${Date.now()}-${data.filename}`;
    const bytes = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    const { error } = await context.supabase.storage
      .from("task-photos")
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (error) throw error;
    return { path };
  },
  { auth: { capability: "tasks.complete" } },
);

export const getTaskPhotoUrl = createAuthenticatedAction(
  z.object({ path: z.string().min(1).max(500) }),
  async (data, context) => {
    const { data: signed, error } = await context.supabase.storage
      .from("task-photos")
      .createSignedUrl(data.path, 600);
    if (error) throw error;
    return { url: signed.signedUrl };
  },
  { auth: { capability: "tasks.view" } },
);

export const getTodaysSupervisorChecklists = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (data, context) => {
    const date = data.date ?? new Date().toISOString().slice(0, 10);
    const dayStart = startOfDayQatar(date);
    const dayEnd = endOfDayQatar(date);

    const { data: rows, error } = await context.supabase
      .from("task_instances")
      .select(
        "id, template_id, location_id, title, due_at, status, assigned_to, submitted_at, created_at",
      )
      .eq("location_id", data.locationId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const templateIds = [...new Set((rows ?? []).map((r) => r.template_id))];
    const kindByTemplate = new Map<string, string>();
    if (templateIds.length > 0) {
      const { data: templates } = await context.supabase
        .from("task_templates")
        .select("id, kind")
        .in("id", templateIds);
      for (const t of templates ?? []) kindByTemplate.set(t.id, t.kind);
    }

    return (rows ?? []).map((r) => ({
      id: r.id,
      template_id: r.template_id,
      location_id: r.location_id,
      title: r.title,
      due_at: r.due_at,
      status: r.status,
      assigned_to: r.assigned_to,
      submitted_at: r.submitted_at,
      created_at: r.created_at,
      kind: kindByTemplate.get(r.template_id) ?? "custom",
    }));
  },
  { auth: { capability: "tasks.view" } },
);

export const generateSupervisorChecklist = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    kind: z.enum(["opening", "daily", "closing", "supervisor_ops"]).default("daily"),
    spawn_instance: z.boolean().default(true),
  }),
  async (data, context) => {
    const date = data.date ?? new Date().toISOString().slice(0, 10);

    const { data: loc, error: locErr } = await context.supabase
      .from("locations")
      .select("id, code, name, city, region")
      .eq("id", data.location_id)
      .single();
    if (locErr || !loc) throw new Error("Branch not found");

    const branchContext = BRANCH_CONTEXT[loc.code] ?? `${loc.name} — Qatar family entertainment centre`;
    const prompt = `You are an operations expert for FEC Qatar, a family entertainment centre group in Doha.

Generate a supervisor daily checklist for:
- Branch: ${loc.name} (${loc.code})
- Branch type: ${branchContext}
- Checklist type: ${data.kind}
- Date: ${date}
- Locale: Qatar (Asia/Qatar), currency QAR, bilingual staff common

Reply ONLY with JSON in this exact shape:
{"items":[{"label":"task description","requires_photo":true|false,"required":true|false}]}

Rules:
- 8–14 actionable items supervisors can complete on the floor
- Mix safety, guest experience, staff, and branch-specific checks
- Mark photo proof required for physical/safety verification items (about 30–40% of items)
- Use clear imperative labels (max 120 chars each)
- Tailor items to this branch type — do NOT use generic mall retail tasks`;

    let items = await callChecklistAi(prompt);
    let used_ai = true;
    let ai_note: string | null = null;

    if (!items || items.length === 0) {
      items = defaultChecklistItems(data.kind, loc.code);
      used_ai = false;
      ai_note =
        "AI unavailable — using branch default checklist. Set LOVABLE_API_KEY or OPENAI_API_KEY in .env.local.";
    }

    const title = `${data.kind.replace("_", " ")} checklist — ${loc.code} — ${date}`;
    const description = used_ai
      ? `AI-generated ${data.kind} checklist for ${loc.name}`
      : `Default ${data.kind} checklist for ${loc.name} (AI fallback)`;

    const { data: tpl, error: tplErr } = await context.supabase
      .from("task_templates")
      .insert({
        location_id: data.location_id,
        title,
        kind: data.kind,
        description,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (tplErr) throw tplErr;

    const itemRows = items.map((it, idx) => ({
      template_id: tpl.id,
      position: idx,
      label: it.label,
      requires_photo: it.requires_photo,
      required: it.required,
    }));
    const { error: itemsErr } = await context.supabase.from("task_template_items").insert(itemRows);
    if (itemsErr) throw itemsErr;

    await context.supabase.rpc("log_audit", {
      _action: "task.template_created",
      _table_name: "task_templates",
      _row_id: tpl.id,
      _location_id: data.location_id,
      _after: { items: itemRows.length, ai: used_ai, kind: data.kind },
      _metadata: {},
    });

    let instance_id: string | null = null;
    if (data.spawn_instance) {
      const dueAt = endOfDayQatar(date);
      const { data: instId, error: spawnErr } = await context.supabase.rpc("spawn_task_instance", {
        _template_id: tpl.id,
        _due_at: dueAt,
        _assigned_to: context.userId,
      });
      if (spawnErr) throw spawnErr;
      instance_id = instId as string;
    }

    return {
      template_id: tpl.id,
      instance_id,
      items,
      used_ai,
      ai_note,
      title,
    };
  },
  { auth: { capability: "tasks.generate_ai" } },
);
