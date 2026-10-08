import { canUserDo, type AppRole, type Capability } from "@/lib/rbac";

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

/** Existing upload capability, or a login that manages direct reports. */
export function canSeeShiftRosterUpload(roles: readonly AppRole[], hasDirectReports: boolean): boolean {
  if (hasDirectReports) return true;
  return (
    canUserDo(roles as AppRole[], "people.import_roster") ||
    canUserDo(roles as AppRole[], "people.edit_roster") ||
    canUserDo(roles as AppRole[], "daily_ops.roster.upload")
  );
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
