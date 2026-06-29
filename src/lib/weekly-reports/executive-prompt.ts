import { E3_COMPANY_NAME, FEC_WEEKLY_REPORT_LOCATION_CODES } from "@/lib/weekly-reports/constants";
import type { ReportPriority } from "@/lib/weekly-reports/constants";
import { buildExecutiveReportJsonSchemaHint } from "@/lib/weekly-reports/executive-report-types";

const LOCATION_LIST = FEC_WEEKLY_REPORT_LOCATION_CODES.map((code) => {
  const labels: Record<string, string> = {
    "INF-CC": "InflataPark – City Center",
    "KDS-CC": "Kids Driving School – City Center",
    "UA-DM": "Urban Arena – Doha Mall",
    "KDS-DM": "Kids Driving School Mini – Doha Mall",
    "CB-VM": "Crayons & Bricks – Vendome Mall",
    "CB-DSM": "Crayons & Bricks – Dar Al Salam Mall",
    "CAR-AP": "Carousel – Aspire Park",
  };
  return labels[code] ?? code;
}).join("\n- ");

export const EXECUTIVE_REPORT_SYSTEM_PROMPT = `You are an experienced COO and Head of Operations for a multi-location Family Entertainment Center business.
Generate a CEO/GM weekly executive report based on supervisor reports submitted from all locations.
Do not rewrite supervisor reports verbatim. Analyze the data, compare locations, identify trends, detect missing information, highlight risks, and prepare a concise executive-level report.

Company: ${E3_COMPANY_NAME}

Locations:
- ${LOCATION_LIST}

Rules:
- Concise, direct, no exaggeration, do not hide risks.
- Mention missing data clearly when supervisor reports or metrics are absent.
- Combine duplicate issues across locations.
- Executive language; avoid long paragraphs.
- Tables where useful; output must be valid JSON matching the schema exactly.
- Suitable for CEO/GM consumption.

Return ONLY valid JSON with these 14 top-level sections:
meta, executive_summary, kpi_dashboard, location_ranking, top_achievements, top_risks, maintenance_summary, compliance_summary, customer_experience, staffing_summary, financial_summary, decisions_required, next_week_priorities, head_of_operations_assessment, action_tracker

KPI dashboard metrics (with RAG status green/amber/red): Revenue, Footfall, Staff attendance, Complaints, Incidents, Maintenance, Compliance score, Inventory health, Critical risks, Pending approvals.

Compliance summary fields: qcdd, fire_alarm, fire_fighting, cctv, pest_control, hvac, kitchen, medical_certs, licenses, amc, renewals, expired.

Risk/priority levels: Critical, High, Medium, Low.`;

export interface WeeklyReportForPrompt {
  location_code: string;
  location_name: string;
  revenue: number | null;
  footfall: number | null;
  staff_attendance_pct: number | null;
  customer_complaints: number;
  incidents_count: number;
  maintenance_open: number;
  maintenance_closed?: number;
  compliance_score: number | null;
  inventory_issues?: string | null;
  top_achievements: string | null;
  top_challenges: string | null;
  critical_issues: string | null;
  support_required: string | null;
  next_week_action_plan?: string | null;
  positive_feedback?: string | null;
  compliance_updates?: string | null;
  marketing_events?: string | null;
  priority: ReportPriority;
  missing_info_flag?: boolean;
}

export function buildExecutiveReportUserPrompt(
  weekStart: string,
  weekEnd: string,
  reports: WeeklyReportForPrompt[],
  missingLocationLabels: string[],
): string {
  const estate = {
    revenue: reports.reduce((s, r) => s + Number(r.revenue ?? 0), 0),
    footfall: reports.reduce((s, r) => s + Number(r.footfall ?? 0), 0),
    complaints: reports.reduce((s, r) => s + r.customer_complaints, 0),
    incidents: reports.reduce((s, r) => s + r.incidents_count, 0),
    maintenance_open: reports.reduce((s, r) => s + r.maintenance_open, 0),
  };

  return `Generate the executive weekly report for week ${weekStart} to ${weekEnd}.

Locations reporting: ${reports.length}
Locations missing submission: ${missingLocationLabels.length ? missingLocationLabels.join(", ") : "None"}

Estate aggregate:
${JSON.stringify(estate, null, 2)}

Supervisor report inputs (analyze — do not copy verbatim):
${JSON.stringify(reports, null, 2)}

Populate meta.company as "${E3_COMPANY_NAME}", meta.week_start, meta.week_end, meta.generated_at (ISO), meta.generation_mode as "ai", meta.locations_reporting and meta.locations_missing.

Score each location 0-100 in location_ranking. Include management_comment per location.

JSON schema:
${buildExecutiveReportJsonSchemaHint()}`;
}
