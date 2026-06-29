import { monthStartInQatar, todayInQatar } from "@/lib/integrations/bookingqube";
import { dashboardViewForRoles } from "@/lib/rbac";
import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";
import type {
  BranchDashboardRow,
  DashboardPeriod,
  OperationsDashboard,
  RagStatus,
} from "@/lib/dashboard.functions";

export interface OperationsDashboardFilters {
  period?: DashboardPeriod;
  locationId?: string | null;
  view?: OperationsDashboard["view"];
}

function periodBounds(period: DashboardPeriod): { from: string; to: string; label: string } {
  const today = todayInQatar();
  const d = new Date(`${today}T12:00:00+03:00`);
  if (period === "yesterday") {
    d.setDate(d.getDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    return { from: iso, to: iso, label: "Yesterday" };
  }
  if (period === "week") {
    const start = new Date(d);
    start.setDate(start.getDate() - 6);
    return { from: start.toISOString().slice(0, 10), to: today, label: "This week" };
  }
  if (period === "month") {
    return { from: monthStartInQatar(today), to: today, label: "This month" };
  }
  return { from: today, to: today, label: "Today" };
}

function ragFromHealth(score: number): RagStatus {
  if (score >= 80) return "green";
  if (score >= 60) return "amber";
  return "red";
}

function computeHealthScore(row: {
  opening_checklist_pct: number;
  closing_checklist_pct: number;
  staff_absent: number;
  staff_scheduled: number;
  critical_issues: number;
  overdue_maintenance: number;
  pending_compliance: number;
  revenue_target_pct: number;
  sop_ack_pct: number;
}): number {
  const attendance =
    row.staff_scheduled > 0
      ? ((row.staff_scheduled - row.staff_absent) / row.staff_scheduled) * 100
      : 100;
  const checklist = (row.opening_checklist_pct + row.closing_checklist_pct) / 2;
  const issuePenalty = Math.min(30, row.critical_issues * 10 + row.overdue_maintenance * 5);
  const compliancePenalty = Math.min(20, row.pending_compliance * 4);
  const revenueBonus = Math.min(10, row.revenue_target_pct / 10);

  const raw =
    attendance * 0.2 +
    checklist * 0.2 +
    row.sop_ack_pct * 0.15 +
    Math.min(100, row.revenue_target_pct) * 0.15 +
    (100 - issuePenalty) * 0.2 +
    (100 - compliancePenalty) * 0.1 +
    revenueBonus;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

async function fetchChecklistCompletion(
  context: AuthContext,
  locationIds: string[],
  kind: "opening" | "closing",
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (locationIds.length === 0) return result;

  const { data: templates } = await context.supabase
    .from("task_templates")
    .select("id, location_id")
    .in("location_id", locationIds)
    .eq("kind", kind)
    .eq("active", true);

  const templateIds = (templates ?? []).map((t) => t.id);
  if (templateIds.length === 0) {
    for (const id of locationIds) result.set(id, 0);
    return result;
  }

  const { data: instances } = await context.supabase
    .from("task_instances")
    .select("id, location_id, status, template_id, created_at")
    .in("template_id", templateIds)
    .gte("created_at", `${dateFrom}T00:00:00+03:00`)
    .lte("created_at", `${dateTo}T23:59:59+03:00`);

  for (const locId of locationIds) {
    const locTemplates = (templates ?? []).filter((t) => t.location_id === locId).map((t) => t.id);
    const locInstances = (instances ?? []).filter((i) => locTemplates.includes(i.template_id));
    if (locInstances.length === 0) {
      result.set(locId, 0);
      continue;
    }
    const completed = locInstances.filter((i) =>
      ["submitted", "verified", "completed"].includes(i.status),
    ).length;
    result.set(locId, Math.round((completed / locInstances.length) * 100));
  }
  return result;
}

async function fetchAttendanceSummary(
  context: AuthContext,
  locationIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, { scheduled: number; present: number; late: number; absent: number }>> {
  const result = new Map<string, { scheduled: number; present: number; late: number; absent: number }>();
  for (const id of locationIds) {
    result.set(id, { scheduled: 0, present: 0, late: 0, absent: 0 });
  }
  if (locationIds.length === 0) return result;

  const { data: shifts } = await context.supabase
    .from("shifts")
    .select("location_id, starts_at, clock_in_at, status")
    .in("location_id", locationIds)
    .gte("starts_at", `${dateFrom}T00:00:00+03:00`)
    .lte("starts_at", `${dateTo}T23:59:59+03:00`);

  const now = new Date();
  const graceMs = 10 * 60 * 1000;

  for (const shift of shifts ?? []) {
    const bucket = result.get(shift.location_id)!;
    bucket.scheduled += 1;
    if (shift.clock_in_at) {
      bucket.present += 1;
      const start = new Date(shift.starts_at).getTime();
      const clockIn = new Date(shift.clock_in_at).getTime();
      if (clockIn > start + graceMs) bucket.late += 1;
    } else if (new Date(shift.starts_at) < now) {
      bucket.absent += 1;
    }
  }
  return result;
}

function sortBranches(rows: BranchDashboardRow[]): BranchDashboardRow[] {
  const order = { red: 0, amber: 1, green: 2 };
  return [...rows].sort(
    (a, b) => order[a.rag] - order[b.rag] || b.critical_issues - a.critical_issues,
  );
}

async function loadOperationsData(
  context: AuthContext,
  filters: OperationsDashboardFilters,
) {
  const period = filters.period ?? "today";
  const { from, to, label } = periodBounds(period);
  const today = todayInQatar();
  const monthStart = monthStartInQatar(today);
  const weekEnd = new Date(`${today}T12:00:00+03:00`);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = weekEnd.toISOString().slice(0, 10);
  const expiryHorizon = new Date(`${today}T12:00:00+03:00`);
  expiryHorizon.setDate(expiryHorizon.getDate() + 30);
  const expiryHorizonIso = expiryHorizon.toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  let locQ = context.supabase
    .from("locations")
    .select("id, code, name, status")
    .in("status", ["active", "maintenance"])
    .order("code");
  if (filters.locationId) locQ = locQ.eq("id", filters.locationId);

  const { data: locations, error: locErr } = await locQ;
  if (locErr) throw locErr;

  const locs = locations ?? [];
  const ids = locs.map((l) => l.id);

  const { data: amcLocContracts } = ids.length
    ? await context.supabase.from("amc_contracts").select("id").in("location_id", ids)
    : { data: [] };
  const amcContractIds = (amcLocContracts ?? []).map((c) => c.id);

  const [
    openingPct,
    closingPct,
    attendance,
    { data: tickets },
    { data: workOrders },
    { data: downtime },
    { data: compliance },
    { data: dayRevenue },
    { data: monthTargets },
    { data: monthDays },
    { data: sopAcks },
    { data: kpiScores },
    { data: snags },
    { data: vendorFollowups },
    { data: allWorkOrders },
    { data: pmDue },
    { data: amcExpiring },
    { data: legalExpiring },
    { data: utilityBills },
    { data: highRisks },
    { data: downtimeAll },
    { data: facilityReadiness },
    { data: pendingServices },
  ] = await Promise.all([
    fetchChecklistCompletion(context, ids, "opening", from, to),
    fetchChecklistCompletion(context, ids, "closing", from, to),
    fetchAttendanceSummary(context, ids, from, to),
    context.supabase
      .from("tickets")
      .select("location_id, priority, status")
      .in("location_id", ids)
      .is("deleted_at", null)
      .not("status", "in", "(resolved,closed,cancelled)"),
    context.supabase
      .from("work_orders")
      .select("location_id, planned_end, status")
      .in("location_id", ids)
      .not("status", "in", "(completed,cancelled)"),
    context.supabase
      .from("downtime_events")
      .select("location_id")
      .in("location_id", ids)
      .is("ended_at", null),
    context.supabase
      .from("compliance_documents")
      .select("location_id, status, submission_deadline, expiry_date")
      .in("location_id", ids)
      .not("status", "in", "(submitted,approved,renewed)"),
    context.supabase
      .from("financial_snapshots")
      .select("location_id, revenue")
      .in("location_id", ids)
      .eq("period_kind", "day")
      .eq("period_start", period === "today" ? today : to),
    context.supabase
      .from("financial_snapshots")
      .select("location_id, revenue")
      .in("location_id", ids)
      .eq("period_kind", "month_target")
      .eq("period_start", monthStart),
    context.supabase
      .from("financial_snapshots")
      .select("location_id, revenue")
      .in("location_id", ids)
      .eq("period_kind", "day")
      .gte("period_start", monthStart)
      .lte("period_start", today),
    context.supabase.from("sop_acknowledgments").select("status, document_id"),
    context.supabase
      .from("kpi_scores")
      .select("location_id, total_score")
      .gte("created_at", `${monthStart}T00:00:00+03:00`),
    context.supabase
      .from("snag_items")
      .select("location_id, status, target_date")
      .in("location_id", ids)
      .not("status", "in", "(closed,verified)"),
    context.supabase
      .from("vendor_followups")
      .select("location_id, status, due_date")
      .in("location_id", ids)
      .eq("status", "pending"),
    context.supabase
      .from("work_orders")
      .select("id, planned_end, status")
      .in("location_id", ids)
      .not("status", "in", "(completed,cancelled)"),
    context.supabase
      .from("pm_schedules")
      .select("id, next_due_at")
      .in("location_id", ids)
      .gte("next_due_at", `${today}T00:00:00`)
      .lte("next_due_at", `${weekEndIso}T23:59:59`),
    context.supabase
      .from("amc_contracts")
      .select("id, contract_end_date")
      .in("location_id", ids)
      .gte("contract_end_date", today)
      .lte("contract_end_date", expiryHorizonIso)
      .not("status", "in", "(cancelled,expired)"),
    context.supabase
      .from("compliance_documents")
      .select("id, expiry_date")
      .in("location_id", ids)
      .gte("expiry_date", today)
      .lte("expiry_date", expiryHorizonIso)
      .not("status", "in", "(renewed,approved)"),
    context.supabase
      .from("utility_consumption")
      .select("bill_amount, period_month")
      .in("location_id", ids)
      .gte("period_month", `${monthPrefix}-01`),
    context.supabase
      .from("risk_register")
      .select("id, risk_score, status")
      .in("location_id", ids)
      .gte("risk_score", 15)
      .not("status", "in", "(closed,mitigated)"),
    context.supabase
      .from("downtime_events")
      .select("started_at, ended_at, duration_minutes")
      .in("location_id", ids)
      .gte("started_at", `${monthStart}T00:00:00+03:00`),
    context.supabase
      .from("facility_tasks")
      .select("status, category")
      .in("location_id", ids)
      .eq("category", "site_readiness"),
    context.supabase
      .from("amc_service_schedules")
      .select("id, planned_date, status")
      .in("contract_id", amcContractIds.length ? amcContractIds : ["00000000-0000-0000-0000-000000000000"])
      .not("status", "in", "(done,cancelled)")
      .lte("planned_date", weekEndIso),
  ]);

  const now = new Date().toISOString();
  const openWo = (allWorkOrders ?? []).length;
  const overdueWo = (allWorkOrders ?? []).filter((w) => w.planned_end && w.planned_end < now).length;
  const downtimeHours = Math.round(
    (downtimeAll ?? []).reduce((acc, d) => {
      if (d.duration_minutes != null) return acc + Number(d.duration_minutes) / 60;
      if (d.ended_at && d.started_at) {
        return acc + (new Date(d.ended_at).getTime() - new Date(d.started_at).getTime()) / 3_600_000;
      }
      return acc + (Date.now() - new Date(d.started_at).getTime()) / 3_600_000;
    }, 0),
  );
  const readinessTotal = (facilityReadiness ?? []).length;
  const readinessDone = (facilityReadiness ?? []).filter((t) => t.status === "completed").length;
  const siteReadinessScore = readinessTotal ? Math.round((readinessDone / readinessTotal) * 100) : 100;
  const utilityCost = (utilityBills ?? []).reduce((a, r) => a + Number(r.bill_amount ?? 0), 0);

  const smartmaintain = {
    open_work_orders: openWo,
    overdue_work_orders: overdueWo,
    pm_due_this_week: (pmDue ?? []).length,
    amc_expiring_soon: (amcExpiring ?? []).length,
    legal_docs_expiring_soon: (legalExpiring ?? []).length,
    utility_cost_this_month: Math.round(utilityCost),
    high_risk_items: (highRisks ?? []).length,
    downtime_hours: downtimeHours,
    site_readiness_score: siteReadinessScore,
    pending_inspections: (pendingServices ?? []).length,
  };

  const branchRows: BranchDashboardRow[] = locs.map((loc) => {
    const att = attendance.get(loc.id) ?? { scheduled: 0, present: 0, late: 0, absent: 0 };
    const locTickets = (tickets ?? []).filter((t) => t.location_id === loc.id);
    const critical = locTickets.filter((t) => ["urgent", "high"].includes(t.priority)).length;
    const overdue = (workOrders ?? []).filter(
      (w) => w.location_id === loc.id && w.planned_end && w.planned_end < now,
    ).length;
    const machinesDown = (downtime ?? []).filter((d) => d.location_id === loc.id).length;
    const pendingComp = (compliance ?? []).filter((c) => c.location_id === loc.id).length;
    const revToday = Number((dayRevenue ?? []).find((r) => r.location_id === loc.id)?.revenue ?? 0);
    const target = Number((monthTargets ?? []).find((r) => r.location_id === loc.id)?.revenue ?? 0);
    const mtd = (monthDays ?? [])
      .filter((r) => r.location_id === loc.id)
      .reduce((a, r) => a + Number(r.revenue ?? 0), 0);
    const targetPct = target > 0 ? (mtd / target) * 100 : 0;

    const locKpi = (kpiScores ?? []).filter((k) => k.location_id === loc.id);
    const kpiAvg =
      locKpi.length > 0 ? locKpi.reduce((a, k) => a + Number(k.total_score), 0) / locKpi.length : null;

    const pendingSnags = (snags ?? []).filter((s) => s.location_id === loc.id).length;
    const pendingVendor = (vendorFollowups ?? []).filter((v) => v.location_id === loc.id).length;
    const sopTotal = (sopAcks ?? []).length || 1;
    const sopDone = (sopAcks ?? []).filter((a) => a.status === "acknowledged").length;
    const sopPct = Math.round((sopDone / sopTotal) * 100);

    const row = {
      location_id: loc.id,
      code: loc.code,
      name: loc.name,
      status: loc.status,
      is_open: loc.status === "active",
      opening_checklist_pct: openingPct.get(loc.id) ?? 0,
      closing_checklist_pct: closingPct.get(loc.id) ?? 0,
      staff_scheduled: att.scheduled,
      staff_present: att.present,
      staff_late: att.late,
      staff_absent: att.absent,
      revenue_today: revToday,
      revenue_target_pct: Math.round(targetPct),
      open_issues: locTickets.length,
      critical_issues: critical,
      machines_down: machinesDown,
      overdue_maintenance: overdue,
      pending_compliance: pendingComp,
      pending_snags: pendingSnags,
      pending_vendor_actions: pendingVendor,
      sop_ack_pct: sopPct,
      kpi_score: kpiAvg != null ? Math.round(kpiAvg) : null,
      health_score: 0,
      rag: "green" as RagStatus,
    };
    row.health_score = computeHealthScore(row);
    row.rag = ragFromHealth(row.health_score);
    return row;
  });

  const estate = {
    branches_open: branchRows.filter((b) => b.is_open).length,
    branches_total: branchRows.length,
    opening_checklist_pct:
      branchRows.length > 0
        ? Math.round(branchRows.reduce((a, b) => a + b.opening_checklist_pct, 0) / branchRows.length)
        : 0,
    closing_checklist_pct:
      branchRows.length > 0
        ? Math.round(branchRows.reduce((a, b) => a + b.closing_checklist_pct, 0) / branchRows.length)
        : 0,
    staff_present: branchRows.reduce((a, b) => a + b.staff_present, 0),
    staff_scheduled: branchRows.reduce((a, b) => a + b.staff_scheduled, 0),
    staff_late: branchRows.reduce((a, b) => a + b.staff_late, 0),
    staff_absent: branchRows.reduce((a, b) => a + b.staff_absent, 0),
    revenue_today: branchRows.reduce((a, b) => a + b.revenue_today, 0),
    revenue_target_pct:
      branchRows.length > 0
        ? Math.round(branchRows.reduce((a, b) => a + b.revenue_target_pct, 0) / branchRows.length)
        : 0,
    open_issues: branchRows.reduce((a, b) => a + b.open_issues, 0),
    critical_issues: branchRows.reduce((a, b) => a + b.critical_issues, 0),
    machines_down: branchRows.reduce((a, b) => a + b.machines_down, 0),
    overdue_maintenance: branchRows.reduce((a, b) => a + b.overdue_maintenance, 0),
    pending_snags: branchRows.reduce((a, b) => a + b.pending_snags, 0),
    pending_compliance: branchRows.reduce((a, b) => a + b.pending_compliance, 0),
    pending_vendor_actions: branchRows.reduce((a, b) => a + b.pending_vendor_actions, 0),
    sop_ack_pct:
      branchRows.length > 0
        ? Math.round(branchRows.reduce((a, b) => a + b.sop_ack_pct, 0) / branchRows.length)
        : 0,
    kpi_score_avg:
      branchRows.filter((b) => b.kpi_score != null).length > 0
        ? Math.round(
            branchRows
              .filter((b) => b.kpi_score != null)
              .reduce((a, b) => a + (b.kpi_score ?? 0), 0) /
              branchRows.filter((b) => b.kpi_score != null).length,
          )
        : null,
    health_score: 0,
    rag: "green" as RagStatus,
    smartmaintain,
  };

  estate.health_score = computeHealthScore({
    opening_checklist_pct: estate.opening_checklist_pct,
    closing_checklist_pct: estate.closing_checklist_pct,
    staff_absent: estate.staff_absent,
    staff_scheduled: estate.staff_scheduled,
    critical_issues: estate.critical_issues,
    overdue_maintenance: estate.overdue_maintenance,
    pending_compliance: estate.pending_compliance,
    revenue_target_pct: estate.revenue_target_pct,
    sop_ack_pct: estate.sop_ack_pct,
  });
  estate.rag = ragFromHealth(estate.health_score);

  return { period, from, to, label, branchRows, estate };
}

export async function fetchOperationsBranches(
  context: AuthContext,
  filters: OperationsDashboardFilters = {},
): Promise<BranchDashboardRow[]> {
  const timer = createTimer("fetchOperationsBranches", "operations-branches");
  const { branchRows } = await loadOperationsData(context, filters);
  const sorted = sortBranches(branchRows);
  timer.end({ rowCount: sorted.length });
  return sorted;
}

export async function fetchSiteSummary(
  context: AuthContext,
  locationId: string,
  filters: OperationsDashboardFilters = {},
): Promise<BranchDashboardRow | null> {
  const timer = createTimer("fetchSiteSummary", "operations-site-summary");
  const branches = await fetchOperationsBranches(context, { ...filters, locationId });
  const row = branches.find((b) => b.location_id === locationId) ?? branches[0] ?? null;
  timer.end({ rowCount: row ? 1 : 0 });
  return row;
}

export async function fetchOperationsDashboard(
  context: AuthContext,
  filters: OperationsDashboardFilters = {},
): Promise<OperationsDashboard> {
  const timer = createTimer("fetchOperationsDashboard", "operations-dashboard");
  const { period, from, to, label, branchRows, estate } = await loadOperationsData(context, filters);

  let view: OperationsDashboard["view"] =
    filters.view ?? dashboardViewForRoles(context.roles ?? []);

  let assigned_tasks: OperationsDashboard["assigned_tasks"];
  if (view === "tasks" || view === "branch") {
    const { data: tasks } = await context.supabase
      .from("task_instances")
      .select("id, title, status, due_at")
      .eq("assigned_to", context.userId)
      .not("status", "in", "(verified,completed,cancelled)")
      .order("due_at")
      .limit(10);
    assigned_tasks = tasks ?? [];
  }

  let open_complaints: number | undefined;
  if (view === "customer") {
    let cq = context.supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(resolved,dismissed)");
    if (filters.locationId) cq = cq.eq("location_id", filters.locationId);
    const { count } = await cq;
    open_complaints = count ?? 0;
  }

  const result = {
    period,
    period_label: label,
    date_from: from,
    date_to: to,
    view,
    estate,
    branches: sortBranches(branchRows),
    assigned_tasks,
    open_complaints,
  } satisfies OperationsDashboard;

  timer.end({ rowCount: result.branches.length });
  return result;
}
