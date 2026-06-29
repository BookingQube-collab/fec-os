"use server";

import { z } from "zod";

import type { AuthContext } from "@/lib/server/create-action";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

const LEADERBOARD_SELECT =
  "id, profile_id, location_id, period_start, period_end, tasks_completed, incidents_resolved, complaints_handled, bookings_created, overall_score, rank, badge, updated_at, profiles:profile_id(display_name, employee_code), locations:location_id(code, name)";

export type LeaderboardRow = {
  id: string;
  profile_id: string;
  location_id: string | null;
  period_start: string;
  period_end: string;
  tasks_completed: number;
  incidents_resolved: number;
  complaints_handled: number;
  bookings_created: number;
  overall_score: number;
  rank: number | null;
  badge: string | null;
  updated_at: string;
  profiles: { display_name: string | null; role: string };
  location: { code: string; name: string } | null;
};

function rollingPeriod() {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  return {
    period_start: since.toISOString().slice(0, 10),
    period_end: new Date().toISOString().slice(0, 10),
  };
}

function mapLeaderboardRow(r: {
  id: string;
  profile_id: string;
  location_id: string | null;
  period_start: string;
  period_end: string;
  tasks_completed: number;
  incidents_resolved: number;
  complaints_handled: number;
  bookings_created: number;
  overall_score: number;
  rank: number | null;
  badge: string | null;
  updated_at: string;
  profiles: { display_name: string | null; employee_code: string | null } | null;
  locations: { code: string; name: string } | null;
}): LeaderboardRow {
  return {
    id: r.id,
    profile_id: r.profile_id,
    location_id: r.location_id,
    period_start: r.period_start,
    period_end: r.period_end,
    tasks_completed: r.tasks_completed,
    incidents_resolved: r.incidents_resolved,
    complaints_handled: r.complaints_handled,
    bookings_created: r.bookings_created,
    overall_score: r.overall_score,
    rank: r.rank,
    badge: r.badge,
    updated_at: r.updated_at,
    profiles: {
      display_name: r.profiles?.display_name ?? null,
      role: r.profiles?.employee_code ?? "staff",
    },
    location: r.locations ? { code: r.locations.code, name: r.locations.name } : null,
  };
}

async function profileMap(context: AuthContext, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, { display_name: string | null; employee_code: string | null }>();
  const { data, error } = await context.supabase
    .from("profiles")
    .select("id, display_name, employee_code")
    .in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p]));
}

export const listLeaderboard = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context): Promise<LeaderboardRow[]> => {
    const { period_start, period_end } = rollingPeriod();

    async function queryPeriod(start: string, end: string) {
      let q = context.supabase
        .from("staff_leaderboard")
        .select(LEADERBOARD_SELECT)
        .eq("period_start", start)
        .eq("period_end", end)
        .order("rank", { ascending: true, nullsFirst: false })
        .order("overall_score", { ascending: false })
        .limit(100);
      if (data.locationId) q = q.eq("location_id", data.locationId);
      const { data: rows, error } = await q;
      if (error) throw error;
      return rows ?? [];
    }

    let rows = await queryPeriod(period_start, period_end);
    if (rows.length === 0) {
      const { data: latest } = await context.supabase
        .from("staff_leaderboard")
        .select("period_start, period_end")
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) rows = await queryPeriod(latest.period_start, latest.period_end);
    }

    return rows.map((r) => mapLeaderboardRow(r));
  },
  { defaultInput: {}, auth: { capability: "leaderboard.view" } },
);

export type StaffActivityKind = "task" | "booking" | "ticket" | "complaint" | "work_order";

export interface StaffActivityItem {
  id: string;
  kind: StaffActivityKind;
  at: string;
  profile_id: string;
  staff_name: string;
  employee_code: string | null;
  location_id: string | null;
  location_label: string | null;
  summary: string;
}

const AUDIT_ACTIONS = [
  "ticket.created",
  "ticket.status_changed",
  "complaint.resolved",
  "work_order.created",
] as const;

function auditSummary(action: string, after: Record<string, unknown> | null): string | null {
  if (action === "ticket.created") {
    const title = after?.title;
    return typeof title === "string" ? `Opened ticket: ${title}` : "Opened a ticket";
  }
  if (action === "ticket.status_changed") {
    const status = after?.status;
    if (status !== "resolved" && status !== "closed") return null;
    return `Closed ticket (${String(status)})`;
  }
  if (action === "complaint.resolved") return "Resolved a guest complaint";
  if (action === "work_order.created") {
    const title = after?.title;
    return typeof title === "string" ? `Created work order: ${title}` : "Created a work order";
  }
  return null;
}

