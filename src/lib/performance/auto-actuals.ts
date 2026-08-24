/**
 * Pull raw KPI actuals from operations tables for an evaluation cycle.
 * No rows / no denominator → null (do not invent 100%). Count metrics may be 0.
 */

import type { AuthContext } from "@/lib/server/auth";

type Db = AuthContext["supabase"];

export type AutoActualScope = {
  staffId: string;
  locationId: string | null;
  /** staff.user_id — used for task/WO assignment (those tables store auth user ids). */
  userId: string | null;
  periodStart: string;
  periodEnd: string;
};

export type AutoActualResult = {
  actual: number | null;
  note: string | null;
};

const DONE_TASK = new Set(["completed", "submitted", "verified"]);
const DONE_WO = new Set(["completed"]);
const CLOSED_TICKET = new Set(["resolved", "closed"]);
const PRESENT = new Set(["present", "late", "early_leave", "overtime", "missed_punch"]);

function periodIso(start: string, end: string) {
  return {
    startIso: `${start}T00:00:00+03:00`,
    endIso: `${end}T23:59:59+03:00`,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10;
}

function daysInRange(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}

export function isAutoPullKpi(kpi: { data_source: string; auto_query_key: string | null }): boolean {
  return kpi.data_source === "auto" || Boolean(kpi.auto_query_key);
}

/** Overwrite only auto-sourced KPIs (or empty / prior auto rows). Never clobber a manual actual on a manual KPI. */
export function shouldWriteAutoActual(
  kpi: { data_source: string; auto_query_key: string | null },
  existingSource: string | null | undefined,
): boolean {
  if (!isAutoPullKpi(kpi)) return false;
  if (existingSource === "manual" && kpi.data_source !== "auto") return false;
  return true;
}

export async function attendancePresentPct(
  supabase: Db,
  staffId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("attendance_daily_summary")
    .select("status")
    .eq("staff_id", staffId)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd);
  const rows = data ?? [];
  if (!rows.length) return null;
  const present = rows.filter((r) => PRESENT.has(r.status) && r.status !== "absent").length;
  return pct(present, rows.length);
}

export async function resolveAutoKpiActual(
  supabase: Db,
  key: string,
  ctx: AutoActualScope,
): Promise<AutoActualResult> {
  switch (key) {
    case "attendance_punctuality":
    case "attendance_pct":
      return pullAttendancePunctuality(supabase, ctx);
    case "staff_attendance":
    case "attendance_compliance":
      return pullStaffAttendance(supabase, ctx);
    case "checklist_completion":
    case "safety_checklist":
      return pullChecklistCompletion(supabase, ctx, null);
    case "opening_checklist":
      return pullChecklistCompletion(supabase, ctx, "opening");
    case "closing_checklist":
      return pullChecklistCompletion(supabase, ctx, "closing");
    case "handover_completion":
      return pullHandoverCompletion(supabase, ctx);
    case "complaint_count":
    case "customer_complaints":
    case "complaint_rate":
      return pullComplaintCount(supabase, ctx, { escalatedOnly: false });
    case "escalated_complaints":
      return pullComplaintCount(supabase, ctx, { escalatedOnly: true });
    case "complaint_response_time":
    case "complaint_closure_time":
      return pullComplaintSlaScore(supabase, ctx, key === "complaint_response_time" ? 24 : 72);
    case "issue_closure":
      return pullIssueClosure(supabase, ctx);
    case "pm_completion":
      return pullPmCompletion(supabase, ctx);
    case "mttr":
      return pullMaintenanceSlaScore(supabase, ctx, "mttr");
    case "breakdown_response":
      return pullMaintenanceSlaScore(supabase, ctx, "response");
    case "repeat_issues":
      return pullRepeatIssues(supabase, ctx);
    case "asset_uptime":
      return pullAssetUptime(supabase, ctx);
    case "maintenance_downtime":
      return pullMaintenanceDowntimeHours(supabase, ctx);
    case "revenue_target":
    case "operational_health":
      return { actual: null, note: `No operations connector for ${key}` };
    default:
      return { actual: null, note: `Unsupported auto_query_key: ${key}` };
  }
}

async function pullAttendancePunctuality(supabase: Db, ctx: AutoActualScope): Promise<AutoActualResult> {
  const { data } = await supabase
    .from("attendance_daily_summary")
    .select("status, late_minutes")
    .eq("staff_id", ctx.staffId)
    .gte("work_date", ctx.periodStart)
    .lte("work_date", ctx.periodEnd);
  const rows = data ?? [];
  if (!rows.length) return { actual: null, note: "No attendance_daily_summary rows for this staff/period" };
  const onTime = rows.filter((r) => r.status === "present" && Number(r.late_minutes ?? 0) === 0).length;
  return { actual: pct(onTime, rows.length), note: `${onTime}/${rows.length} on-time present days` };
}

