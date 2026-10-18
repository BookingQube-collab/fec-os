import { isSiteSupervisorTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { HEAD_OFFICE_LOCATION_CODE } from "@/lib/department-audience";
import { isSrSiteSupervisorTitle } from "@/lib/org-hierarchy";
import { canUserDo, isRosterAmendJobTitle, type AppRole, type Capability } from "@/lib/rbac";
import { canManageMonthlyRoster, canOpenShiftRoster } from "@/lib/site-ops-access";

/** Caps that already open company or role-scoped roster and attendance. */
const COMPANY_ROSTER_CAPS = [
  "attendance.view",
  "people.view_roster",
  "people.import_roster",
  "people.edit_roster",
  "daily_ops.roster.upload",
] as const satisfies readonly Capability[];

export function usesTeamLocationScope(roles: readonly AppRole[]): boolean {
  return !COMPANY_ROSTER_CAPS.some((cap) => canUserDo(roles as AppRole[], cap));
}

/** Head Office by code or name — not an operational venue for Sr. Site scope. */
export function isHeadOfficeLocation(location: {
  code?: string | null;
  name?: string | null;
}): boolean {
  const code = (location.code ?? "").trim().toUpperCase();
  if (code === HEAD_OFFICE_LOCATION_CODE) return true;
  const name = (location.name ?? "").trim().toLowerCase();
  return name === "head office" || name.startsWith("head office ");
}

/**
 * How attendance / roster location chips are built from the org chart.
 *
 * - `viewer_assigned` — Venue / Site Supervisor (and other team leaders): only that
 *   person's home + dedicated work sites (e.g. Waqar → UA-DM + KDS-DM). Never expand
 *   via descendant punches or roster rows at Inflata / KDS-CC / etc.
 * - `team_assigned_except_ho` — Sr. Site / Senior Site Supervisor: home + dedicated
 *   work sites for everyone in her reporting subtree, plus every Venue/Site
 *   supervisor's managed venues (all supervisors report through Sr. Site), then
 *   drop Head Office. This keeps UA-DM / KDS-DM / KDS-CC / CB-VM / … even when
 *   most crew rows are still home’d at INF-CC.
 */
export type AttendanceLocationScopeMode = "viewer_assigned" | "team_assigned_except_ho";

export function attendanceLocationScopeMode(
  jobTitle?: string | null,
  department?: string | null,
  _staffRole?: string | null,
): AttendanceLocationScopeMode {
  if (isSrSiteSupervisorTitle(jobTitle) || isSrSiteSupervisorTitle(department)) {
    return "team_assigned_except_ho";
  }
  return "viewer_assigned";
}

/**
 * Venue / Site supervisors who manage operational venues (Waqar, Ma Luz, …).
 * Sr. Site itself is excluded — her span is the union of those managers' sites.
 */
export function isVenueOrSiteSupervisorManager(
  jobTitle?: string | null,
  staffRole?: string | null,
): boolean {
  if (isSrSiteSupervisorTitle(jobTitle)) return false;
  return isSiteSupervisorTitle(jobTitle, staffRole);
}

/**
 * Staff ids whose home / dedicated work sites feed the location chip list.
 * Venue supervisors: viewer only. Sr. Site: viewer plus reporting subtree, and
 * callers also union Venue/Site supervisor managers (see span helpers below).
 */
export function locationDiscoveryStaffIds(
  mode: AttendanceLocationScopeMode,
  viewerStaffId: string | null | undefined,
  teamStaffIds: readonly string[],
): string[] {
  if (mode === "viewer_assigned") {
    return viewerStaffId ? [viewerStaffId] : [];
  }
  const ids = new Set<string>();
  for (const id of teamStaffIds) {
    if (id) ids.add(id);
  }
  if (viewerStaffId) ids.add(viewerStaffId);
  return [...ids].sort();
}

export type OrgChartLocationPerson = {
  staffId: string;
  locationId?: string | null;
  workLocationIds?: readonly (string | null | undefined)[];
  jobTitle?: string | null;
  staffRole?: string | null;
};

/**
 * Distinct home + dedicated work location ids for a Sr. Site span.
 * Unions everyone in `discoveryStaffIds` with every Venue/Site supervisor
 * manager in `people` (supervisors report through Sr. Site even when crew under
 * them is still home’d at one flagship site).
 */
export function collectSrSiteSpanLocationIds(
  people: readonly OrgChartLocationPerson[],
  discoveryStaffIds: readonly string[],
): string[] {
  const discovery = new Set(discoveryStaffIds.filter(Boolean));
  const ids = new Set<string>();
  for (const person of people) {
    if (!person.staffId) continue;
    const inSubtree = discovery.has(person.staffId);
    const venueManager = isVenueOrSiteSupervisorManager(person.jobTitle, person.staffRole);
    if (!inSubtree && !venueManager) continue;
    if (person.locationId) ids.add(person.locationId);
    for (const locationId of person.workLocationIds ?? []) {
      if (locationId) ids.add(locationId);
    }
  }
  return [...ids].sort();
}

/** Drop Head Office for Sr. Site scope. Other titles keep every assigned site. */
export function filterLocationsForJobTitleScope<T extends { code?: string | null; name?: string | null }>(
  sites: readonly T[],
  jobTitle?: string | null,
  department?: string | null,
  staffRole?: string | null,
): T[] {
  const mode = attendanceLocationScopeMode(jobTitle, department, staffRole);
  if (mode !== "team_assigned_except_ho") return [...sites];
  return sites.filter((site) => !isHeadOfficeLocation(site));
}

/**
 * Same people who may amend the monthly roster without a company capability:
 * a manager or supervisor job title, the venue-supervisor staff role, or an
 * HoO ops peer (Louie / Russell) who reports to Head of Operations.
 */
export function canUploadOwnRosterWithoutReports(
  jobTitle?: string | null,
  staffRole?: string | null,
  department?: string | null,
  reportsToHeadOfOperations?: boolean,
): boolean {
  if (isRosterAmendJobTitle(jobTitle) || staffRole === "venue_supervisor") return true;
  return canManageMonthlyRoster({ jobTitle, staffRole, department, reportsToHeadOfOperations });
}

/**
 * Monthly roster names for one person on the Operations chart.
 * The viewer is included, plus every person who reports to them directly or
 * through the chain. A person marked not assignable is omitted, and the walk
 * still continues through them so their team is not hidden.
 */
export function rosterChartTeamIds(
  viewerStaffId: string | null,
  people: readonly {
    staffId: string;
    reportingManagerStaffId?: string | null;
    assignable?: boolean;
  }[],
): string[] {
  if (!viewerStaffId) return [];
  const children = new Map<string, string[]>();
  const assignable = new Map<string, boolean>();
  for (const person of people) {
    if (!person.staffId) continue;
    assignable.set(person.staffId, person.assignable !== false);
    const managerId = person.reportingManagerStaffId;
    if (!managerId || managerId === person.staffId) continue;
    const list = children.get(managerId) ?? [];
    list.push(person.staffId);
    children.set(managerId, list);
  }

  const included = new Set<string>();
  if (assignable.get(viewerStaffId) !== false) included.add(viewerStaffId);
  const seen = new Set<string>([viewerStaffId]);
  const stack = [...(children.get(viewerStaffId) ?? [])];
  while (stack.length > 0) {
    const staffId = stack.pop();
    if (!staffId || seen.has(staffId)) continue;
    seen.add(staffId);
    if (assignable.get(staffId) !== false) included.add(staffId);
    for (const childId of children.get(staffId) ?? []) stack.push(childId);
  }
  return [...included].sort();
}

/**
 * Staff a team-scoped login may upload or place on the monthly roster.
 * Direct reports stay the team. The viewer is not added when that team exists.
 * A supervisor with nobody reporting to them may cover only themselves.
 * Anyone else with an empty team covers nobody.
 */
export function rosterTeamOrSelfStaffIds(input: {
  staffId: string | null;
  directReportStaffIds: readonly string[];
  jobTitle?: string | null;
  staffRole?: string | null;
  department?: string | null;
  reportsToHeadOfOperations?: boolean;
}): string[] {
  if (input.directReportStaffIds.length > 0) return [...input.directReportStaffIds];
  if (!input.staffId) return [];
  if (
    !canUploadOwnRosterWithoutReports(
      input.jobTitle,
      input.staffRole,
      input.department,
      input.reportsToHeadOfOperations,
    )
  ) {
    return [];
  }
  return [input.staffId];
}

/** Shift roster option. Supervisors, HoO Operations peers, the CEO login, the GM login, and Adil or the General Manager by title. */
export function canSeeShiftRosterUpload(
  roles: readonly AppRole[],
  _hasDirectReports: boolean,
  jobTitle?: string | null,
  staffRole?: string | null,
  department?: string | null,
  reportsToHeadOfOperations?: boolean,
): boolean {
  return canOpenShiftRoster({ roles, jobTitle, staffRole, department, reportsToHeadOfOperations });
}

/**
 * Sites a reporting manager's team covers.
 * Home assignment, extra work sites, punch sites, and rostered sites.
 * Blank ids are ignored. The manager's own site is not required.
 */
export function unionTeamLocationIds(input: {
  homeLocationIds?: readonly (string | null | undefined)[];
  workLocationIds?: readonly (string | null | undefined)[];
  punchLocationIds?: readonly (string | null | undefined)[];
  rosterLocationIds?: readonly (string | null | undefined)[];
}): string[] {
  const ids = new Set<string>();
  for (const list of [
    input.homeLocationIds,
    input.workLocationIds,
    input.punchLocationIds,
    input.rosterLocationIds,
  ]) {
    for (const id of list ?? []) {
      if (id) ids.add(id);
    }
  }
  return [...ids].sort();
}
