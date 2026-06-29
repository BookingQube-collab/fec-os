import "server-only";

import { monthStartInQatar, todayInQatar } from "@/lib/integrations/bookingqube";
import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";

export interface MaintenanceWeeklyReportFilters {
  locationId?: string | null;
  weekStart?: string | null;
}

export interface MaintenanceWeeklyReportPayload {
  week_start: string;
  week_end: string;
  location_code: string | null;
  summary: {
    raised: number;
    completed: number;
    pending: number;
    overdue: number;
    sla_compliance_pct: number;
    avg_resolution_hours: number;
    pm_completed: number;
    pm_pending: number;
  };
  issues_by_location: Array<{ code: string; count: number }>;
  issues_by_category: Array<{ category: string; count: number }>;
  technician_performance: Array<{
    user_id: string;
    display_name: string;
    completed: number;
    open: number;
    avg_hours: number;
  }>;
  material_consumption: Array<{ item_name: string; quantity: number }>;
  repeated_issues: Array<{ title: string; count: number }>;
  major_breakdowns: Array<{ title: string; downtime_hours: number; location_code: string }>;
  recommendations: string[];
  action_plan: string[];
}

function weekBounds(weekStart?: string | null): { start: string; end: string } {
  if (weekStart) {
    const start = new Date(`${weekStart}T12:00:00+03:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: weekStart, end: end.toISOString().slice(0, 10) };
  }
  const today = todayInQatar();
  const d = new Date(`${today}T12:00:00+03:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const start = d.toISOString().slice(0, 10);
  const endD = new Date(d);
  endD.setDate(endD.getDate() + 6);
  return { start, end: endD.toISOString().slice(0, 10) };
}

export async function fetchMaintenanceWeeklyReport(
  context: AuthContext,
  filters: MaintenanceWeeklyReportFilters = {},
): Promise<MaintenanceWeeklyReportPayload> {
  const timer = createTimer("fetchMaintenanceWeeklyReport", "maintenance-weekly");
  const { start, end } = weekBounds(filters.weekStart);
  const startIso = `${start}T00:00:00`;
  const endIso = `${end}T23:59:59`;

  let locQ = context.supabase.from("locations").select("id, code").in("status", ["active", "maintenance"]);
  if (filters.locationId) locQ = locQ.eq("id", filters.locationId);
  const { data: locations, error: locErr } = await locQ;
  if (locErr) throw locErr;

  const locationIds = (locations ?? []).map((l) => l.id);
  const codeById = new Map((locations ?? []).map((l) => [l.id, l.code]));

  if (!locationIds.length) {
    timer.end({ rowCount: 0 });
    return emptyReport(start, end);
  }

  const [
    { data: weekOrders },
    { data: pmSchedules },
    { data: downtime },
    { data: deliveryItems },
    { data: requests },
  ] = await Promise.all([
    context.supabase
      .from("work_orders")
      .select(
        "id, title, status, priority, location_id, issue_category, assigned_to, created_at, actual_start, actual_end, sla_due_at, sla_breached, sla_completed_within_sla",
      )
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    context.supabase
      .from("pm_schedules")
      .select("id, title, active, next_due_at, last_generated_at, location_id")
      .in("location_id", locationIds),
    context.supabase
      .from("downtime_events")
      .select("id, reason, location_id, duration_minutes, started_at")
      .in("location_id", locationIds)
      .gte("started_at", startIso)
      .lte("started_at", endIso),
    context.supabase
      .from("delivery_request_items")
      .select("item_name, quantity_dispatched, delivery_request_id")
      .not("quantity_dispatched", "is", null),
    context.supabase
      .from("maintenance_requests")
      .select("id, category, description, location_id, created_at")
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  const orders = weekOrders ?? [];
  const completed = orders.filter((o) => o.status === "completed");
  const pending = orders.filter((o) => !["completed", "cancelled"].includes(o.status));
  const now = Date.now();
  const overdue = pending.filter(
    (o) => o.sla_due_at && new Date(o.sla_due_at).getTime() < now,
  );

  const slaEligible = completed.filter((o) => o.sla_completed_within_sla != null);
  const slaMet = slaEligible.filter((o) => o.sla_completed_within_sla).length;
  const slaCompliance = slaEligible.length
    ? Math.round((slaMet / slaEligible.length) * 100)
    : 100;

  const resolutionHours = completed
    .filter((o) => o.actual_start && o.actual_end)
    .map((o) => {
      const ms =
        new Date(o.actual_end!).getTime() - new Date(o.actual_start!).getTime();
      return ms / (1000 * 60 * 60);
    });
  const avgResolution =
    resolutionHours.length > 0
      ? Math.round((resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length) * 10) / 10
      : 0;

  const locCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();
  for (const o of orders) {
    const code = codeById.get(o.location_id) ?? "—";
    locCounts.set(code, (locCounts.get(code) ?? 0) + 1);
    const cat = o.issue_category?.trim() || "Uncategorized";
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  for (const r of requests ?? []) {
    const code = codeById.get(r.location_id) ?? "—";
    locCounts.set(code, (locCounts.get(code) ?? 0) + 1);
    catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
  }

  const techMap = new Map<string, { completed: number; open: number; hours: number[] }>();
  for (const o of orders) {
    if (!o.assigned_to) continue;
    const bucket = techMap.get(o.assigned_to) ?? { completed: 0, open: 0, hours: [] };
    if (o.status === "completed") {
      bucket.completed += 1;
      if (o.actual_start && o.actual_end) {
        bucket.hours.push(
          (new Date(o.actual_end).getTime() - new Date(o.actual_start).getTime()) / (1000 * 60 * 60),
        );
      }
    } else if (!["cancelled"].includes(o.status)) {
      bucket.open += 1;
    }
    techMap.set(o.assigned_to, bucket);
  }

  const techIds = [...techMap.keys()];
  const { data: profiles } = techIds.length
    ? await context.supabase.from("profiles").select("id, display_name").in("id", techIds)
    : { data: [] };
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? "Unknown"]));

  const activePm = (pmSchedules ?? []).filter((p) => p.active);
  const pmCompleted = activePm.filter(
    (p) => p.last_generated_at && p.last_generated_at >= startIso && p.last_generated_at <= endIso,
  ).length;
  const pmPending = activePm.filter((p) => p.next_due_at <= endIso).length;

  const titleCounts = new Map<string, number>();
  for (const o of orders) {
    const key = o.title.toLowerCase().trim();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const materialMap = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    if (!item.quantity_dispatched) continue;
    materialMap.set(
      item.item_name,
      (materialMap.get(item.item_name) ?? 0) + Number(item.quantity_dispatched),
    );
  }

  const majorBreakdowns = (downtime ?? [])
    .map((d) => ({
      title: d.reason,
      downtime_hours: Math.round(((d.duration_minutes ?? 0) / 60) * 10) / 10,
      location_code: codeById.get(d.location_id) ?? "—",
    }))
    .filter((d) => d.downtime_hours >= 2)
    .sort((a, b) => b.downtime_hours - a.downtime_hours)
    .slice(0, 10);

  const recommendations: string[] = [];
  if (overdue.length > 0) {
    recommendations.push(`Address ${overdue.length} overdue job(s) immediately.`);
  }
  if (slaCompliance < 90) {
    recommendations.push(`SLA compliance at ${slaCompliance}% — review urgent priority staffing.`);
  }
  if (pmPending > 0) {
    recommendations.push(`${pmPending} PM task(s) due — schedule preventive work.`);
  }

  const actionPlan: string[] = [];
  if (overdue.length) actionPlan.push("Prioritize overdue work orders in daily standup.");
  if (majorBreakdowns.length) actionPlan.push("Review major breakdown root causes with vendors.");
  actionPlan.push("Confirm material stock for high-consumption items.");

  const payload: MaintenanceWeeklyReportPayload = {
    week_start: start,
    week_end: end,
    location_code: filters.locationId ? (codeById.get(filters.locationId) ?? null) : null,
    summary: {
      raised: orders.length + (requests?.length ?? 0),
      completed: completed.length,
      pending: pending.length,
      overdue: overdue.length,
      sla_compliance_pct: slaCompliance,
      avg_resolution_hours: avgResolution,
      pm_completed: pmCompleted,
      pm_pending: pmPending,
    },
    issues_by_location: [...locCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    issues_by_category: [...catCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    technician_performance: [...techMap.entries()]
      .map(([user_id, stats]) => ({
        user_id,
        display_name: nameMap.get(user_id) ?? "Unknown",
        completed: stats.completed,
        open: stats.open,
        avg_hours:
          stats.hours.length > 0
            ? Math.round((stats.hours.reduce((a, b) => a + b, 0) / stats.hours.length) * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.completed - a.completed),
    material_consumption: [...materialMap.entries()]
      .map(([item_name, quantity]) => ({ item_name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 15),
    repeated_issues: [...titleCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    major_breakdowns: majorBreakdowns,
    recommendations,
    action_plan: actionPlan,
  };

  timer.end({ rowCount: orders.length });
  return payload;
}

function emptyReport(start: string, end: string): MaintenanceWeeklyReportPayload {
  return {
    week_start: start,
    week_end: end,
    location_code: null,
    summary: {
      raised: 0,
      completed: 0,
      pending: 0,
      overdue: 0,
      sla_compliance_pct: 100,
      avg_resolution_hours: 0,
      pm_completed: 0,
      pm_pending: 0,
    },
    issues_by_location: [],
    issues_by_category: [],
    technician_performance: [],
    material_consumption: [],
    repeated_issues: [],
    major_breakdowns: [],
    recommendations: ["No maintenance activity recorded for this period."],
    action_plan: ["Continue routine PM schedule."],
  };
}
