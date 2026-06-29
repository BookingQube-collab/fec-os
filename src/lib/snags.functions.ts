"use server";

import { z } from "zod";

import { assertLocationAccess } from "@/lib/server/authorize";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const SNAG_STATUSES = [
  "open", "assigned", "in_progress", "waiting_vendor", "waiting_approval",
  "resolved", "verified", "closed", "reopened",
] as const;

const SNAG_CATEGORIES = [
  "civil", "electrical", "it", "safety", "branding", "flooring", "furniture",
  "game_machine", "cleaning", "mall", "documentation", "other",
] as const;

const LocFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    status: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
  })
  .default({});

export const listSnags = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("snag_items")
      .select("id, snag_number, location_id, raised_at, area, department, category, description, severity, priority, status, target_date, risk_score, vendor_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);
    return (rows ?? []).map((r) => ({
      ...r,
      days_open: Math.max(0, Math.floor((Date.now() - new Date(r.raised_at).getTime()) / 86400000)),
      overdue: r.target_date ? r.target_date < today && !["closed", "verified"].includes(r.status) : false,
    }));
  },
  { defaultInput: {}, auth: { capability: "snags.view" } },
);

export const getSnag = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: snag, error } = await context.supabase
      .from("snag_items")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const [{ data: photos }, { data: history }] = await Promise.all([
      context.supabase.from("snag_photos").select("*").eq("snag_id", data.id).order("created_at"),
      context.supabase.from("snag_status_history").select("*").eq("snag_id", data.id).order("created_at", { ascending: false }),
    ]);

    return { ...snag, photos: photos ?? [], history: history ?? [] };
  },
  { auth: { capability: "snags.view" } },
);

export const createSnag = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    area: z.string().max(100).optional(),
    department: z.string().max(100).optional(),
    category: z.enum(SNAG_CATEGORIES).default("other"),
    description: z.string().min(1).max(2000),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    vendorId: z.string().uuid().optional(),
    assignedTo: z.string().uuid().optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const riskScore = { low: 10, medium: 30, high: 60, critical: 90 }[data.severity];

    const { data: row, error } = await context.supabase
      .from("snag_items")
      .insert({
        location_id: data.locationId,
        area: data.area ?? null,
        department: data.department ?? null,
        category: data.category,
        description: data.description,
        severity: data.severity,
        priority: data.priority,
        target_date: data.targetDate ?? null,
        vendor_id: data.vendorId ?? null,
        assigned_to: data.assignedTo ?? null,
        status: data.assignedTo ? "assigned" : "open",
        risk_score: riskScore,
        created_by: context.userId,
      })
      .select("id, snag_number")
      .single();
    if (error) throw error;

    await context.supabase.from("snag_status_history").insert({
      snag_id: row.id,
      to_status: data.assignedTo ? "assigned" : "open",
      changed_by: context.userId,
      remarks: "Snag created",
    });

    return row;
  },
  { auth: { capability: "snags.create" } },
);

export const updateSnag = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    area: z.string().max(100).optional(),
    department: z.string().max(100).optional(),
    category: z.enum(SNAG_CATEGORIES).optional(),
    description: z.string().min(1).max(2000).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    vendorId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const { data: existing, error: fErr } = await context.supabase
      .from("snag_items")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fErr) throw fErr;
    await assertLocationAccess(context, existing.location_id);

    const updates: Record<string, unknown> = {};
    if (data.area !== undefined) updates.area = data.area || null;
    if (data.department !== undefined) updates.department = data.department || null;
    if (data.category !== undefined) updates.category = data.category;
    if (data.description !== undefined) updates.description = data.description;
    if (data.severity !== undefined) {
      updates.severity = data.severity;
      updates.risk_score = { low: 10, medium: 30, high: 60, critical: 90 }[data.severity];
    }
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.targetDate !== undefined) updates.target_date = data.targetDate;
    if (data.vendorId !== undefined) updates.vendor_id = data.vendorId;

    if (Object.keys(updates).length === 0) return { ok: true };

    const { error } = await context.supabase.from("snag_items").update(updates).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { anyCapability: ["snags.manage", "snags.create"] } },
);

