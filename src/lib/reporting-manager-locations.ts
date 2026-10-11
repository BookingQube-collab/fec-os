import { canUserDo, isRosterAmendJobTitle, type AppRole, type Capability } from "@/lib/rbac";

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
 * a manager or supervisor job title, or the venue-supervisor staff role.
 */
export function canUploadOwnRosterWithoutReports(
  jobTitle?: string | null,
  staffRole?: string | null,
): boolean {
  return isRosterAmendJobTitle(jobTitle) || staffRole === "venue_supervisor";
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
}): string[] {
  if (input.directReportStaffIds.length > 0) return [...input.directReportStaffIds];
  if (!input.staffId) return [];
  if (!canUploadOwnRosterWithoutReports(input.jobTitle, input.staffRole)) return [];
  return [input.staffId];
}

/** Company upload capability, a login with direct reports, or a supervisor uploading their own roster. */
export function canSeeShiftRosterUpload(
  roles: readonly AppRole[],
  hasDirectReports: boolean,
  jobTitle?: string | null,
  staffRole?: string | null,
): boolean {
  if (hasDirectReports) return true;
  if (
    canUserDo(roles as AppRole[], "people.import_roster") ||
    canUserDo(roles as AppRole[], "people.edit_roster") ||
    canUserDo(roles as AppRole[], "daily_ops.roster.upload")
  ) {
    return true;
  }
  return canUploadOwnRosterWithoutReports(jobTitle, staffRole);
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
