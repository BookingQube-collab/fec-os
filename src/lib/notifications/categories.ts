/** Shared preference + in-app notification categories (no DB enum; text column). */
export const NOTIFICATION_CATEGORIES = [
  "general",
  "escalation",
  "kpi",
  "sop",
  "compliance",
  "snag",
  "inventory",
  "procurement",
  "maintenance",
  "events",
  "people",
  "hr_documents",
  "hr_leave",
  "hr_ot",
  "hr_disciplinary",
  "hr_payroll",
  "hr_recruitment",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
