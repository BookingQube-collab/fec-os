export const DAILY_OPS_NAV_ITEMS = [
  { href: "/daily-ops", labelKey: "dailyOps.nav.dashboard" },
  { href: "/daily-ops/roster", labelKey: "dailyOps.nav.roster" },
  { href: "/daily-ops/briefings", labelKey: "dailyOps.nav.briefings" },
  { href: "/daily-ops/incidents", labelKey: "dailyOps.nav.incidents" },
  { href: "/daily-ops/inventory", labelKey: "dailyOps.nav.inventory" },
  { href: "/daily-ops/maintenance", labelKey: "dailyOps.nav.maintenance" },
  { href: "/daily-ops/complaints", labelKey: "dailyOps.nav.complaints" },
] as const;

export const STAFF_ROLES = [
  "venue_supervisor",
  "shift_lead",
  "crew",
  "technician",
  "cashier",
  "cleaner",
  "security",
  "other",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  venue_supervisor: "Venue Supervisor",
  shift_lead: "Shift Lead",
  crew: "Crew",
  technician: "Technician",
  cashier: "Cashier",
  cleaner: "Cleaner",
  security: "Security",
  other: "Other",
};

export const SHIFT_PERIODS = ["morning", "afternoon", "evening", "full_day"] as const;
export type ShiftPeriod = (typeof SHIFT_PERIODS)[number];

export const SHIFT_PERIOD_LABELS: Record<ShiftPeriod, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  full_day: "Full Day",
};

export const INCIDENT_TYPES = [
  "guest_injury",
  "staff_injury",
  "equipment_failure",
  "safety_near_miss",
  "security_issue",
  "fire_evacuation",
  "other",
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  guest_injury: "Guest Injury",
  staff_injury: "Staff Injury",
  equipment_failure: "Equipment Failure",
  safety_near_miss: "Safety Near-Miss",
  security_issue: "Security Issue",
  fire_evacuation: "Fire / Evacuation",
  other: "Other",
};

export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  reported: "Open",
  investigating: "Under Review",
  rca_complete: "Under Review",
  closed: "Closed",
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  new: "New",
  investigating: "Investigating",
  resolved: "Resolved",
  escalated: "Escalated",
  dismissed: "Dismissed",
};

export function attendanceTone(pct: number): string {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 85) return "text-amber-600";
  return "text-red-600";
}

export function kpiTone(key: string, value: number): string | undefined {
  if (value === 0) return "text-emerald-600";
  if (key.includes("critical") || key.includes("urgent")) return "text-red-600";
  if (key.includes("open") || key.includes("reorder")) return "text-amber-600";
  return undefined;
}