function activityKindForAudit(action: string): StaffActivityKind | null {
  if (action.startsWith("ticket.")) return "ticket";
  if (action === "complaint.resolved") return "complaint";
  if (action === "work_order.created") return "work_order";
  return null;
}

export const listStaffRecentActivity = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    days: z.number().int().min(1).max(30).default(7),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  async (data, context): Promise<StaffActivityItem[]> => {
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const sinceIso = since.toISOString();
    const items: StaffActivityItem[] = [];
    const profileIds: string[] = [];

    const { data: tasks, error: taskErr } = await context.supabase
      .from("task_item_results")
      .select(
        "id, completed_at, completed_by, task_template_items:item_id(label), task_instances:instance_id(location_id, title, locations:location_id(code, name))",
      )
      .not("completed_at", "is", null)
      .not("completed_by", "is", null)
      .gte("completed_at", sinceIso)
      .order("completed_at", { ascending: false })
      .limit(data.limit * 2);
    if (taskErr) throw taskErr;

    for (const row of tasks ?? []) {
      const inst = row.task_instances as {
        location_id: string;
        title: string | null;
        locations: { code: string; name: string } | null;
      } | null;
      const item = row.task_template_items as { label: string } | null;
      const locId = inst?.location_id ?? null;
      if (data.locationId && locId !== data.locationId) continue;
      const loc = inst?.locations;
      const profileId = row.completed_by as string;
      profileIds.push(profileId);
      items.push({
        id: `task:${row.id}`,
        kind: "task",
        at: row.completed_at as string,
        profile_id: profileId,
        staff_name: "Staff",
        employee_code: null,
        location_id: locId,
        location_label: loc ? `${loc.code} — ${loc.name}` : null,
        summary: item?.label ? `Completed checklist: ${item.label}` : "Completed checklist item",
      });
    }

    let bookQ = context.supabase
      .from("bookings")
      .select("id, created_at, reference, contact_name, created_by, location_id, locations:location_id(code, name)")
      .not("created_by", "is", null)
      .gte("created_at", sinceIso)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.locationId) bookQ = bookQ.eq("location_id", data.locationId);
    const { data: bookings, error: bookErr } = await bookQ;
    if (bookErr) throw bookErr;

    for (const row of bookings ?? []) {
      const loc = row.locations as { code: string; name: string } | null;
      const profileId = row.created_by as string;
      profileIds.push(profileId);
      items.push({
        id: `booking:${row.id}`,
        kind: "booking",
        at: row.created_at,
        profile_id: profileId,
        staff_name: "Staff",
        employee_code: null,
        location_id: row.location_id,
        location_label: loc ? `${loc.code} — ${loc.name}` : null,
        summary: `Created booking ${row.reference} (${row.contact_name})`,
      });
    }

    let auditQ = context.supabase
      .from("audit_log")
      .select("id, action, created_at, actor_id, location_id, after, locations:location_id(code, name)")
      .not("actor_id", "is", null)
      .gte("created_at", sinceIso)
      .in("action", [...AUDIT_ACTIONS])
      .order("created_at", { ascending: false })
      .limit(data.limit * 2);
    if (data.locationId) auditQ = auditQ.eq("location_id", data.locationId);
    const { data: audits, error: auditErr } = await auditQ;
    if (auditErr) throw auditErr;

    for (const row of audits ?? []) {
      const after = row.after as Record<string, unknown> | null;
      const summary = auditSummary(row.action, after);
      const kind = activityKindForAudit(row.action);
      if (!summary || !kind) continue;
      const loc = row.locations as { code: string; name: string } | null;
      const profileId = row.actor_id as string;
      profileIds.push(profileId);
      items.push({
        id: `audit:${row.id}`,
        kind,
        at: row.created_at,
        profile_id: profileId,
        staff_name: "Staff",
        employee_code: null,
        location_id: row.location_id,
        location_label: loc ? `${loc.code} — ${loc.name}` : null,
        summary,
      });
    }

    const profiles = await profileMap(context, profileIds);
    for (const item of items) {
      const profile = profiles.get(item.profile_id);
      if (profile) {
        item.staff_name = profile.display_name ?? "Staff";
        item.employee_code = profile.employee_code;
      }
    }

    items.sort((a, b) => b.at.localeCompare(a.at));
    return items.slice(0, data.limit);
  },
  { defaultInput: {}, auth: { capability: "leaderboard.view" } },
);

export const refreshLeaderboard = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase.rpc("refresh_leaderboard_scores");
  if (error) throw error;
  return { count: typeof data === "number" ? data : 0 };
}, { auth: { capability: "leaderboard.view" } });
