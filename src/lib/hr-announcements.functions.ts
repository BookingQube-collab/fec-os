"use server";

import { z } from "zod";

import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import { canUserDo } from "@/lib/rbac";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function mapAnnouncement(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    active: Boolean(row.active),
    publishedAt: String(row.published_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdAt: String(row.created_at),
  };
}

export const listAnnouncements = createAuthenticatedAction(
  z.object({ includeInactive: z.boolean().optional() }),
  async (data, context) => {
    const manage = canUserDo(context.roles ?? [], "hr.manage");
    let q = context.supabase
      .from("hr_announcements")
      .select("id, title, body, active, published_at, expires_at, created_at")
      .order("published_at", { ascending: false })
      .limit(50);
    if (!manage || !data.includeInactive) {
      q = q.eq("active", true);
    }
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    const now = Date.now();
    return (rows ?? [])
      .map((r) => mapAnnouncement(r as Record<string, unknown>))
      .filter((a) => {
        if (!a.expiresAt) return true;
        return Date.parse(a.expiresAt) >= now;
      });
  },
  { auth: { anyCapability: ["hr.manage", "hr.employee_app"] } },
);

export const createAnnouncement = createAuthenticatedAction(
  z.object({
    title: z.string().min(2).max(200),
    body: z.string().min(2).max(4000),
    expiresAt: z.string().max(40).optional().nullable(),
  }),
  async (data, context) => {
    const expires =
      data.expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(data.expiresAt)
        ? `${data.expiresAt}T23:59:59.000Z`
        : data.expiresAt || null;
    const { data: row, error } = await context.supabase
      .from("hr_announcements")
      .insert({
        title: data.title,
        body: data.body,
        active: true,
        expires_at: expires,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { capability: "hr.manage" } },
);

export const setAnnouncementActive = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    active: z.boolean(),
  }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("hr_announcements")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "hr.manage" } },
);

export const getOtPolicy = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("hr_ot_policy")
    .select(
      "id, overtime_after_minutes, max_daily_ot_minutes, max_weekly_ot_minutes, requires_preapproval, summary_notes, updated_at",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (tableMissing(error.message)) {
      return {
        id: null as string | null,
        overtimeAfterMinutes: 480,
        maxDailyOtMinutes: null as number | null,
        maxWeeklyOtMinutes: null as number | null,
        requiresPreapproval: false,
        summaryNotes: null as string | null,
        updatedAt: null as string | null,
      };
    }
    throw error;
  }
  return {
    id: data?.id ? String(data.id) : null,
    overtimeAfterMinutes: Number(data?.overtime_after_minutes ?? 480),
    maxDailyOtMinutes: data?.max_daily_ot_minutes != null ? Number(data.max_daily_ot_minutes) : null,
    maxWeeklyOtMinutes: data?.max_weekly_ot_minutes != null ? Number(data.max_weekly_ot_minutes) : null,
    requiresPreapproval: Boolean(data?.requires_preapproval),
    summaryNotes: (data?.summary_notes as string | null) ?? null,
    updatedAt: data?.updated_at ? String(data.updated_at) : null,
  };
}, { auth: { anyCapability: ["hr.manage", "attendance.configure", "people.view_roster"] } });

export const updateOtPolicy = createAuthenticatedAction(
  z.object({
    overtimeAfterMinutes: z.number().int().min(60).max(1440),
    maxDailyOtMinutes: z.number().int().min(0).max(720).nullable().optional(),
    maxWeeklyOtMinutes: z.number().int().min(0).max(3600).nullable().optional(),
    requiresPreapproval: z.boolean(),
    summaryNotes: z.string().max(2000).nullable().optional(),
  }),
  async (data, context) => {
    const payload = {
      overtime_after_minutes: data.overtimeAfterMinutes,
      max_daily_ot_minutes: data.maxDailyOtMinutes ?? null,
      max_weekly_ot_minutes: data.maxWeeklyOtMinutes ?? null,
      requires_preapproval: data.requiresPreapproval,
      summary_notes: data.summaryNotes ?? null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const existing = await context.supabase.from("hr_ot_policy").select("id").limit(1).maybeSingle();
    if (existing.data?.id) {
      const { error } = await context.supabase.from("hr_ot_policy").update(payload).eq("id", existing.data.id);
      if (error) throw error;
      return { id: existing.data.id as string };
    }
    const { data: row, error } = await context.supabase.from("hr_ot_policy").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { capability: "hr.manage" } },
);
