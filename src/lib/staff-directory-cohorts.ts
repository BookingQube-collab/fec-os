import { HEAD_OFFICE_LOCATION_CODE } from "@/lib/department-audience";
import {
  ORG_FOCUS_DEPARTMENTS,
  staffMatchesOrgShowOnly,
  type OrgFocusDepartment,
} from "@/lib/exclude-org-departments";

/** Fixed cohort key for Head Office home-location staff. */
export const HEAD_OFFICE_COHORT_KEY = "head_office";

/** Ops / Maintenance / F&B Cafe — same keys as the legacy org show-only filter. */
export const ORG_STAFF_DIRECTORY_COHORT_KEYS = ORG_FOCUS_DEPARTMENTS;

const ORG_COHORT_LABELS: Record<OrgFocusDepartment, string> = {
  operations: "Operations",
  maintenance: "Maintenance",
  fb_cafe: "F&B Cafe",
};

export type StaffDirectoryCohortOption = {
  key: string;
  label: string;
};

export function isOrgStaffDirectoryCohortKey(key: string): key is OrgFocusDepartment {
  return (ORG_STAFF_DIRECTORY_COHORT_KEYS as readonly string[]).includes(key);
}

/** `event:<uuid>` keys for event-hire / assigned event staff. */
export function eventCohortKey(eventId: string): string {
  return `event:${String(eventId).trim()}`;
}

export function parseEventCohortKey(key: string): string | null {
  const raw = key.trim();
  if (!raw.startsWith("event:")) return null;
  const id = raw.slice("event:".length).trim();
  return id || null;
}

/**
 * Short event title for the staff directory Showing filter.
 * Prefer event_name / name only — no number prefix, no path / FEC breadcrumb.
 */
export function shortEventFilterLabel(event: {
  event_name?: string | null;
  name?: string | null;
  event_number?: string | null;
}): string {
  const raw = (event.event_name ?? event.name ?? "").trim();
  if (!raw) return (event.event_number ?? "").trim() || "Event";

  const slashParts = raw.split(/[/\\|]/).map((part) => part.trim()).filter(Boolean);
  let title = slashParts[slashParts.length - 1] ?? raw;

  // Drop leading location codes: `INF-CC — Lego` → `Lego`
  title = title.replace(/^[A-Z]{2,5}(?:-[A-Z]{2,5})?\s*[—–\-·:]\s*/i, "").trim();
  // Drop FEC / FEC Ops branding prefixes left on some titles
  title = title.replace(/^fec\s*(?:op(?:eration)?s?)?\s*[—–\-·:/]?\s*/i, "").trim();

  return title || raw;
}

/** Cohorts unchecked in the menu (show-only). Empty while every option stays checked. */
export function activeShowOnlyStaffCohorts(
  checks: Readonly<Record<string, boolean>>,
  options: readonly StaffDirectoryCohortOption[],
): string[] {
  return options.filter((option) => checks[option.key] === false).map((option) => option.key);
}

export function parseShowStaffCohortsParam(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const key = part.trim();
    if (!key) continue;
    const allowed =
      isOrgStaffDirectoryCohortKey(key) || key === HEAD_OFFICE_COHORT_KEY || Boolean(parseEventCohortKey(key));
    if (!allowed) continue;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

export function staffIsHeadOfficeCohort(locationCode: string | null | undefined): boolean {
  return (locationCode ?? "").trim().toUpperCase() === HEAD_OFFICE_LOCATION_CODE;
}

/**
 * Show-only match for Ops/Maint/F&B + Head Office + event cohorts.
 * Empty `showOnly` keeps every row. A staff row matches when it belongs to any
 * unchecked cohort (org focus department, HO home location, or linked event).
 */
export function staffMatchesShowCohorts(
  staff: {
    id: string;
    location_code?: string | null;
    department?: string | null;
    department_names?: readonly string[] | null;
  },
  showOnly: readonly string[],
  eventIdsByStaffId: ReadonlyMap<string, readonly string[]> = new Map(),
): boolean {
  if (showOnly.length === 0) return true;

  const orgKeys = showOnly.filter(isOrgStaffDirectoryCohortKey);
  if (orgKeys.length > 0 && staffMatchesOrgShowOnly(staff, orgKeys)) return true;

  for (const key of showOnly) {
    if (isOrgStaffDirectoryCohortKey(key)) continue;
    if (key === HEAD_OFFICE_COHORT_KEY) {
      if (staffIsHeadOfficeCohort(staff.location_code)) return true;
      continue;
    }
    const eventId = parseEventCohortKey(key);
    if (!eventId) continue;
    if ((eventIdsByStaffId.get(staff.id) ?? []).includes(eventId)) return true;
  }
  return false;
}

/**
 * Build Showing-filter options: Operations, Maintenance, F&B Cafe, Head Office,
 * then short event titles that have staff.
 */
export function buildStaffDirectoryCohortOptions(
  events: readonly {
    id: string;
    event_name?: string | null;
    name?: string | null;
    event_number?: string | null;
  }[],
  headOfficeLabel = "Head Office",
  orgLabels: Partial<Record<OrgFocusDepartment, string>> = {},
): StaffDirectoryCohortOption[] {
  const seen = new Set<string>();
  const options: StaffDirectoryCohortOption[] = ORG_STAFF_DIRECTORY_COHORT_KEYS.map((key) => ({
    key,
    label: orgLabels[key] ?? ORG_COHORT_LABELS[key],
  }));
  options.push({ key: HEAD_OFFICE_COHORT_KEY, label: headOfficeLabel });
  for (const event of events) {
    const id = String(event.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({ key: eventCohortKey(id), label: shortEventFilterLabel(event) });
  }
  return options;
}
