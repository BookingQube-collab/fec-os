import { fmtQar } from "@/lib/currency";
import type { WeeklyReportRow } from "@/lib/queries/weekly-reports.core";
import {
  E3_COMPANY_NAME,
  FEC_WEEKLY_REPORT_LOCATION_CODES,
  type ReportPriority,
} from "@/lib/weekly-reports/constants";
import type {
  ExecutiveWeeklyReport,
  RagStatus,
  RiskLevel,
} from "@/lib/weekly-reports/executive-report-types";

const LOCATION_LABELS: Record<string, string> = {
  "INF-CC": "InflataPark – City Center",
  "KDS-CC": "Kids Driving School – City Center",
  "UA-DM": "Urban Arena – Doha Mall",
  "KDS-DM": "Kids Driving School Mini – Doha Mall",
  "CB-VM": "Crayons & Bricks – Vendome Mall",
  "CB-DSM": "Crayons & Bricks – Dar Al Salam Mall",
  "CAR-AP": "Carousel – Aspire Park",
};

function labelFor(code: string, name: string): string {
  return LOCATION_LABELS[code] ?? name;
}

function ragFromPct(pct: number | null | undefined, greenAt: number, amberAt: number): RagStatus {
  if (pct == null || pct === 0) return "amber";
  if (pct >= greenAt) return "green";
  if (pct >= amberAt) return "amber";
  return "red";
}

function ragFromCount(count: number, greenMax: number, amberMax: number): RagStatus {
  if (count <= greenMax) return "green";
  if (count <= amberMax) return "amber";
  return "red";
}

function priorityToRisk(p: ReportPriority): RiskLevel {
  const map: Record<ReportPriority, RiskLevel> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  return map[p];
}

