"use server";

import { z } from "zod";

import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

export const FACILITY_CATEGORIES = [
  "cleaning", "pest_control", "hvac", "fire_systems", "cctv",
  "mall_approvals", "maintenance_issues", "safety_observations", "site_readiness",
] as const;

const Filter = z.object({
  locationId: z.string().uuid().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
}).default({});

export const listFacilityTasks = createAuthenticatedAction(
  Filter,
  async (data, context) => {
    let q = context.supabase.from("facility_tasks").select("*").order("due_date").limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.category) q = q.eq("category", data.category);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;

    const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code, name, region").in("id", locIds)
      : { data: [] };
    const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

    return (rows ?? []).map((r) => ({
      ...r,
      location_code: locMap.get(r.location_id)?.code ?? "—",
      location_name: locMap.get(r.location_id)?.name ?? "—",
      region: locMap.get(r.location_id)?.region ?? "—",
    }));
  },
  { defaultInput: {}, auth: { capability: "facility.view" } },
);

export const getFacilityDashboard = createAuthenticatedAction(
  Filter,
  async (data, context) => {
    const tasks = await listFacilityTasks(data);
    const today = new Date().toISOString().slice(0, 10);
    const open = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
    const overdue = open.filter((t) => t.due_date && t.due_date < today);
    const readiness = tasks.filter((t) => t.category === "site_readiness");
    const readinessDone = readiness.filter((t) => t.status === "completed").length;
    const readinessScore = readiness.length ? Math.round((readinessDone / readiness.length) * 100) : 100;

    const byCategory = FACILITY_CATEGORIES.reduce((acc, cat) => {
      acc[cat] = open.filter((t) => t.category === cat).length;
      return acc;
    }, {} as Record<string, number>);

    const byRegion = new Map<string, typeof tasks>();
    for (const t of open) {
      const list = byRegion.get(t.region) ?? [];
      list.push(t);
      byRegion.set(t.region, list);
    }

    return {
      open_count: open.length,
      overdue_count: overdue.length,
      site_readiness_score: readinessScore,
      by_category: byCategory,
      by_region: [...byRegion.entries()].map(([region, items]) => ({ region, tasks: items })),
    };
  },
  { defaultInput: {}, auth: { capability: "facility.view" } },
);

export const upsertFacilityTask = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    locationId: z.string().uuid(),
    category: z.enum(FACILITY_CATEGORIES),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    status: z.enum(["open", "in_progress", "completed", "cancelled"]).default("open"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(1000).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const row = {
      location_id: data.locationId,
      category: data.category,
      title: data.title,
      description: data.description ?? null,
      priority: data.priority,
      status: data.status,
      due_date: data.dueDate ?? null,
      notes: data.notes ?? null,
      completed_at: data.status === "completed" ? new Date().toISOString() : null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("facility_tasks").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase.from("facility_tasks").insert(row).select("id").single();
    if (error) throw error;
    return { id: inserted.id };
  },
  { auth: { capability: "facility.manage" } },
);

export const completeFacilityTask = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), notes: z.string().max(500).optional() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("facility_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        notes: data.notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "facility.manage" } },
);
