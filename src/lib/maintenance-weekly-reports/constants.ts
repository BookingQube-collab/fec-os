import {
  EDITABLE_STATUSES,
  REPORT_PRIORITIES,
  REPORT_PRIORITY_LABELS,
  WEEKLY_REPORT_STATUSES,
  WEEKLY_REPORT_STATUS_LABELS,
  formatWeekLabel,
  getWeekBounds,
  priorityRag,
  statusRag,
  weekEndSunday,
  weekStartMonday,
  type ReportPriority,
  type WeeklyReportStatus,
} from "@/lib/weekly-reports/constants";

export {
  EDITABLE_STATUSES,
  REPORT_PRIORITIES,
  REPORT_PRIORITY_LABELS,
  WEEKLY_REPORT_STATUSES,
  WEEKLY_REPORT_STATUS_LABELS,
  formatWeekLabel,
  getWeekBounds,
  priorityRag,
  statusRag,
  weekEndSunday,
  weekStartMonday,
  type ReportPriority,
  type WeeklyReportStatus,
};

export const MAINTENANCE_REPORT_TEAMS = ["maintenance", "logistics"] as const;
export type MaintenanceReportTeam = (typeof MAINTENANCE_REPORT_TEAMS)[number];

export const MAINTENANCE_TEAM_LABELS: Record<MaintenanceReportTeam, string> = {
  maintenance: "Maintenance",
  logistics: "Logistics",
};

export const MAINTENANCE_WEEKLY_REPORTS_NAV_ITEMS = [
  { href: "/maintenance/weekly-report", labelKey: "maintenanceWeeklyReports.nav.reports" },
  { href: "/maintenance/weekly-report/kpis", labelKey: "maintenanceWeeklyReports.nav.kpis" },
  { href: "/maintenance/weekly-report/review", labelKey: "maintenanceWeeklyReports.nav.review", capability: "maintenance.weekly_report.review" as const },
  { href: "/maintenance/weekly-report/executive", labelKey: "maintenanceWeeklyReports.nav.executive", capability: "maintenance.weekly_report.executive" as const },
] as const;

export function teamSubmitCapability(team: MaintenanceReportTeam): "maintenance.weekly_report.submit" | "maintenance.logistics_submit" {
  return team === "logistics" ? "maintenance.logistics_submit" : "maintenance.weekly_report.submit";
}
