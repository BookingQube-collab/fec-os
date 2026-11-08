/**
 * Event Crew schedule grouping.
 *
 * Categories are derived from existing fields — no new DB enum:
 * 1. Explicit event `role_label` (staffing / schedule slot) when it is not the generic "crew" default
 * 2. Head Office home location → Management Team
 * 3. Staff job title / FEC department catalog keywords
 * 4. Fallback → Crew
 */

import { fecDepartmentForSiteStaff, normalizeLabel } from "@/lib/fec-departments";
import {
  isContractFinishedStaffStatus,
  isResignedStaffStatus,
  isTerminatedStaffStatus,
} from "@/lib/staff-status";

export const EVENT_CREW_SCHEDULE_CATEGORIES = [
  "crew",
  "cleaner",
  "maintenance",
  "management",
] as const;

export type EventCrewScheduleCategory = (typeof EVENT_CREW_SCHEDULE_CATEGORIES)[number];

/** Display labels (English). UI should prefer i18n keys under events.schedule.categories.* */
export const EVENT_CREW_SCHEDULE_CATEGORY_LABELS: Record<EventCrewScheduleCategory, string> = {
  crew: "Crew",
  cleaner: "Cleaner",
  maintenance: "Maintenance Team",
  management: "Management Team (Head Office)",
};

/** Stable sort order for schedule sections. */
export const EVENT_CREW_SCHEDULE_CATEGORY_ORDER: readonly EventCrewScheduleCategory[] = [
  "crew",
  "cleaner",
  "maintenance",
  "management",
];

const GENERIC_CREW_ROLES = new Set(["crew", "attendant", "crew / attendant", "crew attendant"]);

function roleImpliesCategory(role: string): EventCrewScheduleCategory | null {
  if (!role || GENERIC_CREW_ROLES.has(role)) return null;
  if (/\bclean(?:er|ing)?\b/.test(role) || role.includes("نظاف")) return "cleaner";
  if (
    /\bmainten/.test(role) ||
    /\belectric/.test(role) ||
    /\btechnician\b/.test(role) ||
    role.includes("صيان")
  ) {
    return "maintenance";
  }
  if (
    /\bmanagement\b/.test(role) ||
    /\bmanager\b/.test(role) ||
    /\bdirector\b/.test(role) ||
    /\bhead of\b/.test(role) ||
    /\bhead office\b/.test(role) ||
    role === "pm" ||
    /\bproject manager\b/.test(role) ||
    /\bproject director\b/.test(role) ||
    role.includes("إدارة") ||
    role.includes("المكتب الرئيسي")
  ) {
    return "management";
  }
  if (/\bcrew\b/.test(role) || /\battendant\b/.test(role) || /\bcashier\b/.test(role)) {
    return "crew";
  }
  return null;
}

function catalogImpliesCategory(catalogName: string | null): EventCrewScheduleCategory | null {
  if (!catalogName) return null;
  if (catalogName === "Cleaner") return "cleaner";
  if (catalogName === "Maintenance Assistant / Electrician") return "maintenance";
  if (
    catalogName === "Managing Director / Chief Executive Officer" ||
    catalogName === "General Manager"
  ) {
    return "management";
  }
  // Site FEC roles (crew, cashier, supervisors, F&B floor, artist, …) → Crew bucket for event schedule.
  return "crew";
}

function jobTitleImpliesCategory(jobTitle: string | null | undefined): EventCrewScheduleCategory | null {
  const title = normalizeLabel(jobTitle);
  if (!title) return null;

  // Known FEC catalog titles win (e.g. FEC Arcade Technician → Crew, not Maintenance).
  const catalogName = fecDepartmentForSiteStaff(jobTitle, null);
  if (catalogName) return catalogImpliesCategory(catalogName);

  // Unmapped titles (compound / HO corporate) — keyword fallback.
  return roleImpliesCategory(title);
}

export type EventCrewScheduleCategoryInput = {
  role_label?: string | null;
  job_title?: string | null;
  /** True when staff home location is Head Office (code HO). */
  is_head_office?: boolean;
};

/**
 * Resolve which of the four Crew schedule categories a person/slot belongs to.
 * Prefer explicit non-generic event role_label; then HO; then job title; else Crew.
 */
export function resolveEventCrewScheduleCategory(
  input: EventCrewScheduleCategoryInput,
): EventCrewScheduleCategory {
  const role = normalizeLabel(input.role_label);
  const fromRole = roleImpliesCategory(role);

  // Explicit Cleaner / Maintenance / Management on the event role wins.
  if (fromRole && fromRole !== "crew") return fromRole;
  // Non-generic crew-ish labels (Cashier, Senior Crew, …) stay in Crew even for HO staff.
  if (fromRole === "crew" && role && !GENERIC_CREW_ROLES.has(role)) return "crew";

  if (input.is_head_office) return "management";

  const fromJob = jobTitleImpliesCategory(input.job_title);
  if (fromJob) return fromJob;

  return "crew";
}

/** Canonical role_label to persist when adding a shift without an assignment role. */
export function eventCrewScheduleCategoryRoleLabel(
  category: EventCrewScheduleCategory,
): string {
  switch (category) {
    case "cleaner":
      return "Cleaner";
    case "maintenance":
      return "Maintenance Team";
    case "management":
      return "Management Team";
    default:
      return "Crew";
  }
}

