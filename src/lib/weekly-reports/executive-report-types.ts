import { z } from "zod";

export type RagStatus = "green" | "amber" | "red";
export type RiskLevel = "Critical" | "High" | "Medium" | "Low";
export type GenerationMode = "ai" | "rule_based";

const RagStatusSchema = z.enum(["green", "amber", "red"]);
const RiskLevelSchema = z.enum(["Critical", "High", "Medium", "Low"]);

export const ExecutiveWeeklyReportSchema = z.object({
  meta: z.object({
    company: z.string(),
    week_start: z.string(),
    week_end: z.string(),
    generated_at: z.string(),
    generation_mode: z.enum(["ai", "rule_based"]),
    locations_reporting: z.array(z.string()),
    locations_missing: z.array(z.string()),
  }),
  executive_summary: z.object({
    performance: z.string(),
    health: z.string(),
    achievements: z.array(z.string()),
    concerns: z.array(z.string()),
    risk_level: RiskLevelSchema,
    recommendation: z.string(),
  }),
  kpi_dashboard: z.array(
    z.object({
      metric: z.string(),
      value: z.string(),
      rag: RagStatusSchema,
      note: z.string().optional(),
    }),
  ),
  location_ranking: z.array(
    z.object({
      location: z.string(),
      score: z.number(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      critical_issues: z.array(z.string()),
      immediate_actions: z.array(z.string()),
      management_comment: z.string(),
    }),
  ),
  top_achievements: z.array(
    z.object({
      title: z.string(),
      location: z.string().optional(),
      detail: z.string(),
    }),
  ),
  top_risks: z.array(
    z.object({
      severity: RiskLevelSchema,
      title: z.string(),
      impact: z.string(),
      recommended_action: z.string(),
      location: z.string().optional(),
    }),
  ),
  maintenance_summary: z.object({
    open: z.number(),
    closed: z.number(),
    overdue: z.number(),
    vendor_pending: z.number(),
    critical: z.number(),
    highlights: z.array(z.string()),
  }),
  compliance_summary: z.object({
    qcdd: z.string(),
    fire_alarm: z.string(),
    fire_fighting: z.string(),
    cctv: z.string(),
    pest_control: z.string(),
    hvac: z.string(),
    kitchen: z.string(),
    medical_certs: z.string(),
    licenses: z.string(),
    amc: z.string(),
    renewals: z.string(),
    expired: z.string(),
    highlights: z.array(z.string()),
  }),
  customer_experience: z.object({
    complaints: z.number(),
    positive_feedback: z.array(z.string()),
    recurring_issues: z.array(z.string()),
    root_causes: z.array(z.string()),
    corrective_actions: z.array(z.string()),
  }),
  staffing_summary: z.object({
    attendance_pct: z.number().nullable(),
    absenteeism: z.string(),
    overtime: z.string(),
    performance: z.string(),
    training: z.string(),
    staffing_needs: z.array(z.string()),
  }),
  financial_summary: z.object({
    revenue: z.string(),
    targets: z.string(),
    events: z.string(),
    birthdays: z.string(),
    promotions: z.string(),
    opportunities: z.array(z.string()),
  }),
  decisions_required: z.array(
    z.object({
      issue: z.string(),
      impact: z.string(),
      recommended_decision: z.string(),
      priority: RiskLevelSchema,
      owner: z.string(),
      required_date: z.string(),
    }),
  ),
  next_week_priorities: z.array(
    z.object({
      action: z.string(),
      owner: z.string(),
      deadline: z.string(),
      status: z.string(),
    }),
  ),
  head_of_operations_assessment: z.string(),
  action_tracker: z.array(
    z.object({
      action: z.string(),
      location: z.string(),
      owner: z.string(),
      priority: RiskLevelSchema,
      deadline: z.string(),
      status: z.string(),
    }),
  ),
});

export type ExecutiveWeeklyReport = z.infer<typeof ExecutiveWeeklyReportSchema>;
/** Stored in executive_reports.content */
export type ExecutiveReportContent = ExecutiveWeeklyReport;

export interface SupervisorReportContent {
  revenue?: number | null;
  footfall?: number | null;
  staff_attendance_pct?: number | null;
  complaints?: number;
  incidents?: number;
  maintenance_open?: number;
  maintenance_overdue?: number;
  compliance_score?: number | null;
  inventory_alerts?: number;
  critical_risks?: string[];
  pending_approvals?: number;
  achievements?: string[];
  risks?: Array<{ severity: RiskLevel; title: string; impact: string; action: string }>;
  maintenance_notes?: string[];
  compliance_notes?: string[];
  customer_notes?: string[];
  staffing_notes?: string[];
  financial_notes?: string[];
  decisions?: string[];
  priorities?: Array<{ action: string; owner: string; deadline: string }>;
  management_comment?: string;
  narrative?: string;
}

export interface LocationWeekInput {
  location_id: string;
  location_code: string;
  location_name: string;
  venue: string;
  source: "submitted" | "synthesized";
  content: SupervisorReportContent;
}

export interface WeeklyAggregateInput {
  company: string;
  week_start: string;
  week_end: string;
  locations: LocationWeekInput[];
  missing_location_labels: string[];
  estate: {
    revenue: number;
    footfall: number;
    complaints: number;
    incidents: number;
    maintenance_open: number;
    maintenance_overdue: number;
    compliance_expired: number;
    inventory_alerts: number;
    pending_approvals: number;
    attendance_pct: number | null;
  };
}

export type ExecutiveReportSectionKey =
  | "executiveSummary"
  | "kpiDashboard"
  | "locationRanking"
  | "topAchievements"
  | "topRisks"
  | "maintenanceSummary"
  | "complianceSummary"
  | "customerExperience"
  | "staffingSummary"
  | "financialSummary"
  | "decisionsRequired"
  | "nextWeekPriorities"
  | "headOfOperationsAssessment"
  | "actionTracker";

export const EXECUTIVE_REPORT_SECTIONS: ExecutiveReportSectionKey[] = [
  "executiveSummary",
  "kpiDashboard",
  "locationRanking",
  "topAchievements",
  "topRisks",
  "maintenanceSummary",
  "complianceSummary",
  "customerExperience",
  "staffingSummary",
  "financialSummary",
  "decisionsRequired",
  "nextWeekPriorities",
  "headOfOperationsAssessment",
  "actionTracker",
];

export function buildExecutiveReportJsonSchemaHint(): string {
  return `{ "meta": {...}, "executive_summary": {...}, "kpi_dashboard": [...], "location_ranking": [...], "top_achievements": [...], "top_risks": [...], "maintenance_summary": {...}, "compliance_summary": {...}, "customer_experience": {...}, "staffing_summary": {...}, "financial_summary": {...}, "decisions_required": [...], "next_week_priorities": [...], "head_of_operations_assessment": "string", "action_tracker": [...] }`;
}
