"use server";

import { z } from "zod";

import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const LocFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  })
  .default({});

function eventStatus(dueDate: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  if (dueDate < today) return "overdue";
  if (dueDate <= soon) return "due_soon";
  return "upcoming";
}

export const listComplianceCalendarEvents = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("compliance_calendar_events")
      .select("id, location_id, title, event_type, due_date, status, owner_id")
      .order("due_date");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.month) {
      const start = `${data.month}-01`;
      const end = new Date(`${data.month}-01T12:00:00Z`);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      q = q.gte("due_date", start).lte("due_date", end.toISOString().slice(0, 10));
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
      : { data: [] };
    const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

    return (rows ?? []).map((r) => ({
      ...r,
      locations: locMap.get(r.location_id) ?? null,
      computed_status: r.status === "completed" ? r.status : eventStatus(r.due_date),
    }));
  },
  { defaultInput: {}, auth: { capability: "compliance.calendar.view" } },
);

export const listComplianceRecurringTasks = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("compliance_recurring_tasks")
      .select("id, location_id, title, task_type, recurrence_rule, next_due_date, reminder_days, active")
      .eq("active", true)
      .order("next_due_date");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "compliance.calendar.view" } },
);

export const createComplianceCalendarEvent = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    title: z.string().min(1).max(200),
    eventType: z.string().min(1).max(100),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().max(1000).optional(),
    reminderDays: z.number().int().min(1).max(365).default(30),
    ownerId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const status = eventStatus(data.dueDate);
    const { data: row, error } = await context.supabase
      .from("compliance_calendar_events")
      .insert({
        location_id: data.locationId,
        title: data.title,
        event_type: data.eventType,
        due_date: data.dueDate,
        description: data.description ?? null,
        reminder_days: data.reminderDays,
        owner_id: data.ownerId ?? context.userId,
        status,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "compliance.calendar.manage" } },
);

export const completeComplianceCalendarEvent = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    proofFilePath: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { data: event, error: fErr } = await context.supabase
      .from("compliance_calendar_events")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fErr) throw fErr;
    await assertLocationAccess(context, event.location_id);

    const { error } = await context.supabase
      .from("compliance_calendar_events")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        proof_file_path: data.proofFilePath ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "compliance.calendar.manage" } },
);

export const getComplianceRiskDashboard = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("compliance_calendar_events")
      .select("id, location_id, title, due_date, status");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: events, error } = await q.not("status", "in", "(completed,renewed)");
    if (error) throw error;

    const locIds = [...new Set((events ?? []).map((e) => e.location_id))];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
      : { data: [] };
    const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

    const today = new Date().toISOString().slice(0, 10);
    const byBranch = new Map<string, { code: string; name: string; overdue: number; due_soon: number }>();

    for (const e of events ?? []) {
      const loc = locMap.get(e.location_id);
      const bucket = byBranch.get(e.location_id) ?? {
        code: loc?.code ?? "—",
        name: loc?.name ?? "—",
        overdue: 0,
        due_soon: 0,
      };
      const st = eventStatus(e.due_date);
      if (st === "overdue") bucket.overdue += 1;
      else if (st === "due_soon") bucket.due_soon += 1;
      byBranch.set(e.location_id, bucket);
    }

    return {
      total_overdue: (events ?? []).filter((e) => e.due_date < today).length,
      total_due_soon: (events ?? []).filter((e) => {
        const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
        return e.due_date >= today && e.due_date <= soon;
      }).length,
      by_branch: [...byBranch.values()].map((b) => ({
        ...b,
        risk_score: b.overdue * 10 + b.due_soon * 3,
      })),
    };
  },
  { defaultInput: {}, auth: { capability: "compliance.calendar.view" } },
);
