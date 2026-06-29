/** Events & Entertainment Enterprises E3 */
export const E3_COMPANY_NAME = "Events & Entertainment Enterprises E3";

export const WEEKLY_REPORT_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "sent_back",
  "approved",
  "included_in_executive",
  "closed",
] as const;

export type WeeklyReportStatus = (typeof WEEKLY_REPORT_STATUSES)[number];

export const REPORT_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

export const EXECUTIVE_REPORT_STATUSES = ["draft", "generated", "published", "archived"] as const;
export type ExecutiveReportStatus = (typeof EXECUTIVE_REPORT_STATUSES)[number];

/** Canonical FEC Qatar location codes for weekly reporting (7 venues). */
export const FEC_WEEKLY_REPORT_LOCATION_CODES = [
  "INF-CC",
  "KDS-CC",
  "UA-DM",
  "KDS-DM",
  "CB-VM",
  "CB-DSM",
  "CAR-AP",
] as const;

export const EXECUTIVE_REPORT_MODEL = "google/gemini-3-flash-preview";

/** Business locations mapped to DB location codes. */
export const E3_WEEKLY_LOCATIONS = [
  { code: "INF-CC", name: "InflataPark", venue: "City Center" },
  { code: "KDS-CC", name: "Kids Driving School", venue: "City Center" },
  { code: "UA-DM", name: "Urban Arena", venue: "Doha Mall" },
  { code: "KDS-DM", name: "Kids Driving School Mini", venue: "Doha Mall" },
  { code: "CB-VM", name: "Crayons & Bricks", venue: "Vendome Mall" },
  { code: "CB-DSM", name: "Crayons & Bricks", venue: "Dar Al Salam Mall" },
  { code: "CAR-AP", name: "Carousel", venue: "Aspire Park" },
] as const;

export function getWeekBounds(date?: Date): { week_start: string; week_end: string } {
  const week_start = weekStartMonday(date);
  return { week_start, week_end: weekEndSunday(week_start) };
}

export const WEEKLY_REPORTS_NAV_ITEMS = [
  { href: "/operations/weekly-reports", labelKey: "weeklyReports.nav.reports" },
  { href: "/operations/weekly-reports/review", labelKey: "weeklyReports.nav.review", capability: "weekly_reports.review" as const },
  { href: "/operations/weekly-reports/executive", labelKey: "weeklyReports.nav.executive", capability: "weekly_reports.executive" as const },
] as const;

/** @deprecated use weekly_reports.executive */
export const LEGACY_EXECUTIVE_CAPABILITY = "weekly_reports.generate" as const;

export const WEEKLY_REPORT_STATUS_LABELS: Record<WeeklyReportStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  sent_back: "Sent Back",
  approved: "Approved",
  included_in_executive: "In Executive Report",
  closed: "Closed",
};

export const REPORT_PRIORITY_LABELS: Record<ReportPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const EDITABLE_STATUSES: WeeklyReportStatus[] = ["draft", "sent_back"];

export function statusRag(status: WeeklyReportStatus): "green" | "amber" | "red" | "blue" | "gray" {
  switch (status) {
    case "approved":
    case "included_in_executive":
    case "closed":
      return "green";
    case "submitted":
    case "under_review":
      return "amber";
    case "sent_back":
      return "red";
    case "draft":
      return "gray";
    default:
      return "blue";
  }
}

export function priorityRag(priority: ReportPriority): "green" | "amber" | "red" | "blue" {
  switch (priority) {
    case "critical":
      return "red";
    case "high":
      return "amber";
    case "medium":
      return "blue";
    case "low":
      return "green";
    default:
      return "blue";
  }
}

/** ISO date (YYYY-MM-DD) for Monday of the week containing `date`. */
export function weekStartMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekEndSunday(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function formatWeekLabel(weekStart: string): string {
  const end = weekEndSunday(weekStart);
  const fmt = (s: string) =>
    new Date(`${s}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

export function submissionEventLabel(status: WeeklyReportStatus): string {
  return `weekly_report.${status}`;
}