async function pullStaffAttendance(supabase: Db, ctx: AutoActualScope): Promise<AutoActualResult> {
  if (!ctx.locationId) return { actual: null, note: "Staff has no location for team attendance" };
  const { data } = await supabase
    .from("attendance_daily_summary")
    .select("status")
    .eq("location_id", ctx.locationId)
    .gte("work_date", ctx.periodStart)
    .lte("work_date", ctx.periodEnd);
  const rows = data ?? [];
  if (!rows.length) return { actual: null, note: "No attendance_daily_summary rows for this location/period" };
  const present = rows.filter((r) => r.status !== "absent").length;
  return { actual: pct(present, rows.length), note: `${present}/${rows.length} location present days` };
}

async function pullChecklistCompletion(
  supabase: Db,
  ctx: AutoActualScope,
  kind: "opening" | "closing" | null,
): Promise<AutoActualResult> {
  const { startIso, endIso } = periodIso(ctx.periodStart, ctx.periodEnd);

  let templateIds: string[] | null = null;
  if (kind && ctx.locationId) {
    const { data: templates } = await supabase
      .from("task_templates")
      .select("id")
      .eq("location_id", ctx.locationId)
      .eq("kind", kind)
      .eq("active", true);
    templateIds = (templates ?? []).map((t) => t.id);
    if (!templateIds.length) return { actual: null, note: `No ${kind} task_templates at location` };
  }

  let q = supabase
    .from("task_instances")
    .select("id, status, assigned_to, submitted_by, location_id, template_id")
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (ctx.locationId) q = q.eq("location_id", ctx.locationId);
  if (templateIds) q = q.in("template_id", templateIds);
  const { data } = await q;
  let rows = data ?? [];

  // Personal checklists are user-linked (assigned_to / submitted_by). Opening/closing are location ops.
  if (!kind && ctx.userId) {
    const mine = rows.filter((r) => r.assigned_to === ctx.userId || r.submitted_by === ctx.userId);
    if (mine.length) rows = mine;
    else return { actual: null, note: "No task_instances assigned to or submitted by this staff" };
  } else if (!kind && !ctx.userId) {
    return { actual: null, note: "Staff has no login; cannot match task_instances.assigned_to" };
  }

  if (!rows.length) return { actual: null, note: "No task_instances in this period" };
  const done = rows.filter((r) => DONE_TASK.has(r.status)).length;
  return { actual: pct(done, rows.length), note: `${done}/${rows.length} checklists completed` };
}

async function pullHandoverCompletion(supabase: Db, ctx: AutoActualScope): Promise<AutoActualResult> {
  if (!ctx.locationId) return { actual: null, note: "No location for handover briefings" };
  const { data } = await supabase
    .from("shift_briefings")
    .select("briefing_date")
    .eq("location_id", ctx.locationId)
    .gte("briefing_date", ctx.periodStart)
    .lte("briefing_date", ctx.periodEnd);
  const rows = data ?? [];
  if (!rows.length) return { actual: null, note: "No shift_briefings in this period" };
  const uniqueDays = new Set(rows.map((r) => r.briefing_date)).size;
  const expected = daysInRange(ctx.periodStart, ctx.periodEnd);
  return { actual: pct(uniqueDays, expected), note: `${uniqueDays}/${expected} days with a briefing` };
}

async function pullComplaintCount(
  supabase: Db,
  ctx: AutoActualScope,
  opts: { escalatedOnly: boolean },
): Promise<AutoActualResult> {
  if (!ctx.locationId) return { actual: null, note: "No location for complaints" };
  const { startIso, endIso } = periodIso(ctx.periodStart, ctx.periodEnd);
  let q = supabase
    .from("complaints")
    .select("id, handled_by, status, severity", { count: "exact" })
    .eq("location_id", ctx.locationId)
    .is("deleted_at", null)
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (opts.escalatedOnly) q = q.or("status.eq.escalated,severity.eq.urgent");
  const { data, count } = await q;
  const rows = data ?? [];
  // Guest-relations style: prefer handled_by when this staff has a login and handled any row.
  if (ctx.userId) {
    const mine = rows.filter((r) => r.handled_by === ctx.userId);
    if (mine.length) {
      return {
        actual: mine.length,
        note: opts.escalatedOnly ? `${mine.length} escalated (handled by staff)` : `${mine.length} complaints handled by staff`,
      };
    }
  }
  const n = count ?? rows.length;
  return {
    actual: n,
    note: opts.escalatedOnly ? `${n} escalated/urgent at location` : `${n} complaints at location`,
  };
}