export const updateSnagStatus = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: z.enum(SNAG_STATUSES),
    remarks: z.string().max(500).optional(),
    actionRemarks: z.string().max(2000).optional(),
  }),
  async (data, context) => {
    const { data: existing, error: fErr } = await context.supabase
      .from("snag_items")
      .select("location_id, status")
      .eq("id", data.id)
      .single();
    if (fErr) throw fErr;
    await assertLocationAccess(context, existing.location_id);

    const updates: Record<string, unknown> = { status: data.status };
    if (data.actionRemarks) updates.action_remarks = data.actionRemarks;
    if (["closed", "verified"].includes(data.status)) updates.closure_date = new Date().toISOString().slice(0, 10);
    if (data.status === "verified") updates.verified_by = context.userId;

    const { error } = await context.supabase.from("snag_items").update(updates).eq("id", data.id);
    if (error) throw error;

    await context.supabase.from("snag_status_history").insert({
      snag_id: data.id,
      from_status: existing.status,
      to_status: data.status,
      changed_by: context.userId,
      remarks: data.remarks ?? null,
    });

    return { ok: true };
  },
  { auth: { capability: "snags.manage" } },
);

export const uploadSnagPhoto = createAuthenticatedAction(
  z.object({
    snagId: z.string().uuid(),
    photoType: z.enum(["before", "after"]).default("before"),
    filename: z.string().min(1).max(200),
    dataBase64: z.string().min(10).max(10_000_000),
    contentType: z.string().max(100).default("image/jpeg"),
  }),
  async (data, context) => {
    validateUploadMime(data.contentType, "image");
    validateBase64Size(data.dataBase64, 10 * 1024 * 1024);

    const { data: snag, error: sErr } = await context.supabase
      .from("snag_items")
      .select("location_id")
      .eq("id", data.snagId)
      .single();
    if (sErr) throw sErr;
    await assertLocationAccess(context, snag.location_id);

    const path = `${snag.location_id}/${data.snagId}/${data.photoType}-${Date.now()}-${data.filename}`;
    const bytes = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await context.supabase.storage
      .from("snag-photos")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw upErr;

    await context.supabase.from("snag_photos").insert({
      snag_id: data.snagId,
      photo_type: data.photoType,
      file_path: path,
      file_name: data.filename,
      uploaded_by: context.userId,
    });

    return { path };
  },
  { auth: { anyCapability: ["snags.create", "snags.manage"] } },
);

export const getSnagPhotoUrl = createAuthenticatedAction(
  z.object({ path: z.string().min(1).max(500) }),
  async (data, context) => {
    const { data: signed, error } = await context.supabase.storage
      .from("snag-photos")
      .createSignedUrl(data.path, 600);
    if (error) throw error;
    return { url: signed.signedUrl };
  },
  { auth: { capability: "snags.view" } },
);

export const getSnagDashboard = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("snag_items")
      .select("id, location_id, status, severity, target_date");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;

    const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
      : { data: [] };
    const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

    const today = new Date().toISOString().slice(0, 10);
    const items = rows ?? [];
    const open = items.filter((i) => !["closed", "verified"].includes(i.status));
    const overdue = open.filter((i) => i.target_date && i.target_date < today);

    const byBranch = new Map<string, { code: string; name: string; open: number; overdue: number }>();
    for (const item of open) {
      const loc = locMap.get(item.location_id);
      const key = item.location_id;
      const bucket = byBranch.get(key) ?? { code: loc?.code ?? "—", name: loc?.name ?? "—", open: 0, overdue: 0 };
      bucket.open += 1;
      if (item.target_date && item.target_date < today) bucket.overdue += 1;
      byBranch.set(key, bucket);
    }

    return {
      total_open: open.length,
      total_overdue: overdue.length,
      by_status: SNAG_STATUSES.reduce((acc, s) => {
        acc[s] = items.filter((i) => i.status === s).length;
        return acc;
      }, {} as Record<string, number>),
      by_branch: [...byBranch.values()],
    };
  },
  { defaultInput: {}, auth: { capability: "snags.view" } },
);
