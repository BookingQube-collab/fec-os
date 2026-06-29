import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import {
  MAINTENANCE_TEAM_LABELS,
  type MaintenanceReportTeam,
  type ReportPriority,
  type WeeklyReportStatus,
  weekEndSunday,
} from "@/lib/maintenance-weekly-reports/constants";
import { fetchMaintenanceWeeklyReport } from "@/lib/queries/maintenance-weekly-report.core";

export interface MaintenanceWeeklyReportLocation {
  code: string;
  name: string;
  city: string | null;
}

export interface MaintenanceWeeklyReportRow {
  id: string;
  team: MaintenanceReportTeam;
  location_id: string;
  locations?: MaintenanceWeeklyReportLocation | null;
  reporting_week_start: string;
  reporting_week_end: string;
  status: WeeklyReportStatus;
  priority: ReportPriority;
  submitted_by_name: string | null;
  kpi_snapshot: Record<string, unknown>;
  top_achievements: string | null;
  top_challenges: string | null;
  support_required: string | null;
  next_week_action_plan: string | null;
  critical_issues: string | null;
  operational_notes: string | null;
  review_remarks: string | null;
  missing_info_flag: boolean;
  reviewed_at: string | null;
  submitted_at: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  executive_report_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceWeeklyReportFilters {
  weekStart?: string | null;
  team?: string | null;
  status?: string | null;
  locationId?: string | null;
}

export interface LogisticsWeeklyKpiSnapshot {
  requests_submitted: number;
  requests_completed: number;
  requests_pending: number;
  requests_urgent: number;
  items_dispatched: number;
  avg_fulfillment_days: number;
  by_location: Array<{ code: string; count: number }>;
  by_category: Array<{ category: string; count: number }>;
}

export interface MaintenanceExecutiveContent {
  meta: {
    week_start: string;
    week_end: string;
    generated_at: string;
    generation_mode: "rule_based";
  };
  executive_summary: string;
  maintenance: Record<string, unknown> | null;
  logistics: Record<string, unknown> | null;
  combined_kpis: Record<string, unknown>;
  action_tracker: Array<{ action: string; owner: string; priority: string }>;
}

const REPORT_COLUMNS = `
  id, team, location_id, reporting_week_start, reporting_week_end, status, priority,
  submitted_by_name, kpi_snapshot, top_achievements, top_challenges, support_required,
  next_week_action_plan, critical_issues, operational_notes, review_remarks,
  missing_info_flag, reviewed_at, submitted_at, created_by, reviewed_by,
  executive_report_id, created_at, updated_at
`;

async function attachLocations(
  context: AuthContext,
  rows: Omit<MaintenanceWeeklyReportRow, "locations">[],
): Promise<MaintenanceWeeklyReportRow[]> {
  const ids = [...new Set(rows.map((r) => r.location_id))];
  if (!ids.length) return rows as MaintenanceWeeklyReportRow[];
  const { data: sites } = await context.supabase
    .from("locations")
    .select("id, code, name, city")
    .in("id", ids);
  const byId = new Map(
    (sites ?? []).map((s) => [s.id, { code: s.code, name: s.name, city: s.city }]),
  );
  return rows.map((r) => ({
    ...r,
    locations: byId.get(r.location_id) ?? null,
  }));
}

export async function fetchLogisticsWeeklyKpis(
  context: AuthContext,
  weekStart: string,
  locationId?: string | null,
): Promise<LogisticsWeeklyKpiSnapshot> {
  const weekEnd = weekEndSunday(weekStart);
  const startIso = `${weekStart}T00:00:00`;
  const endIso = `${weekEnd}T23:59:59`;

  let locQ = context.supabase.from("locations").select("id, code").in("status", ["active", "maintenance"]);
  if (locationId) locQ = locQ.eq("id", locationId);
  const { data: locations } = await locQ;
  const locationIds = (locations ?? []).map((l) => l.id);
  const codeById = new Map((locations ?? []).map((l) => [l.id, l.code]));

  let reqQ = context.supabase
    .from("delivery_requests")
    .select("id, location_id, priority, status, created_at, dispatched_at")
    .is("deleted_at", null)
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (locationIds.length) reqQ = reqQ.in("location_id", locationIds);
  const { data: requests, error } = await reqQ;
  if (error) throw error;

  const rows = requests ?? [];
  const completed = rows.filter((r) => r.status === "completed");
  const pending = rows.filter((r) => !["completed", "rejected"].includes(r.status));
  const urgent = rows.filter((r) => r.priority === "urgent");

  const fulfillmentDays = completed
    .filter((r) => r.dispatched_at)
    .map((r) => {
      const ms = new Date(r.dispatched_at!).getTime() - new Date(r.created_at).getTime();
      return ms / (1000 * 60 * 60 * 24);
    });
  const avgFulfillment =
    fulfillmentDays.length > 0
      ? Math.round((fulfillmentDays.reduce((a, b) => a + b, 0) / fulfillmentDays.length) * 10) / 10
      : 0;

  const { data: items } = await context.supabase
    .from("delivery_request_items")
    .select("category, quantity_dispatched, delivery_request_id")
    .not("quantity_dispatched", "is", null);

  const requestIds = new Set(rows.map((r) => r.id));
  let itemsDispatched = 0;
  const catCounts = new Map<string, number>();
  for (const item of items ?? []) {
    if (!requestIds.has(item.delivery_request_id)) continue;
    const qty = Number(item.quantity_dispatched ?? 0);
    itemsDispatched += qty;
    catCounts.set(item.category, (catCounts.get(item.category) ?? 0) + qty);
  }

  const locCounts = new Map<string, number>();
  for (const r of rows) {
    const code = codeById.get(r.location_id) ?? "—";
    locCounts.set(code, (locCounts.get(code) ?? 0) + 1);
  }

  return {
    requests_submitted: rows.length,
    requests_completed: completed.length,
    requests_pending: pending.length,
    requests_urgent: urgent.length,
    items_dispatched: itemsDispatched,
    avg_fulfillment_days: avgFulfillment,
    by_location: [...locCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    by_category: [...catCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function buildTeamKpiSnapshot(
  context: AuthContext,
  team: MaintenanceReportTeam,
  weekStart: string,
  locationId?: string | null,
): Promise<Record<string, unknown>> {
  if (team === "maintenance") {
    const report = await fetchMaintenanceWeeklyReport(context, { weekStart, locationId });
    return report as unknown as Record<string, unknown>;
  }
  const logistics = await fetchLogisticsWeeklyKpis(context, weekStart, locationId);
  return logistics as unknown as Record<string, unknown>;
}

export async function fetchMaintenanceWeeklyReports(
  context: AuthContext,
  filters: MaintenanceWeeklyReportFilters = {},
): Promise<MaintenanceWeeklyReportRow[]> {
  let q = context.supabase
    .from("maintenance_weekly_reports")
    .select(REPORT_COLUMNS)
    .order("reporting_week_start", { ascending: false })
    .limit(100);

  if (filters.weekStart) q = q.eq("reporting_week_start", filters.weekStart);
  if (filters.team) q = q.eq("team", filters.team);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);

  const { data, error } = await q;
  if (error) throw error;
  return attachLocations(context, (data ?? []) as Omit<MaintenanceWeeklyReportRow, "locations">[]);
}

export async function fetchMaintenanceWeeklyReportById(
  context: AuthContext,
  id: string,
): Promise<MaintenanceWeeklyReportRow & { attachments: Record<string, unknown>[]; comments: Record<string, unknown>[] }> {
  const { data, error } = await context.supabase
    .from("maintenance_weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw error;

  const [withLoc] = await attachLocations(context, [data as Omit<MaintenanceWeeklyReportRow, "locations">]);

  const [{ data: attachments }, { data: comments }] = await Promise.all([
    context.supabase
      .from("maintenance_weekly_report_attachments")
      .select("id, file_name, mime_type, file_size, content_base64, created_at")
      .eq("maintenance_weekly_report_id", id)
      .order("created_at"),
    context.supabase
      .from("maintenance_report_review_comments")
      .select("id, comment_text, is_internal, priority, created_at, created_by")
      .eq("maintenance_weekly_report_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    ...withLoc,
    attachments: attachments ?? [],
    comments: comments ?? [],
  };
}

export async function fetchMaintenanceExecutiveReports(
  context: AuthContext,
  weekStart?: string | null,
): Promise<Record<string, unknown>[]> {
  let q = context.supabase
    .from("maintenance_executive_reports")
    .select("id, reporting_week_start, reporting_week_end, title, status, ai_generated, published_at, created_at")
    .order("reporting_week_start", { ascending: false })
    .limit(52);
  if (weekStart) q = q.eq("reporting_week_start", weekStart);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchMaintenanceExecutiveReportDetail(
  context: AuthContext,
  id: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await context.supabase
    .from("maintenance_executive_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: snapshot } = await context.supabase
    .from("maintenance_report_kpi_snapshots")
    .select("*")
    .eq("maintenance_executive_report_id", id)
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { ...data, snapshot: snapshot ?? null };
}

function combineNarrativeField(
  reports: MaintenanceWeeklyReportRow[],
  field: keyof Pick<
    MaintenanceWeeklyReportRow,
    | "top_achievements"
    | "top_challenges"
    | "critical_issues"
    | "support_required"
    | "next_week_action_plan"
    | "operational_notes"
  >,
): string | null {
  const parts = reports
    .map((r) => {
      const text = r[field]?.trim();
      if (!text) return null;
      const label = r.locations?.code ?? r.location_id.slice(0, 8);
      return `[${label}] ${text}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

function aggregateMaintenanceKpiSnapshot(reports: MaintenanceWeeklyReportRow[]): Record<string, unknown> {
  if (!reports.length) return {};
  const summaries = reports.map((r) => ((r.kpi_snapshot ?? {}).summary ?? {}) as Record<string, number>);
  const sum = (key: string) => summaries.reduce((acc, s) => acc + (s[key] ?? 0), 0);
  const slaValues = summaries.map((s) => s.sla_compliance_pct ?? 100).filter((v) => v > 0);
  const avgSla =
    slaValues.length > 0 ? Math.round(slaValues.reduce((a, b) => a + b, 0) / slaValues.length) : 100;

  const issuesByLocation = new Map<string, number>();
  for (const r of reports) {
    const items = ((r.kpi_snapshot ?? {}).issues_by_location as Array<{ code: string; count: number }> | undefined) ?? [];
    for (const item of items) {
      issuesByLocation.set(item.code, (issuesByLocation.get(item.code) ?? 0) + item.count);
    }
  }

  return {
    summary: {
      raised: sum("raised"),
      completed: sum("completed"),
      pending: sum("pending"),
      overdue: sum("overdue"),
      sla_compliance_pct: avgSla,
      pm_completed: sum("pm_completed"),
      pm_pending: sum("pm_pending"),
    },
    issues_by_location: [...issuesByLocation.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    location_reports: reports.length,
  };
}

function aggregateLogisticsKpiSnapshot(reports: MaintenanceWeeklyReportRow[]): Record<string, unknown> {
  if (!reports.length) return {};
  const snapshots = reports.map((r) => r.kpi_snapshot ?? {});
  const sum = (key: string) => snapshots.reduce((acc, s) => acc + ((s[key] as number) ?? 0), 0);
  return {
    requests_submitted: sum("requests_submitted"),
    requests_completed: sum("requests_completed"),
    requests_pending: sum("requests_pending"),
    requests_urgent: sum("requests_urgent"),
    items_dispatched: sum("items_dispatched"),
    location_reports: reports.length,
  };
}

function teamRollup(
  reports: MaintenanceWeeklyReportRow[],
  team: MaintenanceReportTeam,
): Record<string, unknown> | null {
  const teamReports = reports.filter((r) => r.team === team);
  if (!teamReports.length) return null;
  const kpi_snapshot =
    team === "maintenance"
      ? aggregateMaintenanceKpiSnapshot(teamReports)
      : aggregateLogisticsKpiSnapshot(teamReports);
  return {
    status: teamReports.every((r) => r.status === "approved") ? "approved" : teamReports[0]!.status,
    kpi_snapshot,
    top_achievements: combineNarrativeField(teamReports, "top_achievements"),
    top_challenges: combineNarrativeField(teamReports, "top_challenges"),
    support_required: combineNarrativeField(teamReports, "support_required"),
    next_week_action_plan: combineNarrativeField(teamReports, "next_week_action_plan"),
    critical_issues: combineNarrativeField(teamReports, "critical_issues"),
    operational_notes: combineNarrativeField(teamReports, "operational_notes"),
    locations_reported: teamReports.map((r) => r.locations?.code ?? r.location_id),
  };
}

function assembleMaintenanceExecutiveContent(
  weekStart: string,
  weekEnd: string,
  reports: MaintenanceWeeklyReportRow[],
): MaintenanceExecutiveContent {
  const maintenanceReports = reports.filter((r) => r.team === "maintenance");
  const logisticsReports = reports.filter((r) => r.team === "logistics");
  const maintenance = teamRollup(reports, "maintenance");
  const logistics = teamRollup(reports, "logistics");

  const mKpi = (maintenance?.kpi_snapshot ?? {}) as Record<string, unknown>;
  const mSummary = (mKpi.summary ?? {}) as Record<string, number>;
  const lKpi = (logistics?.kpi_snapshot ?? {}) as Record<string, unknown>;

  const combined_kpis = {
    work_orders_raised: mSummary.raised ?? 0,
    work_orders_completed: mSummary.completed ?? 0,
    sla_compliance_pct: mSummary.sla_compliance_pct ?? 100,
    pm_pending: mSummary.pm_pending ?? 0,
    logistics_requests: (lKpi.requests_submitted as number) ?? 0,
    logistics_completed: (lKpi.requests_completed as number) ?? 0,
    items_dispatched: (lKpi.items_dispatched as number) ?? 0,
    pending_approvals: reports.filter((r) => ["submitted", "under_review"].includes(r.status)).length,
    teams_reported: new Set(reports.filter((r) => r.status !== "draft").map((r) => r.team)).size,
    teams_expected: 2,
    maintenance_locations_reported: maintenanceReports.filter((r) => r.status !== "draft").length,
    logistics_locations_reported: logisticsReports.filter((r) => r.status !== "draft").length,
  };

  const summaryParts: string[] = [];
  if (maintenanceReports.length) {
    summaryParts.push(
      `Maintenance (${maintenanceReports.length} location${maintenanceReports.length === 1 ? "" : "s"}): ${mSummary.completed ?? 0} jobs completed, SLA ${mSummary.sla_compliance_pct ?? 100}%, ${mSummary.overdue ?? 0} overdue.`,
    );
  } else {
    summaryParts.push("Maintenance team reports not submitted.");
  }
  if (logisticsReports.length) {
    summaryParts.push(
      `Logistics (${logisticsReports.length} location${logisticsReports.length === 1 ? "" : "s"}): ${(lKpi.requests_completed as number) ?? 0} deliveries completed, ${(lKpi.items_dispatched as number) ?? 0} items dispatched.`,
    );
  } else {
    summaryParts.push("Logistics team reports not submitted.");
  }

  const action_tracker: MaintenanceExecutiveContent["action_tracker"] = [];
  for (const r of reports) {
    const locLabel = r.locations?.code ? ` (${r.locations.code})` : "";
    if (r.next_week_action_plan?.trim()) {
      action_tracker.push({
        action: r.next_week_action_plan.split("\n")[0]!.slice(0, 200),
        owner: `${MAINTENANCE_TEAM_LABELS[r.team]}${locLabel}`,
        priority: r.priority,
      });
    }
    if (r.critical_issues?.trim()) {
      action_tracker.push({
        action: r.critical_issues.split("\n")[0]!.slice(0, 200),
        owner: `${MAINTENANCE_TEAM_LABELS[r.team]}${locLabel}`,
        priority: "critical",
      });
    }
  }

  return {
    meta: {
      week_start: weekStart,
      week_end: weekEnd,
      generated_at: new Date().toISOString(),
      generation_mode: "rule_based",
    },
    executive_summary: summaryParts.join(" "),
    maintenance,
    logistics,
    combined_kpis,
    action_tracker,
  };
}

export async function generateMaintenanceExecutiveReportCore(
  context: AuthContext,
  weekStart: string,
): Promise<{ id: string; content: MaintenanceExecutiveContent }> {
  if (!canUserDo(context.roles ?? [], "maintenance.weekly_report.executive")) {
    throw new ForbiddenError();
  }

  const weekEnd = weekEndSunday(weekStart);
  const { data: reports, error } = await context.supabase
    .from("maintenance_weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("reporting_week_start", weekStart)
    .in("status", ["approved", "included_in_executive", "submitted", "under_review"]);
  if (error) throw error;

  const rows = (reports ?? []) as Omit<MaintenanceWeeklyReportRow, "locations">[];
  const withLocations = await attachLocations(context, rows);
  const content = assembleMaintenanceExecutiveContent(weekStart, weekEnd, withLocations);
  const title = `Maintenance & Logistics Executive Report — ${weekStart}`;

  const { data: existing } = await context.supabase
    .from("maintenance_executive_reports")
    .select("id")
    .eq("reporting_week_start", weekStart)
    .maybeSingle();

  let reportId: string;
  if (existing?.id) {
    const { data: updated, error: updErr } = await context.supabase
      .from("maintenance_executive_reports")
      .update({
        content,
        narrative: content.executive_summary,
        ai_generated: false,
        status: "generated",
        generated_by: context.userId,
        title,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (updErr) throw updErr;
    reportId = updated.id;
  } else {
    const { data: inserted, error: insErr } = await context.supabase
      .from("maintenance_executive_reports")
      .insert({
        reporting_week_start: weekStart,
        reporting_week_end: weekEnd,
        title,
        content,
        narrative: content.executive_summary,
        ai_generated: false,
        status: "generated",
        generated_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    reportId = inserted.id;
  }

  await context.supabase.from("maintenance_report_kpi_snapshots").insert({
    maintenance_executive_report_id: reportId,
    kpis: content.combined_kpis,
    charts: {
      maintenance_summary: (content.maintenance?.kpi_snapshot as Record<string, unknown>)?.summary ?? {},
      logistics_summary: content.logistics?.kpi_snapshot ?? {},
    },
  });

  await context.supabase
    .from("maintenance_weekly_reports")
    .update({ status: "included_in_executive", executive_report_id: reportId })
    .eq("reporting_week_start", weekStart)
    .in("status", ["approved", "submitted", "under_review"]);

  return { id: reportId, content };
}