async function pullComplaintSlaScore(supabase: Db, ctx: AutoActualScope, hours: number): Promise<AutoActualResult> {
  if (!ctx.locationId) return { actual: null, note: "No location for complaint SLA" };
  const { startIso, endIso } = periodIso(ctx.periodStart, ctx.periodEnd);
  let q = supabase
    .from("complaints")
    .select("created_at, resolved_at, handled_by")
    .eq("location_id", ctx.locationId)
    .is("deleted_at", null)
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (ctx.userId) q = q.eq("handled_by", ctx.userId);
  const { data } = await q;
  let rows = data ?? [];
  if (!rows.length && ctx.userId) {
    const { data: locRows } = await supabase
      .from("complaints")
      .select("created_at, resolved_at, handled_by")
      .eq("location_id", ctx.locationId)
      .is("deleted_at", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    rows = locRows ?? [];
  }
  if (!rows.length) return { actual: null, note: "No complaints in this period" };
  const limitMs = hours * 3_600_000;
  const onSla = rows.filter((r) => {
    if (!r.resolved_at) return false;
    return new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime() <= limitMs;
  }).length;
  return { actual: pct(onSla, rows.length), note: `${onSla}/${rows.length} closed within ${hours}h` };
}

async function pullIssueClosure(supabase: Db, ctx: AutoActualScope): Promise<AutoActualResult> {
  if (!ctx.locationId) return { actual: null, note: "No location for tickets" };
  const { startIso, endIso } = periodIso(ctx.periodStart, ctx.periodEnd);
  const { data } = await supabase
    .from("tickets")
    .select("status, assigned_to")
    .eq("location_id", ctx.locationId)
    .is("deleted_at", null)
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  let rows = data ?? [];
  if (ctx.userId) {
    const mine = rows.filter((r) => r.assigned_to === ctx.userId);
    if (mine.length) rows = mine;
  }
  if (!rows.length) return { actual: null, note: "No tickets in this period" };
  const closed = rows.filter((r) => CLOSED_TICKET.has(r.status)).length;
  return { actual: pct(closed, rows.length), note: `${closed}/${rows.length} tickets closed` };
}

async function loadTechWorkOrders(supabase: Db, ctx: AutoActualScope, preventiveOnly?: boolean) {
  const { startIso, endIso } = periodIso(ctx.periodStart, ctx.periodEnd);
  let q = supabase
    .from("work_orders")
    .select("id, status, kind, assigned_to, sla_breached, sla_completed_within_sla, asset_id, planned_start, created_at")
    .is("deleted_at", null)
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (ctx.locationId) q = q.eq("location_id", ctx.locationId);
  if (preventiveOnly) q = q.eq("kind", "preventive");
  const { data } = await q;
  let rows = data ?? [];
  if (ctx.userId) {
    rows = rows.filter((r) => r.assigned_to === ctx.userId);
  }
  return rows;
}

async function pullPmCompletion(supabase: Db, ctx: AutoActualScope): Promise<AutoActualResult> {
  const rows = await loadTechWorkOrders(supabase, ctx, true);
  if (!rows.length) {
    // Fallback: maintenance_requests closed by / assigned to this technician
    if (ctx.userId) {
      const { startIso, endIso } = periodIso(ctx.periodStart, ctx.periodEnd);
      const { data: reqs } = await supabase
        .from("maintenance_requests")
        .select("status, assigned_technician_id, completed_by, category")
        .is("deleted_at", null)
        .gte("reported_at", startIso)
        .lte("reported_at", endIso)
        .or(`assigned_technician_id.eq.${ctx.userId},completed_by.eq.${ctx.userId}`);
      const mine = reqs ?? [];
      if (!mine.length) return { actual: null, note: "No preventive work_orders or requests for this technician" };
      const done = mine.filter((r) => r.status === "completed").length;
      return { actual: pct(done, mine.length), note: `${done}/${mine.length} maintenance_requests completed` };
    }
    return { actual: null, note: "No preventive work_orders in this period" };
  }
  const done = rows.filter((r) => DONE_WO.has(r.status)).length;
  return { actual: pct(done, rows.length), note: `${done}/${rows.length} preventive WOs completed` };
}

async function pullMaintenanceSlaScore(
  supabase: Db,
  ctx: AutoActualScope,
  mode: "mttr" | "response",
): Promise<AutoActualResult> {
  const rows = (await loadTechWorkOrders(supabase, ctx, false)).filter((r) =>
    mode === "mttr" ? r.kind !== "preventive" : true,
  );
  if (!rows.length) return { actual: null, note: "No work_orders for SLA score" };
  const scored = rows.filter((r) => r.sla_completed_within_sla != null || r.sla_breached);
  if (!scored.length) return { actual: null, note: "Work orders have no SLA flags" };
  const ok = scored.filter((r) => r.sla_completed_within_sla === true || r.sla_breached === false).length;
  return { actual: pct(ok, scored.length), note: `${ok}/${scored.length} within SLA` };
}

async function pullRepeatIssues(supabase: Db, ctx: AutoActualScope): Promise<AutoActualResult> {
  const rows = await loadTechWorkOrders(supabase, ctx, false);
  if (!rows.length) return { actual: null, note: "No work_orders to measure repeats" };
  const byAsset = new Map<string, number>();
  for (const r of rows) {
    if (!r.asset_id) continue;
    byAsset.set(r.asset_id, (byAsset.get(r.asset_id) ?? 0) + 1);
  }
  let repeats = 0;
  for (const n of byAsset.values()) {
    if (n > 1) repeats += n - 1;
  }
  return { actual: repeats, note: `${repeats} repeat WO(s) on the same asset` };
}

async function pullAssetUptime(supabase: Db, ctx: AutoActualScope): Promise<AutoActualResult> {
  if (!ctx.locationId) return { actual: null, note: "No location for asset uptime" };
  const { startIso, endIso } = periodIso(ctx.periodStart, ctx.periodEnd);
  const { data } = await supabase
    .from("downtime_events")
    .select("duration_minutes, started_at, ended_at")
    .eq("location_id", ctx.locationId)
    .gte("started_at", startIso)
    .lte("started_at", endIso);
  const rows = data ?? [];
  const periodMinutes = daysInRange(ctx.periodStart, ctx.periodEnd) * 24 * 60;
  let down = 0;
  for (const d of rows) {
    if (d.duration_minutes != null) down += Number(d.duration_minutes);
    else if (d.ended_at && d.started_at) {
      down += (new Date(d.ended_at).getTime() - new Date(d.started_at).getTime()) / 60_000;
    }
  }
  if (!rows.length) return { actual: null, note: "No downtime_events in this period" };
  const uptime = Math.max(0, 100 - (down / periodMinutes) * 100);
  return { actual: round1(uptime), note: `${round1(down / 60)}h downtime in period` };
}

async function pullMaintenanceDowntimeHours(supabase: Db, ctx: AutoActualScope): Promise<AutoActualResult> {
  if (!ctx.locationId) return { actual: null, note: "No location for downtime hours" };
  const { startIso, endIso } = periodIso(ctx.periodStart, ctx.periodEnd);
  const { data } = await supabase
    .from("downtime_events")
    .select("duration_minutes, started_at, ended_at")
    .eq("location_id", ctx.locationId)
    .gte("started_at", startIso)
    .lte("started_at", endIso);
  const rows = data ?? [];
  let minutes = 0;
  for (const d of rows) {
    if (d.duration_minutes != null) minutes += Number(d.duration_minutes);
    else if (d.ended_at && d.started_at) {
      minutes += (new Date(d.ended_at).getTime() - new Date(d.started_at).getTime()) / 60_000;
    }
  }
  return { actual: round1(minutes / 60), note: `${rows.length} downtime event(s)` };
}

export async function attendancePctByStaffMonth(
  supabase: Db,
  staffIds: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (!staffIds.length) return result;
  const { data } = await supabase
    .from("attendance_daily_summary")
    .select("staff_id, work_date, status")
    .in("staff_id", staffIds)
    .gte("work_date", fromDate)
    .lte("work_date", toDate);
  const buckets = new Map<string, { present: number; total: number }>();
  for (const row of data ?? []) {
    if (!row.staff_id) continue;
    const month = row.work_date.slice(0, 7);
    const key = `${row.staff_id}|${month}`;
    const bucket = buckets.get(key) ?? { present: 0, total: 0 };
    bucket.total += 1;
    if (row.status !== "absent") bucket.present += 1;
    buckets.set(key, bucket);
  }
  for (const [key, bucket] of buckets) {
    const [staffId, month] = key.split("|");
    const byMonth = result.get(staffId) ?? new Map<string, number>();
    byMonth.set(month, pct(bucket.present, bucket.total));
    result.set(staffId, byMonth);
  }
  return result;
}