/**
 * How the Crew schedule add form behaves for a role.
 *
 * - labour_days: Cleaner / Maintenance — NO traditional shift module. Assign work days
 *   (date-from → date-to) only; pay uses the 10h day baseline (hours/10 × day rate).
 * - event_day: Crew / Management — single public/event day + start/end shift slots
 *
 * Mapping: schedule "labour" = Cleaner + Maintenance Team (+ role_label/job keywords).
 * Legacy staffing assignment type `labour` normalizes to `joker` and is not a fifth
 * schedule category; jokers still land in one of the four roles via role_label / job title.
 */
export type EventCrewScheduleAddShiftMode = "labour_days" | "event_day";

export function eventCrewScheduleAddShiftMode(
  category: EventCrewScheduleCategory,
): EventCrewScheduleAddShiftMode {
  switch (category) {
    case "cleaner":
    case "maintenance":
      return "labour_days";
    case "crew":
    case "management":
    default:
      return "event_day";
  }
}

export function isLabourStyleEventCrewCategory(category: EventCrewScheduleCategory): boolean {
  return eventCrewScheduleAddShiftMode(category) === "labour_days";
}

/** Candidate used when resolving who gets a role-only schedule add. */
export type EventCrewScheduleRoleCandidate = {
  staff_id: string;
  assignment_id?: string | null;
  role_label?: string | null;
  job_title?: string | null;
  is_head_office?: boolean;
  /** staff.status — terminated / resigned / contract finished stay out */
  status?: string | null;
};

/**
 * Crew schedule assignable employment: blank/active/leave/notice/joker ok.
 * Excludes terminated, inactive, released, resigned, and contract finished.
 */
export function isEventCrewScheduleActiveStaffStatus(
  status: string | null | undefined,
): boolean {
  if (isTerminatedStaffStatus(status)) return false;
  if (isResignedStaffStatus(status)) return false;
  if (isContractFinishedStaffStatus(status)) return false;
  return true;
}

/**
 * Crew / Cleaner / Maintenance must come from this event's Staffing assignments.
 * Management Team may also use the Head Office People catalog.
 */
export function eventCrewScheduleAllowsPeopleFallback(
  category: EventCrewScheduleCategory,
): boolean {
  return category === "management";
}

/** Picker option for the Crew schedule optional-person dropdown / role add. */
export type EventCrewScheduleStaffPickerOption = {
  staff_id: string;
  role_label?: string | null;
  job_title?: string | null;
  is_head_office?: boolean;
  /** staff.status — terminated / resigned / contract finished stay out */
  status?: string | null;
  /** staffing = open event assignment; head_office = HO people catalog */
  source: "staffing" | "head_office";
};

/**
 * Options shown for a role in the Crew schedule add form.
 * Non-management: Staffing for this event only. Management: Staffing + Head Office people.
 * Terminated / inactive / resigned / contract-finished people are never listed.
 */
export function selectStaffOptionsForScheduleCategory(
  options: EventCrewScheduleStaffPickerOption[],
  category: EventCrewScheduleCategory,
): EventCrewScheduleStaffPickerOption[] {
  const allowPeople = eventCrewScheduleAllowsPeopleFallback(category);
  const out: EventCrewScheduleStaffPickerOption[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    if (!option.staff_id || seen.has(option.staff_id)) continue;
    if (!isEventCrewScheduleActiveStaffStatus(option.status)) continue;
    if (option.source === "head_office") {
      if (!allowPeople) continue;
    } else if (option.source !== "staffing") {
      continue;
    }
    const resolved = resolveEventCrewScheduleCategory({
      role_label: option.role_label,
      job_title: option.job_title,
      is_head_office: Boolean(option.is_head_office),
    });
    if (resolved !== category) continue;
    seen.add(option.staff_id);
    out.push(option);
  }
  return out;
}

/**
 * Pick unique staff for a Crew schedule category (first occurrence wins).
 * Used by role-only add: Staffing assignment candidates first; People only for Management.
 * Terminated / inactive / resigned / contract-finished people are never targeted.
 */
export function selectCrewForScheduleCategory(
  candidates: EventCrewScheduleRoleCandidate[],
  category: EventCrewScheduleCategory,
): EventCrewScheduleRoleCandidate[] {
  const out: EventCrewScheduleRoleCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.staff_id || seen.has(candidate.staff_id)) continue;
    if (!isEventCrewScheduleActiveStaffStatus(candidate.status)) continue;
    const resolved = resolveEventCrewScheduleCategory({
      role_label: candidate.role_label,
      job_title: candidate.job_title,
      is_head_office: candidate.is_head_office,
    });
    if (resolved !== category) continue;
    seen.add(candidate.staff_id);
    out.push(candidate);
  }
  return out;
}

export function groupByEventCrewScheduleCategory<T>(
  items: T[],
  categoryOf: (item: T) => EventCrewScheduleCategory,
): Array<{ category: EventCrewScheduleCategory; items: T[] }> {
  const buckets = new Map<EventCrewScheduleCategory, T[]>();
  for (const cat of EVENT_CREW_SCHEDULE_CATEGORY_ORDER) buckets.set(cat, []);
  for (const item of items) {
    const cat = categoryOf(item);
    buckets.get(cat)!.push(item);
  }
  return EVENT_CREW_SCHEDULE_CATEGORY_ORDER.map((category) => ({
    category,
    items: buckets.get(category) ?? [],
  })).filter((g) => g.items.length > 0);
}
