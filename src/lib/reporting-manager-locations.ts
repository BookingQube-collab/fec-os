import { isHeadOfOperationsTitle, isSiteSupervisorTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { isFnbManager } from "@/lib/arcade/access";
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

/**
 * Venue / Site / Sr. Site / F&B Manager titles must use org-chart location chips
 * even when `user_roles` is `branch_gm` (which carries `attendance.view`).
 * Otherwise Mary is treated as company-wide while RLS still only allows INF-CC
 * in `user_roles.location_ids`, so chips collapse to All + INF-CC.
 */
export function orgTitleForcesTeamLocationScope(
  jobTitle?: string | null,
  department?: string | null,
  staffRole?: string | null,
): boolean {
  if (isHeadOfOperationsTitle(jobTitle)) return false;
  if (isSrSiteSupervisorTitle(jobTitle) || isSrSiteSupervisorTitle(department)) return true;
  if (isFnbManager(jobTitle, department)) return true;
  return isVenueOrSiteSupervisorManager(jobTitle, staffRole);
}

/**
 * Company-wide location chips (same as Adil / admin): RBAC company caps, or
 * Head of Operations title (Rajan). Org-title supervisors stay team-scoped.
 */
export function locationAccessIsCompanyWide(
  roles: readonly AppRole[],
  jobTitle?: string | null,
  department?: string | null,
  staffRole?: string | null,
): boolean {
  if (orgTitleForcesTeamLocationScope(jobTitle, department, staffRole)) return false;
  if (isHeadOfOperationsTitle(jobTitle)) return true;
  return COMPANY_ROSTER_CAPS.some((cap) => canUserDo(roles as AppRole[], cap));
}

export function usesTeamLocationScope(
  roles: readonly AppRole[],
  jobTitle?: string | null,
  department?: string | null,
  staffRole?: string | null,
): boolean {
  return !locationAccessIsCompanyWide(roles, jobTitle, department, staffRole);
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
 * - `company` — HoO / admin: every active venue (caller skips team filter).
 * - `viewer_assigned` — Venue / Site Supervisor: home + dedicated work sites
 *   (and maintainable map when work sites are empty). Never expand via descendant
 *   punches. Waqar → KDS-DM + UA-DM + INF-CC; Ashfaq → INF-CC + KDS-CC + CAR-AP;
 *   Romel → CB-DSM; Rosebelt → CB-VM.
 * - `team_assigned_except_ho` — Sr. Site: home + dedicated work sites for everyone
 *   in her reporting subtree (all supervisor venues under her), then drop Head Office.
 * - `fnb_manager_venues` — F&B Manager: INF-CC + KDS-CC + UA-DM (F&B team staff
 *   stay on the reporting tree).
 */
export type AttendanceLocationScopeMode =
  | "company"
  | "viewer_assigned"
  | "team_assigned_except_ho"
  | "fnb_manager_venues";

export function attendanceLocationScopeMode(
  jobTitle?: string | null,
  department?: string | null,
  _staffRole?: string | null,
): AttendanceLocationScopeMode {
  if (isHeadOfOperationsTitle(jobTitle)) return "company";
  if (isSrSiteSupervisorTitle(jobTitle) || isSrSiteSupervisorTitle(department)) {
    return "team_assigned_except_ho";
  }
  if (isFnbManager(jobTitle, department)) return "fnb_manager_venues";
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
  if (mode === "company" || mode === "fnb_manager_venues") {
    return [];
  }
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
 * Only people in `discoveryStaffIds` (viewer + reporting subtree under her).
 * Venue supervisors outside her chart do not contribute chips.
 */
export function collectSrSiteSpanLocationIds(
  people: readonly OrgChartLocationPerson[],
  discoveryStaffIds: readonly string[],
): string[] {
  const discovery = new Set(discoveryStaffIds.filter(Boolean));
  const ids = new Set<string>();
  for (const person of people) {
    if (!person.staffId || !discovery.has(person.staffId)) continue;
    if (person.locationId) ids.add(person.locationId);
    for (const locationId of person.workLocationIds ?? []) {
      if (locationId) ids.add(locationId);
    }
  }
  return [...ids].sort();
}

/** Keep only the F&B Manager estate codes (INF-CC, KDS-CC, UA-DM). */
export function filterLocationsForFnbManagerScope<T extends { code?: string | null }>(
  sites: readonly T[],
  allowedCodes: readonly string[],
): T[] {
  const allow = new Set(allowedCodes.map((code) => code.trim().toUpperCase()).filter(Boolean));
  return sites.filter((site) => allow.has((site.code ?? "").trim().toUpperCase()));
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