function scoreReport(r: WeeklyReportRow): number {
  let score = 70;
  if (r.revenue != null) score += Math.min(Number(r.revenue) / 10000, 15);
  if (r.staff_attendance_pct != null) score += Number(r.staff_attendance_pct) * 0.15;
  if (r.compliance_score != null) score += Number(r.compliance_score) * 0.1;
  score -= r.customer_complaints * 3;
  score -= r.incidents_count * 5;
  score -= r.maintenance_open * 2;
  if (r.priority === "critical") score -= 15;
  if (r.priority === "high") score -= 8;
  if (r.missing_info_flag) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function missingLocationLabels(reports: WeeklyReportRow[]): string[] {
  const reported = new Set(reports.map((r) => r.locations?.code).filter(Boolean));
  return FEC_WEEKLY_REPORT_LOCATION_CODES.filter((c) => !reported.has(c)).map(
    (c) => LOCATION_LABELS[c] ?? c,
  );
}

function estateRiskLevel(
  complaints: number,
  incidents: number,
  maintOpen: number,
  missingCount: number,
): RiskLevel {
  if (incidents >= 5 || maintOpen >= 15 || missingCount >= 3) return "Critical";
  if (incidents >= 3 || complaints >= 10 || missingCount >= 2) return "High";
  if (complaints >= 5 || maintOpen >= 8) return "Medium";
  return "Low";
}

export function assembleExecutiveContent(
  weekStart: string,
  weekEnd: string,
  reports: WeeklyReportRow[],
): ExecutiveWeeklyReport {
  const now = new Date().toISOString();
  const missing = missingLocationLabels(reports);
  const reporting = reports.map((r) => labelFor(r.locations?.code ?? "", r.locations?.name ?? "Unknown"));

  const totalRevenue = reports.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalFootfall = reports.reduce((s, r) => s + Number(r.footfall ?? 0), 0);
  const totalComplaints = reports.reduce((s, r) => s + r.customer_complaints, 0);
  const totalIncidents = reports.reduce((s, r) => s + r.incidents_count, 0);
  const maintOpen = reports.reduce((s, r) => s + r.maintenance_open, 0);
  const maintClosed = reports.reduce((s, r) => s + r.maintenance_closed, 0);
  const inventoryIssues = reports.filter((r) => r.inventory_issues?.trim()).length;
  const criticalCount = reports.filter((r) => r.priority === "critical").length;
  const pendingApprovals = reports.filter((r) =>
    ["submitted", "under_review"].includes(r.status),
  ).length;

  const attendancePcts = reports
    .map((r) => Number(r.staff_attendance_pct ?? 0))
    .filter((v) => v > 0);
  const avgAtt =
    attendancePcts.length > 0
      ? Math.round((attendancePcts.reduce((a, b) => a + b, 0) / attendancePcts.length) * 10) / 10
      : null;

  const complianceScores = reports
    .map((r) => r.compliance_score)
    .filter((v): v is number => v != null);
  const avgCompliance =
    complianceScores.length > 0
      ? complianceScores.reduce((a, b) => a + b, 0) / complianceScores.length
      : null;

  const ranked = [...reports]
    .map((r) => ({
      r,
      score: scoreReport(r),
      label: labelFor(r.locations?.code ?? "", r.locations?.name ?? "Unknown"),
    }))
    .sort((a, b) => b.score - a.score);

  const achievements = reports
    .flatMap((r) =>
      (r.top_achievements?.split(/\n|;/).map((s) => s.trim()).filter(Boolean) ?? []).slice(0, 2).map(
        (title) => ({
          title,
          location: labelFor(r.locations?.code ?? "", r.locations?.name ?? ""),
          detail: "Reported by site supervisor",
        }),
      ),
    )
    .slice(0, 6);

  if (!achievements.length && totalRevenue > 0) {
    achievements.push({
      title: "Estate revenue recorded for the week",
      location: "Estate-wide",
      detail: `Combined revenue ${fmtQar(totalRevenue)} across ${reports.length} location(s)`,
    });
  }

  const risks: ExecutiveWeeklyReport["top_risks"] = [];
  if (totalIncidents > 0) {
    risks.push({
      severity: totalIncidents >= 3 ? "High" : "Medium",
      title: "Operational incidents logged",
      impact: `${totalIncidents} incident(s) estate-wide`,
      recommended_action: "Confirm RCA and corrective actions with site GMs",
    });
  }
  if (maintOpen > 5) {
    risks.push({
      severity: maintOpen >= 10 ? "High" : "Medium",
      title: "Maintenance backlog",
      impact: `${maintOpen} open maintenance items`,
      recommended_action: "Prioritize urgent tickets and vendor follow-up",
    });
  }
  for (const r of reports.filter((x) => x.priority === "critical" || x.priority === "high")) {
    risks.push({
      severity: priorityToRisk(r.priority),
      title: r.critical_issues?.slice(0, 100) ?? r.top_challenges?.slice(0, 100) ?? "Elevated site priority",
      impact: r.top_challenges?.slice(0, 120) ?? "Supervisor flagged priority",
      recommended_action: r.support_required?.slice(0, 120) ?? "HoO follow-up required",
      location: labelFor(r.locations?.code ?? "", r.locations?.name ?? ""),
    });
  }
  if (missing.length) {
    risks.push({
      severity: "Medium",
      title: "Missing supervisor weekly submissions",
      impact: `No report: ${missing.join(", ")}`,
      recommended_action: "Enforce weekly submission deadline — Monday 10:00",
    });
  }

  const actionTracker: ExecutiveWeeklyReport["action_tracker"] = ranked
    .filter(({ r }) => r.maintenance_open > 0 || r.support_required?.trim())
    .slice(0, 6)
    .map(({ r, label }) => ({
      action: r.support_required?.slice(0, 100) ?? "Clear maintenance backlog",
      location: label,
      owner: "Site GM",
      priority: priorityToRisk(r.priority),
      deadline: weekEnd,
      status: "Open",
    }));

  const riskLevel = estateRiskLevel(totalComplaints, totalIncidents, maintOpen, missing.length);

  return {
    meta: {
      company: E3_COMPANY_NAME,
      week_start: weekStart,
      week_end: weekEnd,
      generated_at: now,
      generation_mode: "rule_based",
      locations_reporting: reporting,
      locations_missing: missing,
    },
    executive_summary: {
      performance:
        totalRevenue > 0
          ? `Estate revenue ${fmtQar(totalRevenue)}; footfall ${totalFootfall.toLocaleString()} for the week.`
          : "Revenue data incomplete — verify supervisor submissions and finance feeds.",
      health:
        maintOpen <= 10 && totalIncidents <= 2
          ? "Operations stable with manageable open maintenance."
          : "Operational pressure elevated — review maintenance backlog and incident follow-up.",
      achievements: achievements.slice(0, 5).map((a) => a.title),
      concerns: [
        ...(missing.length ? [`Missing reports: ${missing.join(", ")}`] : []),
        ...(totalIncidents ? [`${totalIncidents} incidents recorded`] : []),
        ...(maintOpen > 5 ? [`${maintOpen} open maintenance items`] : []),
      ],
      risk_level: riskLevel,
      recommendation:
        missing.length > 0
          ? "Confirm missing site submissions and address top estate risks before Monday leadership meeting."
          : "Focus on overdue maintenance and staffing for weekend peak.",
    },
    kpi_dashboard: [
      { metric: "Revenue", value: fmtQar(totalRevenue), rag: totalRevenue > 0 ? "green" : "amber", note: totalRevenue > 0 ? undefined : "Missing data" },
      { metric: "Footfall", value: totalFootfall.toLocaleString(), rag: totalFootfall > 0 ? "green" : "amber" },
      { metric: "Staff attendance", value: avgAtt != null ? `${avgAtt}%` : "—", rag: ragFromPct(avgAtt, 92, 85), note: avgAtt == null ? "Missing data" : undefined },
      { metric: "Complaints", value: String(totalComplaints), rag: ragFromCount(totalComplaints, 3, 8) },
      { metric: "Incidents", value: String(totalIncidents), rag: ragFromCount(totalIncidents, 1, 3) },
      { metric: "Maintenance", value: `${maintOpen} open / ${maintClosed} closed`, rag: ragFromCount(maintOpen, 5, 12) },
      { metric: "Compliance score", value: avgCompliance != null ? `${avgCompliance.toFixed(0)}% avg` : "—", rag: ragFromPct(avgCompliance, 85, 70) },
      { metric: "Inventory health", value: `${inventoryIssues} site(s) flagged`, rag: ragFromCount(inventoryIssues, 1, 3) },
      { metric: "Critical risks", value: String(criticalCount), rag: ragFromCount(criticalCount, 0, 2) },
      { metric: "Pending approvals", value: String(pendingApprovals), rag: ragFromCount(pendingApprovals, 2, 5) },
    ],
    location_ranking: ranked.map(({ r, score, label }) => ({
      location: label,
      score,
      strengths: [
        ...(score >= 75 ? ["Overall score above target"] : []),
        ...((r.compliance_score ?? 0) >= 90 ? ["Strong compliance score"] : []),
        ...((r.staff_attendance_pct ?? 0) >= 92 ? ["Good staff attendance"] : []),
      ].slice(0, 3),
      weaknesses: [
        ...(r.customer_complaints > 2 ? [`${r.customer_complaints} complaints`] : []),
        ...(r.maintenance_open > 0 ? [`${r.maintenance_open} open maintenance`] : []),
        ...(r.missing_info_flag ? ["Missing information flagged"] : []),
      ].slice(0, 3),
      critical_issues: r.critical_issues?.split(/\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 3) ?? [],
      immediate_actions: [
        ...(r.maintenance_open > 0 ? ["Close open maintenance items"] : []),
        ...(r.support_required?.trim() ? [r.support_required.slice(0, 80)] : []),
      ].slice(0, 3),
      management_comment: r.review_remarks?.trim() || (r.submitted_at ? "Supervisor report received." : "Awaiting submission."),
    })),
    top_achievements: achievements,
    top_risks: risks.slice(0, 8),
    maintenance_summary: {
      open: maintOpen,
      closed: maintClosed,
      overdue: reports.filter((r) => r.maintenance_open > 0 && r.maintenance_issues?.toLowerCase().includes("overdue")).length,
      vendor_pending: 0,
      critical: reports.filter((r) => r.priority === "critical" && r.maintenance_open > 0).length,
      highlights: reports
        .filter((r) => r.maintenance_issues?.trim())
        .map((r) => `${r.locations?.name}: ${r.maintenance_issues!.slice(0, 80)}`)
        .slice(0, 5),
    },
    compliance_summary: {
      qcdd: summarizeCompliance(reports, /qcdd/i),
      fire_alarm: summarizeCompliance(reports, /fire alarm/i),
      fire_fighting: summarizeCompliance(reports, /fire fight/i),
      cctv: summarizeCompliance(reports, /cctv/i),
      pest_control: summarizeCompliance(reports, /pest/i),
      hvac: summarizeCompliance(reports, /hvac|air condition/i),
      kitchen: summarizeCompliance(reports, /kitchen|food/i),
      medical_certs: summarizeCompliance(reports, /medical|health cert/i),
      licenses: summarizeCompliance(reports, /license/i),
      amc: summarizeCompliance(reports, /amc/i),
      renewals: summarizeCompliance(reports, /renew/i),
      expired: reports.filter((r) => r.compliance_updates?.toLowerCase().includes("expir")).length
        ? `${reports.filter((r) => r.compliance_updates?.toLowerCase().includes("expir")).length} site(s) noted expiry items`
        : "No expiry issues reported",
      highlights: reports
        .filter((r) => r.compliance_updates?.trim())
        .map((r) => `${r.locations?.name}: ${r.compliance_updates!.slice(0, 80)}`)
        .slice(0, 5),
    },
    customer_experience: {
      complaints: totalComplaints,
      positive_feedback: reports
        .map((r) => r.positive_feedback?.trim())
        .filter(Boolean)
        .slice(0, 5) as string[],
      recurring_issues: reports
        .filter((r) => r.customer_complaints > 0)
        .map((r) => `${r.locations?.name}: ${r.customer_complaints} complaint(s)`)
        .slice(0, 5),
      root_causes: totalComplaints > 5 ? ["Wait times", "Staffing at peak"] : [],
      corrective_actions: totalComplaints > 0 ? ["GM review of open complaints within 48h"] : [],
    },
    staffing_summary: {
      attendance_pct: avgAtt,
      absenteeism: avgAtt != null ? `${Math.max(0, 100 - avgAtt).toFixed(1)}% implied absenteeism` : "Data not available",
      overtime: reports.filter((r) => r.absentees_late?.trim()).length
        ? `${reports.filter((r) => r.absentees_late?.trim()).length} site(s) reported absenteeism/lateness`
        : "No absenteeism notes",
      performance: "Review supervisor notes for performance incidents",
      training: "Confirm mandatory training completion with HR",
      staffing_needs: missing.length ? ["Supervisor report compliance from all sites"] : [],
    },
    financial_summary: {
      revenue: fmtQar(totalRevenue),
      targets: "Compare against weekly revenue target in Revenue module",
      events: reports.filter((r) => r.marketing_events?.trim()).length
        ? `${reports.filter((r) => r.marketing_events?.trim()).length} site(s) reported events/promotions`
        : "No event notes submitted",
      birthdays: "See Bookings module for party pipeline",
      promotions: reports.map((r) => r.marketing_events?.trim()).filter(Boolean).slice(0, 3).join("; ") || "—",
      opportunities: totalRevenue > 0 ? ["Upsell packages at top-performing sites"] : ["Verify revenue data completeness"],
    },
    decisions_required: reports
      .filter((r) => r.support_required?.trim())
      .slice(0, 5)
      .map((r) => ({
        issue: r.support_required!.slice(0, 120),
        impact: "Requires executive support or approval",
        recommended_decision: "Review and decide in leadership meeting",
        priority: priorityToRisk(r.priority),
        owner: "CEO/GM",
        required_date: weekEnd,
      })),
    next_week_priorities: reports
      .flatMap((r) =>
        (r.next_week_action_plan?.split(/\n|;/).map((s) => s.trim()).filter(Boolean) ?? []).slice(0, 2).map(
          (action) => ({
            action,
            owner: r.locations?.name ?? "Site GM",
            deadline: weekEnd,
            status: "Open",
          }),
        ),
      )
      .slice(0, 6),
    head_of_operations_assessment: `Week ${weekStart} to ${weekEnd}: Estate risk level ${riskLevel}. ${reporting.length} of ${FEC_WEEKLY_REPORT_LOCATION_CODES.length} locations submitted. ${ranked[0]?.label ?? "Top site"} leads the portfolio (score ${ranked[0]?.score ?? 0}). ${maintOpen > 0 ? `${maintOpen} maintenance items remain open.` : "Maintenance backlog within tolerance."} Recommend CEO/GM focus on top risks and decisions queue.`,
    action_tracker: actionTracker,
  };
}

function summarizeCompliance(reports: WeeklyReportRow[], pattern: RegExp): string {
  const notes = reports
    .filter((r) => pattern.test(r.compliance_updates ?? ""))
    .map((r) => r.compliance_updates!.slice(0, 60));
  if (notes.length) return notes.join("; ");
  const any = reports.filter((r) => r.compliance_updates?.trim()).length;
  return any ? "See site compliance notes" : "No updates submitted";
}

/** Legacy flat content → structured report for older records */
export function normalizeExecutiveContent(content: unknown): ExecutiveWeeklyReport | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  if (c.meta && c.executive_summary && c.kpi_dashboard) {
    return content as ExecutiveWeeklyReport;
  }
  return null;
}
