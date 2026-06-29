import type { ReportPriority } from "@/lib/weekly-reports/constants";

export type WeeklyReportFormState = {
  location_id: string;
  reporting_week_start: string;
  submitted_by_name: string;
  revenue: string;
  footfall: string;
  staff_scheduled: string;
  staff_present: string;
  absentees_late: string;
  customer_complaints: string;
  positive_feedback: string;
  incidents_count: string;
  incidents_detail: string;
  maintenance_issues: string;
  maintenance_open: string;
  maintenance_closed: string;
  compliance_updates: string;
  compliance_score: string;
  inventory_issues: string;
  cashier_pos_issues: string;
  marketing_events: string;
  top_achievements: string;
  top_challenges: string;
  support_required: string;
  next_week_action_plan: string;
  critical_issues: string;
  priority: ReportPriority;
};

export const FORM_SECTION_KEYS = [
  "weekLocation",
  "kpiSnapshot",
  "operations",
  "peopleCustomer",
  "highlights",
  "nextWeek",
] as const;

export type FormSectionKey = (typeof FORM_SECTION_KEYS)[number];

export function attendancePct(scheduled: string, present: string): number | null {
  const s = Number(scheduled);
  const p = Number(present);
  if (!s || s <= 0) return null;
  return Math.round((p / s) * 10000) / 100;
}

export function isSectionComplete(key: FormSectionKey, form: WeeklyReportFormState): boolean {
  switch (key) {
    case "weekLocation":
      return Boolean(form.location_id && form.reporting_week_start);
    case "kpiSnapshot":
      return form.revenue !== "" && form.footfall !== "";
    case "operations":
      return Boolean(
        form.maintenance_issues.trim() ||
          form.compliance_updates.trim() ||
          form.inventory_issues.trim() ||
          form.cashier_pos_issues.trim() ||
          form.marketing_events.trim() ||
          Number(form.maintenance_open) > 0 ||
          Number(form.maintenance_closed) > 0 ||
          form.compliance_score !== "",
      );
    case "peopleCustomer":
      return Boolean(
        form.absentees_late.trim() ||
          form.positive_feedback.trim() ||
          form.incidents_detail.trim() ||
          Number(form.incidents_count) > 0 ||
          Number(form.customer_complaints) > 0,
      );
    case "highlights":
      return Boolean(
        form.top_achievements.trim() ||
          form.top_challenges.trim() ||
          form.support_required.trim() ||
          form.critical_issues.trim(),
      );
    case "nextWeek":
      return Boolean(form.next_week_action_plan.trim());
    default:
      return false;
  }
}

export function completedSectionCount(form: WeeklyReportFormState): number {
  return FORM_SECTION_KEYS.filter((k) => isSectionComplete(k, form)).length;
}

/** Placeholder hints aligned with executive report language for quick-fill. */
export const QUICK_FILL_HINTS: Partial<Record<keyof WeeklyReportFormState, string>> = {
  top_achievements:
    "• Revenue target met\n• Zero safety incidents\n• Positive customer reviews on social media",
  top_challenges:
    "• Staff shortage on weekend shifts\n• Delayed vendor response for HVAC\n• Higher footfall than capacity on Friday",
  support_required:
    "• Approval for overtime budget\n• Replacement parts for carousel motor\n• Training session for new POS system",
  critical_issues:
    "• Fire extinguisher expiry in kitchen area — renew by Wednesday\n• CCTV camera 3 offline since Tuesday",
  next_week_action_plan:
    "1. Complete pest control follow-up inspection\n2. Schedule staff refresher training\n3. Launch weekend promotion campaign",
  maintenance_issues:
    "List open maintenance items, vendor status, and any overdue work orders.",
  compliance_updates:
    "QCDD, fire alarm test, CCTV review, pest control, HVAC filter change, kitchen hygiene, medical certs, licenses.",
  inventory_issues:
    "Low stock items, reorder needs, or wastage noted this week.",
  cashier_pos_issues:
    "POS downtime, cash reconciliation issues, or payment terminal faults.",
  marketing_events:
    "Birthday parties, school groups, promotions, or partnership events held/planned.",
  absentees_late:
    "Names, dates, and reasons for absences or late arrivals.",
  positive_feedback:
    "Customer compliments, 5-star reviews, or staff recognition.",
  incidents_detail:
    "Date, type, severity, action taken, and follow-up required for each incident.",
};

export function applyQuickFill(form: WeeklyReportFormState): WeeklyReportFormState {
  const next = { ...form };
  for (const [key, hint] of Object.entries(QUICK_FILL_HINTS) as [keyof WeeklyReportFormState, string][]) {
    if (!String(next[key]).trim()) {
      (next as Record<string, string>)[key] = hint;
    }
  }
  return next;
}
