import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { assertLocationAccess, ForbiddenError } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import {
  type ReportPriority,
  type WeeklyReportStatus,
  weekEndSunday,
} from "@/lib/weekly-reports/constants";
import {
  assembleExecutiveContent,
  normalizeExecutiveContent,
} from "@/lib/weekly-reports/executive-assembler";
import {
  buildExecutiveReportUserPrompt,
  EXECUTIVE_REPORT_SYSTEM_PROMPT,
  type WeeklyReportForPrompt,
} from "@/lib/weekly-reports/executive-prompt";
import {
  ExecutiveWeeklyReportSchema,
  type ExecutiveWeeklyReport,
} from "@/lib/weekly-reports/executive-report-types";
import { E3_COMPANY_NAME, FEC_WEEKLY_REPORT_LOCATION_CODES } from "@/lib/weekly-reports/constants";

export interface WeeklyReportRow {
  id: string;
  location_id: string;
  reporting_week_start: string;
  reporting_week_end: string;
  status: WeeklyReportStatus;
  priority: ReportPriority;
  submitted_by_name: string | null;
  revenue: number | null;
  footfall: number | null;
  staff_scheduled: number;
  staff_present: number;
  staff_attendance_pct: number | null;
  absentees_late: string | null;
  customer_complaints: number;
  positive_feedback: string | null;
  incidents_count: number;
  incidents_detail: string | null;
  maintenance_issues: string | null;
  maintenance_open: number;
  maintenance_closed: number;
  compliance_updates: string | null;
  compliance_score: number | null;
  inventory_issues: string | null;
  cashier_pos_issues: string | null;
  marketing_events: string | null;
  top_achievements: string | null;
  top_challenges: string | null;
  support_required: string | null;
  next_week_action_plan: string | null;
  critical_issues: string | null;
  review_remarks: string | null;
  missing_info_flag: boolean;
  reviewed_at: string | null;
  submitted_at: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  executive_report_id: string | null;
  created_at: string;
  updated_at: string;
  locations?: { code: string; name: string; city: string | null } | null;
}

export interface WeeklyReportFilters {
  weekStart?: string | null;
  locationId?: string | null;
  status?: string | null;
}

export interface ExecutiveDashboardKpis {
  total_revenue: number;
  total_footfall: number;
  avg_attendance_pct: number;
  total_complaints: number;
  total_incidents: number;
  maintenance_open: number;
  maintenance_closed: number;
  avg_compliance_score: number;
  inventory_issues_count: number;
  critical_risks: number;
  pending_approvals: number;
  upcoming_renewals: number;
  reports_submitted: number;
  reports_expected: number;
}

export interface ExecutiveChartData {
  revenue_by_location: { location: string; code: string; value: number }[];
  footfall_by_location: { location: string; code: string; value: number }[];
  complaints_trend: { week: string; value: number }[];
  incident_trend: { week: string; value: number }[];
  maintenance_status: { open: number; closed: number };
  compliance_by_location: { location: string; code: string; score: number }[];
  attendance_by_location: { location: string; code: string; pct: number }[];
}

const REPORT_COLUMNS = `
  id, location_id, reporting_week_start, reporting_week_end, status, priority,
  submitted_by_name, revenue, footfall, staff_scheduled, staff_present, staff_attendance_pct,
  absentees_late, customer_complaints, positive_feedback, incidents_count, incidents_detail,
  maintenance_issues, maintenance_open, maintenance_closed, compliance_updates, compliance_score,
  inventory_issues, cashier_pos_issues, marketing_events, top_achievements, top_challenges,
  support_required, next_week_action_plan, critical_issues, review_remarks, missing_info_flag,
  reviewed_at, submitted_at, created_by, reviewed_by, executive_report_id, created_at, updated_at
`;

async function attachLocations(
  context: AuthContext,
  rows: Omit<WeeklyReportRow, "locations">[],
): Promise<WeeklyReportRow[]> {
  const ids = [...new Set(rows.map((r) => r.location_id))];
  if (!ids.length) return rows as WeeklyReportRow[];
  const { data: sites } = await context.supabase
    .from("locations")
    .select("id, code, name, city")
    .in("id", ids);
  const byId = new Map((sites ?? []).map((s) => [s.id, { code: s.code, name: s.name, city: s.city }]));
  return rows.map((r) => ({
    ...r,
    locations: byId.get(r.location_id) ?? null,
  }));
}

