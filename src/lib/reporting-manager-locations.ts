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
