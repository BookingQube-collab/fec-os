import { monthStartInQatar, todayInQatar } from "@/lib/integrations/bookingqube";
import { isNearSlaBreach, isSlaOverdue } from "@/lib/maintenance/sla";
import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";

export interface MaintenanceDashboardFilters {
  locationId?: string | null;
}

export interface MaintenanceDashboardKpis {
  work_orders_open: number;
  work_orders_in_progress: number;
  work_orders_on_hold: number;
  work_orders_overdue: number;
  work_orders_urgent: number;
  work_orders_near_sla_breach: number;
  sla_compliance_pct: number;
  work_orders_completed_month: number;
  weekly_completion_rate_pct: number;
  assets_total: number;
  assets_heartbeat_missed: number;
  assets_warranty_expiring: number;
  pm_active: number;
  pm_overdue: number;
  pm_due_this_week: number;
  downtime_hours_month: number;
  downtime_active: number;
  pending_deliveries: number;
  material_requests_month: number;
}

export interface MaintenanceDashboardPayload {
  kpis: MaintenanceDashboardKpis;
  work_orders_by_status: Array<{ status: string; count: number }>;
  work_orders_by_kind: Array<{ kind: string; count: number }>;
  assets_by_criticality: Array<{ criticality: string; count: number }>;
  assets_by_category: Array<{ category: string; count: number }>;
  work_orders_trend: Array<{ week: string; created: number; completed: number }>;
  downtime_by_location: Array<{ code: string; hours: number; events: number }>;
  technician_workload: Array<{
    user_id: string;
    display_name: string;
    open_count: number;
    in_progress_count: number;
  }>;
  overdue_work_orders: Array<{
    id: string;
    title: string;
    status: string;
    planned_end: string | null;
    kind: string;
    priority: string;
    job_order_number: string | null;
    sla_due_at: string | null;
    sla_breached: boolean;
  }>;
  near_sla_breach: Array<{
    id: string;
    title: string;
    job_order_number: string | null;
    sla_due_at: string;
    priority: string;
  }>;
  jobs_by_location: Array<{ code: string; count: number }>;
  delivery_status: Array<{ status: string; count: number }>;
  pm_calendar: Array<{ id: string; title: string; next_due_at: string; overdue: boolean }>;
  recent_activities: Array<{
    id: string;
    type: string;
    label: string;
    at: string;
  }>;
  overdue_pm: Array<{ id: string; title: string; next_due_at: string }>;
  active_downtime: Array<{
    id: string;
    reason: string;
    started_at: string;
    duration_minutes: number | null;
    location_code: string;
  }>;
  recent_work_orders: Array<{
    id: string;
    title: string;
    status: string;
    kind: string;
    created_at: string;
    planned_end: string | null;
  }>;
}

const OPEN_STATUSES = ["planned", "in_progress", "on_hold"] as const;

function weekLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function trendBucketsStartIso(today: string): string {
  const d = new Date(`${today}T12:00:00+03:00`);
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function downtimeHours(events: Array<{ duration_minutes: number | null; started_at: string; ended_at: string | null }>): number {
  const now = Date.now();
  return events.reduce((acc, e) => {
    if (e.duration_minutes != null) return acc + e.duration_minutes / 60;
    const start = new Date(e.started_at).getTime();
    return acc + (now - start) / (1000 * 60 * 60);
  }, 0);
}

export async function fetchMaintenanceDashboard(
  context: AuthContext,
  filters: MaintenanceDashboardFilters = {},
): Promise<MaintenanceDashboardPayload> {
  const timer = createTimer("fetchMaintenanceDashboard", "maintenance-dashboard");
  const today = todayInQatar();
  const monthStart = monthStartInQatar(today);
  const now = new Date().toISOString();

  const weekEnd = new Date(`${today}T12:00:00+03:00`);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = weekEnd.toISOString();

  const warrantyHorizon = new Date(`${today}T12:00:00+03:00`);
  warrantyHorizon.setDate(warrantyHorizon.getDate() + 30);
  const warrantyHorizonIso = warrantyHorizon.toISOString().slice(0, 10);

  const trendStart = new Date(`${today}T12:00:00+03:00`);
  trendStart.setDate(trendStart.getDate() - 56);
  const trendStartIso = trendStart.toISOString();

  let locQ = context.supabase.from("locations").select("id, code").in("status", ["active", "maintenance"]);
  if (filters.locationId) locQ = locQ.eq("id", filters.locationId);
  const { data: locations, error: locErr } = await locQ;
  if (locErr) throw locErr;

  const locationIds = (locations ?? []).map((l) => l.id);
  const locationCodeById = new Map((locations ?? []).map((l) => [l.id, l.code]));
  const empty = locationIds.length === 0;

  if (empty) {
    timer.end({ rowCount: 0 });
    return {
      kpis: {
        work_orders_open: 0,
        work_orders_in_progress: 0,
        work_orders_on_hold: 0,
        work_orders_overdue: 0,
        work_orders_urgent: 0,
        work_orders_near_sla_breach: 0,
        sla_compliance_pct: 100,
        work_orders_completed_month: 0,
        weekly_completion_rate_pct: 0,
        assets_total: 0,
        assets_heartbeat_missed: 0,
        assets_warranty_expiring: 0,
        pm_active: 0,
        pm_overdue: 0,
        pm_due_this_week: 0,
        downtime_hours_month: 0,
        downtime_active: 0,
        pending_deliveries: 0,
        material_requests_month: 0,
      },
      work_orders_by_status: [],
      work_orders_by_kind: [],
      assets_by_criticality: [],
      assets_by_category: [],
      work_orders_trend: [],
      downtime_by_location: [],
      technician_workload: [],
      overdue_work_orders: [],
      near_sla_breach: [],
      jobs_by_location: [],
      delivery_status: [],
      pm_calendar: [],
      recent_activities: [],
      overdue_pm: [],
      active_downtime: [],
      recent_work_orders: [],
    };
  }

  const [
    { data: openWorkOrders },
    { count: completedMonthCount },
    { data: trendCreated },
    { data: trendCompleted },
    { data: assets },
    { data: pmSchedules },
    { data: downtimeMonth },
    { data: activeDowntimeRows },
    { data: recentWorkOrders },
    { data: deliveryRows },
    { count: monthRequestsCount },
    { count: weekCompleted },
    { count: weekCreated },
    { data: slaCompletedMonth },
  ] = await Promise.all([
    context.supabase
      .from("work_orders")
      .select("id, title, kind, status, planned_end, assigned_to, location_id, created_at, priority, job_order_number, sla_due_at, sla_breached")
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .in("status", [...OPEN_STATUSES]),
    context.supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .eq("status", "completed")
      .gte("actual_end", `${monthStart}T00:00:00`),
    context.supabase
      .from("work_orders")
      .select("created_at")
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .gte("created_at", trendStartIso),
    context.supabase
      .from("work_orders")
      .select("actual_end")
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .eq("status", "completed")
      .gte("actual_end", trendStartIso),
    context.supabase
      .from("assets")
      .select("id, category, criticality, last_heartbeat_at, heartbeat_interval_minutes, warranty_expires_on")
      .in("location_id", locationIds)
      .is("deleted_at", null),
    context.supabase
      .from("pm_schedules")
      .select("id, title, next_due_at, active")
      .in("location_id", locationIds),
    context.supabase
      .from("downtime_events")
      .select("id, location_id, duration_minutes, started_at, ended_at")
      .in("location_id", locationIds)
      .gte("started_at", `${monthStart}T00:00:00`),
    context.supabase
      .from("downtime_events")
      .select("id, location_id, reason, started_at, duration_minutes")
      .in("location_id", locationIds)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(20),
    context.supabase
      .from("work_orders")
      .select("id, title, status, kind, created_at, planned_end")
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
    context.supabase
      .from("delivery_requests")
      .select("status")
      .in("location_id", locationIds)
      .is("deleted_at", null),
    context.supabase
      .from("maintenance_requests")
      .select("id", { count: "exact", head: true })
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .gte("created_at", `${monthStart}T00:00:00`),
    context.supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .eq("status", "completed")
      .gte("actual_end", trendBucketsStartIso(today)),
    context.supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .gte("created_at", trendBucketsStartIso(today)),
    context.supabase
      .from("work_orders")
      .select("sla_completed_within_sla")
      .in("location_id", locationIds)
      .is("deleted_at", null)
      .eq("status", "completed")
      .gte("actual_end", `${monthStart}T00:00:00`)
      .not("sla_completed_within_sla", "is", null),
  ]);

  const openRows = openWorkOrders ?? [];
  const nowMs = Date.now();
  const overdueRows = openRows.filter(
    (w) =>
      isSlaOverdue(w.sla_due_at, w.status, nowMs) ||
      Boolean(w.planned_end && w.planned_end < now),
  );
  const nearBreachRows = openRows.filter(
    (w) => w.sla_due_at && isNearSlaBreach(w.sla_due_at, nowMs) && !isSlaOverdue(w.sla_due_at, w.status, nowMs),
  );
  const urgentRows = openRows.filter((w) => w.priority === "urgent");

  const slaMonth = slaCompletedMonth ?? [];
  const slaMet = slaMonth.filter((w) => w.sla_completed_within_sla).length;
  const slaCompliance = slaMonth.length ? Math.round((slaMet / slaMonth.length) * 100) : 100;

  const weekCreatedCount = weekCreated ?? 0;
  const weekCompletedCount = weekCompleted ?? 0;
  const weeklyRate =
    weekCreatedCount > 0 ? Math.round((weekCompletedCount / weekCreatedCount) * 100) : 0;

  const locJobCounts = new Map<string, number>();
  for (const w of openRows) {
    const code = locationCodeById.get(w.location_id) ?? "—";
    locJobCounts.set(code, (locJobCounts.get(code) ?? 0) + 1);
  }

  const deliveryStatusMap = new Map<string, number>();
  let pendingDeliveries = 0;
  for (const d of deliveryRows ?? []) {
    deliveryStatusMap.set(d.status, (deliveryStatusMap.get(d.status) ?? 0) + 1);
    if (!["completed", "rejected"].includes(d.status)) pendingDeliveries += 1;
  }

  const recentActivities: MaintenanceDashboardPayload["recent_activities"] = [];
  for (const w of recentWorkOrders ?? []) {
    recentActivities.push({
      id: w.id,
      type: "work_order",
      label: w.title,
      at: w.created_at,
    });
  }
  recentActivities.sort((a, b) => b.at.localeCompare(a.at));

  const statusCounts = new Map<string, number>();
  const kindCounts = new Map<string, number>();
  for (const w of openRows) {
    statusCounts.set(w.status, (statusCounts.get(w.status) ?? 0) + 1);
    kindCounts.set(w.kind, (kindCounts.get(w.kind) ?? 0) + 1);
  }

  const critCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();
  let heartbeatMissed = 0;
  let warrantyExpiring = 0;

  for (const a of assets ?? []) {
    critCounts.set(a.criticality, (critCounts.get(a.criticality) ?? 0) + 1);
    const cat = a.category?.trim() || "Uncategorized";
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);

    if (a.heartbeat_interval_minutes && a.heartbeat_interval_minutes > 0) {
      const last = a.last_heartbeat_at ? new Date(a.last_heartbeat_at).getTime() : 0;
      const threshold = a.heartbeat_interval_minutes * 60 * 1000 * 1.5;
      if (!last || nowMs - last > threshold) heartbeatMissed += 1;
    }

    if (
      a.warranty_expires_on &&
      a.warranty_expires_on >= today &&
      a.warranty_expires_on <= warrantyHorizonIso
    ) {
      warrantyExpiring += 1;
    }
  }

  const activePm = (pmSchedules ?? []).filter((p) => p.active);
  const overduePm = activePm.filter((p) => p.next_due_at < now);
  const dueThisWeek = activePm.filter(
    (p) => p.next_due_at >= now && p.next_due_at <= weekEndIso,
  );

  const pmCalendar = activePm
    .sort((a, b) => a.next_due_at.localeCompare(b.next_due_at))
    .slice(0, 14)
    .map((p) => ({
      id: p.id,
      title: p.title,
      next_due_at: p.next_due_at,
      overdue: p.next_due_at < now,
    }));

  const workloadMap = new Map<string, { open: number; in_progress: number }>();
  for (const w of openRows) {
    if (!w.assigned_to) continue;
    const bucket = workloadMap.get(w.assigned_to) ?? { open: 0, in_progress: 0 };
    if (w.status === "in_progress") bucket.in_progress += 1;
    else bucket.open += 1;
    workloadMap.set(w.assigned_to, bucket);
  }

  const assigneeIds = [...workloadMap.keys()];
  const { data: profiles } =
    assigneeIds.length > 0
      ? await context.supabase.from("profiles").select("id, display_name").in("id", assigneeIds)
      : { data: [] as Array<{ id: string; display_name: string | null }> };

  const profileName = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? "Unknown"]));

  const technician_workload = [...workloadMap.entries()]
    .map(([user_id, counts]) => ({
      user_id,
      display_name: profileName.get(user_id) ?? "Unknown",
      open_count: counts.open,
      in_progress_count: counts.in_progress,
    }))
    .sort((a, b) => b.open_count + b.in_progress_count - (a.open_count + a.in_progress_count))
    .slice(0, 10);

  const downtimeLocMap = new Map<string, { hours: number; events: number }>();
  for (const d of downtimeMonth ?? []) {
    const code = locationCodeById.get(d.location_id) ?? "—";
    const bucket = downtimeLocMap.get(code) ?? { hours: 0, events: 0 };
    bucket.events += 1;
    bucket.hours += downtimeHours([d]);
    downtimeLocMap.set(code, bucket);
  }

  const trendBuckets: Array<{ start: string; label: string }> = [];
  for (let i = 7; i >= 0; i -= 1) {
    const d = new Date(`${today}T12:00:00+03:00`);
    d.setDate(d.getDate() - i * 7);
    const start = d.toISOString().slice(0, 10);
    trendBuckets.push({ start, label: weekLabel(start) });
  }

  function weekIndex(iso: string): number {
    const t = new Date(iso).getTime();
    for (let i = trendBuckets.length - 1; i >= 0; i -= 1) {
      const start = new Date(`${trendBuckets[i]!.start}T00:00:00`).getTime();
      const end = start + 7 * 24 * 60 * 60 * 1000;
      if (t >= start && t < end) return i;
    }
    return -1;
  }

  const trendCreatedCounts = new Array(trendBuckets.length).fill(0);
  const trendCompletedCounts = new Array(trendBuckets.length).fill(0);
  for (const w of trendCreated ?? []) {
    const idx = weekIndex(w.created_at);
    if (idx >= 0) trendCreatedCounts[idx] += 1;
  }
  for (const w of trendCompleted ?? []) {
    if (!w.actual_end) continue;
    const idx = weekIndex(w.actual_end);
    if (idx >= 0) trendCompletedCounts[idx] += 1;
  }

  const payload: MaintenanceDashboardPayload = {
    kpis: {
      work_orders_open: openRows.filter((w) => w.status === "planned").length,
      work_orders_in_progress: openRows.filter((w) => w.status === "in_progress").length,
      work_orders_on_hold: openRows.filter((w) => w.status === "on_hold").length,
      work_orders_overdue: overdueRows.length,
      work_orders_urgent: urgentRows.length,
      work_orders_near_sla_breach: nearBreachRows.length,
      sla_compliance_pct: slaCompliance,
      work_orders_completed_month: completedMonthCount ?? 0,
      weekly_completion_rate_pct: weeklyRate,
      assets_total: (assets ?? []).length,
      assets_heartbeat_missed: heartbeatMissed,
      assets_warranty_expiring: warrantyExpiring,
      pm_active: activePm.length,
      pm_overdue: overduePm.length,
      pm_due_this_week: dueThisWeek.length,
      downtime_hours_month: Math.round(downtimeHours(downtimeMonth ?? []) * 10) / 10,
      downtime_active: (activeDowntimeRows ?? []).length,
      pending_deliveries: pendingDeliveries,
      material_requests_month: monthRequestsCount ?? 0,
    },
    work_orders_by_status: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    work_orders_by_kind: [...kindCounts.entries()].map(([kind, count]) => ({ kind, count })),
    assets_by_criticality: [...critCounts.entries()].map(([criticality, count]) => ({ criticality, count })),
    assets_by_category: [...catCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    work_orders_trend: trendBuckets.map((b, i) => ({
      week: b.label,
      created: trendCreatedCounts[i] ?? 0,
      completed: trendCompletedCounts[i] ?? 0,
    })),
    downtime_by_location: [...downtimeLocMap.entries()]
      .map(([code, v]) => ({ code, hours: Math.round(v.hours * 10) / 10, events: v.events }))
      .sort((a, b) => b.hours - a.hours),
    technician_workload,
    overdue_work_orders: overdueRows
      .sort((a, b) => (a.sla_due_at ?? a.planned_end ?? "").localeCompare(b.sla_due_at ?? b.planned_end ?? ""))
      .slice(0, 10)
      .map((w) => ({
        id: w.id,
        title: w.title,
        status: w.status,
        planned_end: w.planned_end,
        kind: w.kind,
        priority: w.priority ?? "normal",
        job_order_number: w.job_order_number,
        sla_due_at: w.sla_due_at,
        sla_breached: Boolean(w.sla_breached),
      })),
    near_sla_breach: nearBreachRows
      .sort((a, b) => (a.sla_due_at ?? "").localeCompare(b.sla_due_at ?? ""))
      .slice(0, 10)
      .map((w) => ({
        id: w.id,
        title: w.title,
        job_order_number: w.job_order_number,
        sla_due_at: w.sla_due_at!,
        priority: w.priority ?? "normal",
      })),
    jobs_by_location: [...locJobCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    delivery_status: [...deliveryStatusMap.entries()].map(([status, count]) => ({ status, count })),
    pm_calendar: pmCalendar,
    recent_activities: recentActivities.slice(0, 15),
    overdue_pm: overduePm
      .sort((a, b) => a.next_due_at.localeCompare(b.next_due_at))
      .slice(0, 10)
      .map((p) => ({ id: p.id, title: p.title, next_due_at: p.next_due_at })),
    active_downtime: (activeDowntimeRows ?? []).map((d) => ({
      id: d.id,
      reason: d.reason,
      started_at: d.started_at,
      duration_minutes: d.duration_minutes,
      location_code: locationCodeById.get(d.location_id) ?? "—",
    })),
    recent_work_orders: recentWorkOrders ?? [],
  };

  timer.end({ rowCount: openRows.length });
  return payload;
}