export async function fetchWeeklyReports(
  context: AuthContext,
  filters: WeeklyReportFilters = {},
): Promise<WeeklyReportRow[]> {
  let q = context.supabase
    .from("weekly_reports")
    .select(REPORT_COLUMNS)
    .order("reporting_week_start", { ascending: false })
    .limit(200);

  if (filters.weekStart) q = q.eq("reporting_week_start", filters.weekStart);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.status) q = q.eq("status", filters.status);

  const { data, error } = await q;
  if (error) throw error;
  return attachLocations(context, (data ?? []) as Omit<WeeklyReportRow, "locations">[]);
}

export async function fetchWeeklyReportById(
  context: AuthContext,
  id: string,
): Promise<WeeklyReportRow & { attachments: Record<string, unknown>[]; comments: Record<string, unknown>[] }> {
  const { data, error } = await context.supabase
    .from("weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw error;

  const [withLoc] = await attachLocations(context, [data as Omit<WeeklyReportRow, "locations">]);

  const [{ data: attachments }, { data: comments }] = await Promise.all([
    context.supabase
      .from("weekly_report_attachments")
      .select("id, file_name, mime_type, file_size, created_at")
      .eq("weekly_report_id", id)
      .order("created_at"),
    context.supabase
      .from("report_review_comments")
      .select("id, comment_text, is_internal, priority, created_at, created_by")
      .eq("weekly_report_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    ...withLoc,
    attachments: attachments ?? [],
    comments: comments ?? [],
  };
}

export async function fetchExecutiveDashboard(
  context: AuthContext,
  weekStart: string,
): Promise<{ kpis: ExecutiveDashboardKpis; charts: ExecutiveChartData }> {
  const { data: reports, error } = await context.supabase
    .from("weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("reporting_week_start", weekStart);
  if (error) throw error;

  const rows = await attachLocations(context, (reports ?? []) as Omit<WeeklyReportRow, "locations">[]);
  const submitted = rows.filter((r) => r.status !== "draft");

  const totalRevenue = submitted.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalFootfall = submitted.reduce((s, r) => s + Number(r.footfall ?? 0), 0);
  const attendancePcts = submitted
    .map((r) => Number(r.staff_attendance_pct ?? 0))
    .filter((v) => v > 0);
  const avgAttendance =
    attendancePcts.length > 0
      ? attendancePcts.reduce((a, b) => a + b, 0) / attendancePcts.length
      : 0;

  const complianceScores = submitted
    .map((r) => r.compliance_score)
    .filter((v): v is number => v != null);
  const avgCompliance =
    complianceScores.length > 0
      ? complianceScores.reduce((a, b) => a + b, 0) / complianceScores.length
      : 0;

  const { count: expectedCount } = await context.supabase
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .in("code", ["INF-CC", "KDS-CC", "UA-DM", "KDS-DM", "CB-VM", "CB-DSM", "CAR-AP"]);

  const { count: renewalCount } = await context.supabase
    .from("location_compliance_items_enriched")
    .select("id", { count: "exact", head: true })
    .in("computed_status", ["Due Soon", "Expiring", "Renewal Due"]);

  const kpis: ExecutiveDashboardKpis = {
    total_revenue: totalRevenue,
    total_footfall: totalFootfall,
    avg_attendance_pct: Math.round(avgAttendance * 100) / 100,
    total_complaints: submitted.reduce((s, r) => s + r.customer_complaints, 0),
    total_incidents: submitted.reduce((s, r) => s + r.incidents_count, 0),
    maintenance_open: submitted.reduce((s, r) => s + r.maintenance_open, 0),
    maintenance_closed: submitted.reduce((s, r) => s + r.maintenance_closed, 0),
    avg_compliance_score: Math.round(avgCompliance * 100) / 100,
    inventory_issues_count: submitted.filter((r) => r.inventory_issues?.trim()).length,
    critical_risks: submitted.filter((r) => r.priority === "critical").length,
    pending_approvals: rows.filter((r) =>
      ["submitted", "under_review"].includes(r.status),
    ).length,
    upcoming_renewals: renewalCount ?? 0,
    reports_submitted: submitted.length,
    reports_expected: expectedCount ?? 7,
  };

  const charts: ExecutiveChartData = {
    revenue_by_location: submitted.map((r) => ({
      location: r.locations?.name ?? "Unknown",
      code: r.locations?.code ?? "",
      value: Number(r.revenue ?? 0),
    })),
    footfall_by_location: submitted.map((r) => ({
      location: r.locations?.name ?? "Unknown",
      code: r.locations?.code ?? "",
      value: Number(r.footfall ?? 0),
    })),
    complaints_trend: await fetchWeeklyTrend(context, "customer_complaints", 8),
    incident_trend: await fetchWeeklyTrend(context, "incidents_count", 8),
    maintenance_status: {
      open: kpis.maintenance_open,
      closed: kpis.maintenance_closed,
    },
    compliance_by_location: submitted
      .filter((r) => r.compliance_score != null)
      .map((r) => ({
        location: r.locations?.name ?? "Unknown",
        code: r.locations?.code ?? "",
        score: Number(r.compliance_score),
      })),
    attendance_by_location: submitted.map((r) => ({
      location: r.locations?.name ?? "Unknown",
      code: r.locations?.code ?? "",
      pct: Number(r.staff_attendance_pct ?? 0),
    })),
  };

  return { kpis, charts };
}

async function fetchWeeklyTrend(
  context: AuthContext,
  field: "customer_complaints" | "incidents_count",
  weeks: number,
): Promise<{ week: string; value: number }[]> {
  const { data, error } = await context.supabase
    .from("weekly_reports")
    .select(`reporting_week_start, ${field}`)
    .neq("status", "draft")
    .order("reporting_week_start", { ascending: false })
    .limit(weeks * 7);
  if (error) throw error;

  const byWeek = new Map<string, number>();
  for (const row of data ?? []) {
    const w = row.reporting_week_start as string;
    const rec = row as Record<string, unknown>;
    byWeek.set(w, (byWeek.get(w) ?? 0) + Number(rec[field] ?? 0));
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-weeks)
    .map(([week, value]) => ({ week, value }));
}

export async function fetchExecutiveReports(
  context: AuthContext,
  weekStart?: string | null,
): Promise<Record<string, unknown>[]> {
  let q = context.supabase
    .from("executive_reports")
    .select("id, reporting_week_start, reporting_week_end, title, status, ai_generated, published_at, created_at")
    .order("reporting_week_start", { ascending: false })
    .limit(52);
  if (weekStart) q = q.eq("reporting_week_start", weekStart);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchExecutiveReportDetail(
  context: AuthContext,
  id: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await context.supabase
    .from("executive_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const [{ data: snapshot }, { data: actions }] = await Promise.all([
    context.supabase
      .from("report_kpi_snapshots")
      .select("*")
      .eq("executive_report_id", id)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.supabase
      .from("executive_report_actions")
      .select("*")
      .eq("executive_report_id", id)
      .order("priority"),
  ]);

  return { ...data, snapshot: snapshot ?? null, actions: actions ?? [] };
}

export async function generateExecutiveReportCore(
  context: AuthContext,
  weekStart: string,
): Promise<{ id: string; content: ExecutiveWeeklyReport; ai_generated: boolean }> {
  if (!canUserDo(context.roles ?? [], "weekly_reports.executive")) {
    throw new ForbiddenError();
  }

  const weekEnd = weekEndSunday(weekStart);
  const { data: reports, error } = await context.supabase
    .from("weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("reporting_week_start", weekStart)
    .in("status", ["approved", "included_in_executive", "submitted", "under_review"]);
  if (error) throw error;

  const rows = await attachLocations(context, (reports ?? []) as Omit<WeeklyReportRow, "locations">[]);
  const promptRows: WeeklyReportForPrompt[] = rows.map((r) => ({
    location_code: r.locations?.code ?? "",
    location_name: r.locations?.name ?? "",
    revenue: r.revenue != null ? Number(r.revenue) : null,
    footfall: r.footfall != null ? Number(r.footfall) : null,
    staff_attendance_pct: r.staff_attendance_pct != null ? Number(r.staff_attendance_pct) : null,
    customer_complaints: r.customer_complaints,
    incidents_count: r.incidents_count,
    maintenance_open: r.maintenance_open,
    maintenance_closed: r.maintenance_closed,
    compliance_score: r.compliance_score != null ? Number(r.compliance_score) : null,
    inventory_issues: r.inventory_issues,
    top_achievements: r.top_achievements,
    top_challenges: r.top_challenges,
    critical_issues: r.critical_issues,
    support_required: r.support_required,
    next_week_action_plan: r.next_week_action_plan,
    positive_feedback: r.positive_feedback,
    compliance_updates: r.compliance_updates,
    marketing_events: r.marketing_events,
    priority: r.priority,
    missing_info_flag: r.missing_info_flag,
  }));

  const reportedCodes = new Set(rows.map((r) => r.locations?.code).filter(Boolean));
  const missingLabels = FEC_WEEKLY_REPORT_LOCATION_CODES.filter((c) => !reportedCodes.has(c)).map(
    (c) => c,
  );

  let content: ExecutiveWeeklyReport;
  let aiGenerated = false;
  let narrative: string | null = null;

  const aiContent = await callAiExecutiveReport(weekStart, weekEnd, promptRows, missingLabels);
  if (aiContent) {
    content = aiContent;
    aiGenerated = true;
    narrative = aiContent.executive_summary.performance;
  } else {
    content = assembleExecutiveContent(weekStart, weekEnd, rows);
  }

  const title = `Weekly Executive Operations Report — ${weekStart}`;
  const { data: existing } = await context.supabase
    .from("executive_reports")
    .select("id")
    .eq("reporting_week_start", weekStart)
    .maybeSingle();

  let reportId: string;
  if (existing?.id) {
    const { data: updated, error: updErr } = await context.supabase
      .from("executive_reports")
      .update({
        content,
        narrative,
        ai_generated: aiGenerated,
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
      .from("executive_reports")
      .insert({
        reporting_week_start: weekStart,
        reporting_week_end: weekEnd,
        title,
        content,
        narrative,
        ai_generated: aiGenerated,
        status: "generated",
        generated_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    reportId = inserted.id;
  }

  const dashboard = await fetchExecutiveDashboard(context, weekStart);
  await context.supabase.from("report_kpi_snapshots").insert({
    executive_report_id: reportId,
    kpis: dashboard.kpis,
    charts: dashboard.charts,
    location_rankings: content.location_ranking.map((l, i) => ({
      location_code: "",
      location_name: l.location,
      rank: i + 1,
      score: l.score,
      highlights: l.strengths.join("; "),
    })),
  });

  if (content.action_tracker?.length) {
    await context.supabase.from("executive_report_actions").delete().eq("executive_report_id", reportId);
    await context.supabase.from("executive_report_actions").insert(
      content.action_tracker.map((a) => ({
        executive_report_id: reportId,
        action_text: a.action,
        owner_role: a.owner,
        due_date: a.deadline || null,
        priority: a.priority.toLowerCase(),
        created_by: context.userId,
      })),
    );
  }

  await context.supabase
    .from("weekly_reports")
    .update({ status: "included_in_executive", executive_report_id: reportId })
    .eq("reporting_week_start", weekStart)
    .in("status", ["approved", "submitted", "under_review"]);

  return { id: reportId, content, ai_generated: aiGenerated };
}

async function callAiExecutiveReport(
  weekStart: string,
  weekEnd: string,
  reports: WeeklyReportForPrompt[],
  missingLocationLabels: string[],
): Promise<ExecutiveWeeklyReport | null> {
  const userPrompt = buildExecutiveReportUserPrompt(weekStart, weekEnd, reports, missingLocationLabels);
  const messages = [
    { role: "system" as const, content: EXECUTIVE_REPORT_SYSTEM_PROMPT },
    { role: "user" as const, content: userPrompt },
  ];

  const lovableKey = process.env.LOVABLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const attempts: Array<{ url: string; headers: Record<string, string>; model: string; jsonMode?: boolean }> = [];
  if (lovableKey) {
    attempts.push({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      model: "google/gemini-3-flash-preview",
    });
  }
  if (openaiKey) {
    attempts.push({
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      jsonMode: true,
    });
  }

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: "POST",
        headers: attempt.headers,
        body: JSON.stringify({
          model: attempt.model,
          ...(attempt.jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages,
          temperature: 0.35,
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content;
      if (!text) continue;
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as unknown;
      const report = ExecutiveWeeklyReportSchema.parse(parsed);
      return {
        ...report,
        meta: {
          ...report.meta,
          company: E3_COMPANY_NAME,
          week_start: weekStart,
          week_end: weekEnd,
          generation_mode: "ai",
          generated_at: new Date().toISOString(),
        },
      };
    } catch {
      /* try next provider */
    }
  }
  return null;
}

export { normalizeExecutiveContent };

export { assertLocationAccess };
