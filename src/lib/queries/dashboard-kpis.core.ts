import { monthStartInQatar, todayInQatar } from "@/lib/integrations/bookingqube";
import { dashboardViewForRoles } from "@/lib/rbac";
import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";
import type { DashboardPeriod, RagStatus } from "@/lib/dashboard.functions";

export interface DashboardKpiPayload {
  period: DashboardPeriod;
  period_label: string;
  view: string;
  estate: {
    branches_open: number;
    branches_total: number;
    staff_present: number;
    staff_scheduled: number;
    revenue_today: number;
    revenue_target_pct: number;
    open_issues: number;
    critical_issues: number;
    health_score: number;
    rag: RagStatus;
  };
  smartmaintain: {
    open_work_orders: number;
    overdue_work_orders: number;
    pm_due_this_week: number;
    amc_expiring_soon: number;
    utility_cost_this_month: number;
    downtime_hours: number;
    site_readiness_score: number;
    high_risk_items: number;
    pending_inspections: number;
  };
  assigned_tasks?: Array<{ id: string; title: string; status: string; due_at: string | null }>;
}

interface DashboardKpisRpc {
  open_work_orders?: number;
  overdue_work_orders?: number;
  open_issues?: number;
  critical_issues?: number;
  pm_due_this_week?: number;
  amc_expiring_soon?: number;
  pending_inspections?: number;
  pending_compliance?: number;
  high_risk_items?: number;
  utility_cost_this_month?: number;
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
  staff_absent: number;
  staff_scheduled: number;
  critical_issues: number;
  overdue_maintenance: number;
  pending_compliance: number;
  revenue_target_pct: number;
}): number {
  const attendance =
    row.staff_scheduled > 0
      ? ((row.staff_scheduled - row.staff_absent) / row.staff_scheduled) * 100
      : 100;
  const issuePenalty = Math.min(30, row.critical_issues * 10 + row.overdue_maintenance * 5);
  const compliancePenalty = Math.min(20, row.pending_compliance * 4);
  const revenueBonus = Math.min(10, row.revenue_target_pct / 10);
  const raw =
    attendance * 0.25 +
    Math.min(100, row.revenue_target_pct) * 0.25 +
    (100 - issuePenalty) * 0.3 +
    (100 - compliancePenalty) * 0.1 +
    revenueBonus;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export interface DashboardKpiFilters {
  period?: DashboardPeriod;
  locationId?: string | null;
  view?: string;
}

export async function fetchDashboardKpis(
  context: AuthContext,
  filters: DashboardKpiFilters = {},
): Promise<DashboardKpiPayload> {
  const timer = createTimer("fetchDashboardKpis", "get_dashboard_kpis");
  const period = filters.period ?? "today";
  const { label } = periodBounds(period);
  const today = todayInQatar();
  const monthStart = monthStartInQatar(today);
  const now = new Date().toISOString();

  let locQ = context.supabase
    .from("locations")
    .select("id, status")
    .in("status", ["active", "maintenance"]);
  if (filters.locationId) locQ = locQ.eq("id", filters.locationId);
  const { data: locations, error: locErr } = await locQ;
  if (locErr) throw locErr;

  const ids = (locations ?? []).map((l) => l.id);
  const view = (filters.view ?? dashboardViewForRoles(context.roles ?? [])) as string;
  const emptyIds = ids.length === 0;

  let rpc: DashboardKpisRpc | null = null;
  if (!emptyIds) {
    const rpcResult = await context.supabase.rpc("get_dashboard_kpis", { p_location_ids: ids });
    if (rpcResult.error) {
      console.warn("[dashboard-kpis] RPC get_dashboard_kpis failed:", rpcResult.error.message);
    } else if (rpcResult.data && typeof rpcResult.data === "object") {
      rpc = rpcResult.data as DashboardKpisRpc;
    }
  }

  const hasRpc = rpc != null;
  const hasRpcExtended = rpc?.pending_inspections != null;

  const [
    fallbackCounts,
    extendedCounts,
    { data: financialRows },
    { data: downtimeAll },
    { data: facilityReadiness },
    { data: shifts },
  ] = await Promise.all([
    hasRpc
      ? Promise.resolve(null)
      : emptyIds
        ? Promise.resolve({
            openWo: 0,
            overdueWo: 0,
            openIssues: 0,
            criticalIssues: 0,
            overdueMaintenance: 0,
            pmDue: 0,
            amcExpiring: 0,
            pendingInspections: 0,
            pendingCompliance: 0,
            highRisks: 0,
            utilityCost: 0,
          })
        : (async () => {
            const weekEnd = new Date(`${today}T12:00:00+03:00`);
            weekEnd.setDate(weekEnd.getDate() + 7);
            const weekEndIso = weekEnd.toISOString().slice(0, 10);
            const expiryHorizon = new Date(`${today}T12:00:00+03:00`);
            expiryHorizon.setDate(expiryHorizon.getDate() + 30);
            const expiryHorizonIso = expiryHorizon.toISOString().slice(0, 10);
            const [
              { count: openWo },
              { count: overdueWo },
              { data: tickets },
              { data: workOrders },
              { count: pmDue },
              { count: amcExpiring },
              { count: pendingInspections },
              { count: pendingCompliance },
              { count: highRisks },
              { data: utilityBills },
            ] = await Promise.all([
              context.supabase
                .from("work_orders")
                .select("id", { count: "exact", head: true })
                .in("location_id", ids)
                .not("status", "in", "(completed,cancelled)"),
              context.supabase
                .from("work_orders")
                .select("id", { count: "exact", head: true })
                .in("location_id", ids)
                .not("status", "in", "(completed,cancelled)")
                .lt("planned_end", now),
              context.supabase
                .from("tickets")
                .select("priority, status")
                .in("location_id", ids)
                .is("deleted_at", null)
                .not("status", "in", "(resolved,closed,cancelled)"),
              context.supabase
                .from("work_orders")
                .select("planned_end")
                .in("location_id", ids)
                .not("status", "in", "(completed,cancelled)"),
              context.supabase
                .from("pm_schedules")
                .select("id", { count: "exact", head: true })
                .in("location_id", ids)
                .gte("next_due_at", `${today}T00:00:00`)
                .lte("next_due_at", `${weekEndIso}T23:59:59`),
              context.supabase
                .from("amc_contracts")
                .select("id", { count: "exact", head: true })
                .in("location_id", ids)
                .gte("contract_end_date", today)
                .lte("contract_end_date", expiryHorizonIso)
                .not("status", "in", "(cancelled,expired)"),
              context.supabase
                .from("amc_service_schedules")
                .select("id", { count: "exact", head: true })
                .not("status", "in", "(done,cancelled)")
                .lte("planned_date", today),
              context.supabase
                .from("compliance_documents")
                .select("id", { count: "exact", head: true })
                .in("location_id", ids)
                .not("status", "in", "(submitted,approved,renewed)"),
              context.supabase
                .from("risk_register")
                .select("id", { count: "exact", head: true })
                .in("location_id", ids)
                .gte("risk_score", 15)
                .not("status", "in", "(closed,mitigated)"),
              context.supabase
                .from("utility_consumption")
                .select("bill_amount")
                .in("location_id", ids)
                .gte("period_month", `${today.slice(0, 7)}-01`),
            ]);
            const openIssues = (tickets ?? []).length;
            const criticalIssues = (tickets ?? []).filter((t) =>
              ["urgent", "high"].includes(t.priority),
            ).length;
            const overdueMaintenance =
              overdueWo ??
              (workOrders ?? []).filter((w) => w.planned_end && w.planned_end < now).length;
            const utilityCost = (utilityBills ?? []).reduce(
              (a, r) => a + Number(r.bill_amount ?? 0),
              0,
            );
            return {
              openWo: openWo ?? 0,
              overdueWo: overdueWo ?? 0,
              openIssues,
              criticalIssues,
              overdueMaintenance,
              pmDue: pmDue ?? 0,
              amcExpiring: amcExpiring ?? 0,
              pendingInspections: pendingInspections ?? 0,
              pendingCompliance: pendingCompliance ?? 0,
              highRisks: highRisks ?? 0,
              utilityCost,
            };
          })(),
    hasRpcExtended || emptyIds
      ? Promise.resolve(null)
      : (async () => {
          const [
            { count: pendingInspections },
            { count: pendingCompliance },
            { count: highRisks },
            { data: utilityBills },
          ] = await Promise.all([
            context.supabase
              .from("amc_service_schedules")
              .select("id", { count: "exact", head: true })
              .not("status", "in", "(done,cancelled)")
              .lte("planned_date", today),
            context.supabase
              .from("compliance_documents")
              .select("id", { count: "exact", head: true })
              .in("location_id", ids)
              .not("status", "in", "(submitted,approved,renewed)"),
            context.supabase
              .from("risk_register")
              .select("id", { count: "exact", head: true })
              .in("location_id", ids)
              .gte("risk_score", 15)
              .not("status", "in", "(closed,mitigated)"),
            context.supabase
              .from("utility_consumption")
              .select("bill_amount")
              .in("location_id", ids)
              .gte("period_month", `${today.slice(0, 7)}-01`),
          ]);
          return {
            pendingInspections: pendingInspections ?? 0,
            pendingCompliance: pendingCompliance ?? 0,
            highRisks: highRisks ?? 0,
            utilityCost: (utilityBills ?? []).reduce((a, r) => a + Number(r.bill_amount ?? 0), 0),
          };
        })(),
    emptyIds
      ? Promise.resolve({ data: [] })
      : context.supabase
          .from("financial_snapshots")
          .select("revenue, period_kind, period_start")
          .in("location_id", ids)
          .in("period_kind", ["day", "month_target"])
          .gte("period_start", monthStart)
          .lte("period_start", today),
    emptyIds
      ? Promise.resolve({ data: [] })
      : context.supabase
          .from("downtime_events")
          .select("started_at, ended_at, duration_minutes")
          .in("location_id", ids)
          .gte("started_at", `${monthStart}T00:00:00+03:00`),
    emptyIds
      ? Promise.resolve({ data: [] })
      : context.supabase
          .from("facility_tasks")
          .select("status")
          .in("location_id", ids)
          .eq("category", "site_readiness"),
    emptyIds
      ? Promise.resolve({ data: [] })
      : context.supabase
          .from("shifts")
          .select("clock_in_at, starts_at")
          .in("location_id", ids)
          .gte("starts_at", `${today}T00:00:00+03:00`)
          .lte("starts_at", `${today}T23:59:59+03:00`),
  ]);

  const openIssues = rpc?.open_issues ?? fallbackCounts?.openIssues ?? 0;
  const criticalIssues = rpc?.critical_issues ?? fallbackCounts?.criticalIssues ?? 0;
  const overdueMaintenance =
    rpc?.overdue_work_orders ?? fallbackCounts?.overdueMaintenance ?? 0;
  const pendingCompliance =
    rpc?.pending_compliance ?? extendedCounts?.pendingCompliance ?? fallbackCounts?.pendingCompliance ?? 0;

  const dayRevenue = (financialRows ?? []).filter(
    (r) => r.period_kind === "day" && r.period_start === today,
  );
  const monthTargets = (financialRows ?? []).filter(
    (r) => r.period_kind === "month_target" && r.period_start === monthStart,
  );
  const monthDays = (financialRows ?? []).filter(
    (r) => r.period_kind === "day" && r.period_start >= monthStart && r.period_start <= today,
  );
  const revenueToday = dayRevenue.reduce((a, r) => a + Number(r.revenue ?? 0), 0);
  const target = monthTargets.reduce((a, r) => a + Number(r.revenue ?? 0), 0);
  const mtd = monthDays.reduce((a, r) => a + Number(r.revenue ?? 0), 0);
  const targetPct = target > 0 ? Math.round((mtd / target) * 100) : 0;

  let staffScheduled = 0;
  let staffPresent = 0;
  let staffAbsent = 0;
  const nowMs = Date.now();
  for (const shift of shifts ?? []) {
    staffScheduled += 1;
    if (shift.clock_in_at) {
      staffPresent += 1;
    } else if (new Date(shift.starts_at).getTime() < nowMs) {
      staffAbsent += 1;
    }
  }

  const readinessTotal = (facilityReadiness ?? []).length;
  const readinessDone = (facilityReadiness ?? []).filter((t) => t.status === "completed").length;
  const siteReadinessScore = readinessTotal ? Math.round((readinessDone / readinessTotal) * 100) : 100;

  const downtimeHours = Math.round(
    (downtimeAll ?? []).reduce((acc, d) => {
      if (d.duration_minutes != null) return acc + Number(d.duration_minutes) / 60;
      if (d.ended_at && d.started_at) {
        return acc + (new Date(d.ended_at).getTime() - new Date(d.started_at).getTime()) / 3_600_000;
      }
      return acc + (Date.now() - new Date(d.started_at).getTime()) / 3_600_000;
    }, 0),
  );

  const utilityCost =
    rpc?.utility_cost_this_month != null
      ? Number(rpc.utility_cost_this_month)
      : (extendedCounts?.utilityCost ?? fallbackCounts?.utilityCost ?? 0);

  const healthInput = {
    staff_absent: staffAbsent,
    staff_scheduled: staffScheduled,
    critical_issues: criticalIssues,
    overdue_maintenance: overdueMaintenance,
    pending_compliance: pendingCompliance,
    revenue_target_pct: targetPct,
  };
  const healthScore = computeHealthScore(healthInput);

  let assigned_tasks: DashboardKpiPayload["assigned_tasks"];
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

  timer.end({ rowCount: (locations ?? []).length });
  return {
    period,
    period_label: label,
    view,
    estate: {
      branches_open: (locations ?? []).filter((l) => l.status === "active").length,
      branches_total: (locations ?? []).length,
      staff_present: staffPresent,
      staff_scheduled: staffScheduled,
      revenue_today: revenueToday,
      revenue_target_pct: targetPct,
      open_issues: openIssues,
      critical_issues: criticalIssues,
      health_score: healthScore,
      rag: ragFromHealth(healthScore),
    },
    smartmaintain: {
      open_work_orders: rpc?.open_work_orders ?? fallbackCounts?.openWo ?? 0,
      overdue_work_orders: overdueMaintenance,
      pm_due_this_week: rpc?.pm_due_this_week ?? fallbackCounts?.pmDue ?? 0,
      amc_expiring_soon: rpc?.amc_expiring_soon ?? fallbackCounts?.amcExpiring ?? 0,
      utility_cost_this_month: Math.round(utilityCost),
      downtime_hours: downtimeHours,
      site_readiness_score: siteReadinessScore,
      high_risk_items: rpc?.high_risk_items ?? extendedCounts?.highRisks ?? fallbackCounts?.highRisks ?? 0,
      pending_inspections:
        rpc?.pending_inspections ?? extendedCounts?.pendingInspections ?? fallbackCounts?.pendingInspections ?? 0,
    },
    assigned_tasks,
  };
}

export interface DashboardChartsPayload {
  siteIssues: Array<{ site: string; issues: number; critical: number }>;
  woTrend: Array<{ month: string; renewals: number; completed: number }>;
  utilityTrend: Array<{ month: string; cost: number }>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface DashboardChartsRpc {
  site_issues?: Array<{ site: string; issues: number; critical: number }>;
  wo_trend?: Array<{ month: string; renewals: number; completed: number }>;
  utility_trend?: Array<{ month: string; cost: number }>;
}

function applyUtilityFallback(
  utilityTrend: Array<{ month: string; cost: number }>,
  utilityBase: number | undefined,
): Array<{ month: string; cost: number }> {
  const base = utilityBase ?? 0;
  return utilityTrend.map((row, i) => ({
    month: row.month,
    cost: row.cost > 0 ? row.cost : Math.round(base * (0.7 + i * 0.08)),
  }));
}

export async function fetchDashboardCharts(
  context: AuthContext,
  filters: { locationId?: string | null; year?: number; utilityBase?: number } = {},
): Promise<DashboardChartsPayload> {
  const timer = createTimer("fetchDashboardCharts", "get_dashboard_charts");
  const year = filters.year ?? new Date().getFullYear();
  const today = todayInQatar();
  const monthPrefix = today.slice(0, 7);

  let locQ = context.supabase.from("locations").select("id, code").in("status", ["active", "maintenance"]);
  if (filters.locationId) locQ = locQ.eq("id", filters.locationId);
  const { data: locations } = await locQ;
  const ids = (locations ?? []).map((l) => l.id);
  const codeMap = new Map((locations ?? []).map((l) => [l.id, l.code]));

  if (ids.length === 0) {
    const base = filters.utilityBase ?? 0;
    timer.end({ rowCount: 0 });
    return {
      siteIssues: [],
      woTrend: MONTHS.map((month) => ({ month, renewals: 0, completed: 0 })),
      utilityTrend: MONTHS.slice(0, 6).map((month, i) => ({
        month,
        cost: Math.round(base * (0.7 + i * 0.08)),
      })),
    };
  }

  const rpcResult = await context.supabase.rpc("get_dashboard_charts", {
    p_location_ids: ids,
    p_year: year,
  });
  if (!rpcResult.error && rpcResult.data && typeof rpcResult.data === "object") {
    const raw = rpcResult.data as DashboardChartsRpc;
    const payload = {
      siteIssues: (raw.site_issues ?? []).map((row) => ({
        site: row.site,
        issues: Number(row.issues ?? 0),
        critical: Number(row.critical ?? 0),
      })),
      woTrend: (raw.wo_trend ?? []).map((row) => ({
        month: row.month,
        renewals: Number(row.renewals ?? 0),
        completed: Number(row.completed ?? 0),
      })),
      utilityTrend: applyUtilityFallback(
        (raw.utility_trend ?? []).map((row) => ({
          month: row.month,
          cost: Number(row.cost ?? 0),
        })),
        filters.utilityBase,
      ),
    };
    timer.end({ rowCount: payload.siteIssues.length });
    return payload;
  }
  if (rpcResult.error) {
    console.warn("[dashboard-charts] RPC get_dashboard_charts failed:", rpcResult.error.message);
  }

  let trendQ = context.supabase
    .from("compliance_calendar_events")
    .select("due_date, status, event_type")
    .gte("due_date", `${year}-01-01`)
    .lte("due_date", `${year}-12-31`);
  if (filters.locationId) trendQ = trendQ.eq("location_id", filters.locationId);

  const [{ data: tickets }, { data: trendRows }, { data: utilityRows }] = await Promise.all([
    context.supabase
      .from("tickets")
      .select("location_id, priority")
      .in("location_id", ids)
      .is("deleted_at", null)
      .not("status", "in", "(resolved,closed,cancelled)"),
    trendQ,
    context.supabase
      .from("utility_consumption")
      .select("period_month, bill_amount")
      .in("location_id", ids)
      .gte("period_month", `${monthPrefix.slice(0, 4)}-01-01`)
      .lt("period_month", `${year}-07-01`),
  ]);

  const ticketByLoc = new Map<string, { issues: number; critical: number }>();
  for (const t of tickets ?? []) {
    const bucket = ticketByLoc.get(t.location_id) ?? { issues: 0, critical: 0 };
    bucket.issues += 1;
    if (["urgent", "high"].includes(t.priority)) bucket.critical += 1;
    ticketByLoc.set(t.location_id, bucket);
  }
  const siteIssues = ids.map((id) => {
    const counts = ticketByLoc.get(id);
    return {
      site: codeMap.get(id) ?? id.slice(0, 6),
      issues: counts?.issues ?? 0,
      critical: counts?.critical ?? 0,
    };
  });

  const byMonth = new Map<number, { renewals: number; completed: number }>();
  for (let m = 1; m <= 12; m++) byMonth.set(m, { renewals: 0, completed: 0 });
  for (const row of trendRows ?? []) {
    const month = Number(String(row.due_date).slice(5, 7));
    const bucket = byMonth.get(month);
    if (!bucket) continue;
    bucket.renewals += 1;
    if (row.status === "completed") bucket.completed += 1;
  }
  const woTrend = Array.from(byMonth.entries()).map(([m, v]) => ({
    month: MONTHS[m - 1],
    renewals: v.renewals,
    completed: v.completed,
  }));

  const utilityByMonth = new Map<string, number>();
  for (const row of utilityRows ?? []) {
    const key = String(row.period_month).slice(0, 7);
    utilityByMonth.set(key, (utilityByMonth.get(key) ?? 0) + Number(row.bill_amount ?? 0));
  }
  const utilityTrend = MONTHS.slice(0, 6).map((m, i) => ({
    month: m,
    cost: utilityByMonth.get(`${year}-${String(i + 1).padStart(2, "0")}`) ?? 0,
  }));

  timer.end({ rowCount: siteIssues.length });
  return {
    siteIssues,
    woTrend,
    utilityTrend: applyUtilityFallback(utilityTrend, filters.utilityBase),
  };
}
