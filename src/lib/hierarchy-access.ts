import { reportingDescendants } from "@/lib/reporting-chain";

/** CEO and COO. Same bar as the operations chart editor. */
export const HIERARCHY_EDIT_ROLE_LEVEL = 95;

export type HierarchyAccessMode = "edit" | "team" | "none";

/**
 * CEO and COO edit the company chart.
 * Mia (HR People admin) also edits when companyEditor is set.
 * A person with direct reports gets a view of their team.
 * Everyone else is turned away.
 */
export function hierarchyAccessMode(input: {
  maxRoleLevel: number;
  directReportCount: number;
  /** Mia / other named company editors without role level 95. */
  companyEditor?: boolean;
}): HierarchyAccessMode {
  if (input.companyEditor || input.maxRoleLevel >= HIERARCHY_EDIT_ROLE_LEVEL) return "edit";
  if (input.directReportCount > 0) return "team";
  return "none";
}

/** Create-login is company-wide for editors, and only for a direct report on a team view. */
export function canOfferCreateLogin(input: {
  mode: HierarchyAccessMode;
  staffId: string;
  directReportStaffIds: readonly string[];
  loginLinked: boolean;
}): boolean {
  if (input.loginLinked) return false;
  if (input.mode === "edit") return true;
  if (input.mode !== "team") return false;
  return input.directReportStaffIds.includes(input.staffId);
}

/**
 * The signed-in person and everyone who reports through them.
 * Managers above them are not included. Direct-report ids are added when the
 * chart row is missing a reporting line.
 */
export function staffProfileOpenIds(
  people: readonly { staffId: string; reportingManagerStaffId: string | null }[],
  viewerStaffId: string | null,
  extraStaffIds: readonly string[] = [],
): Set<string> {
  if (!viewerStaffId) return new Set();
  const managers = new Map(people.map((person) => [person.staffId, person.reportingManagerStaffId]));
  const open = reportingDescendants(viewerStaffId, managers);
  open.add(viewerStaffId);
  for (const staffId of extraStaffIds) {
    if (staffId) open.add(staffId);
  }
  return open;
}

/** Managers above the viewer on the reporting line. */
export function reportingAncestorIds(
  people: readonly { staffId: string; reportingManagerStaffId: string | null }[],
  viewerStaffId: string | null,
): Set<string> {
  if (!viewerStaffId) return new Set();
  const managers = new Map(people.map((person) => [person.staffId, person.reportingManagerStaffId]));
  const ancestors = new Set<string>();
  const seen = new Set<string>([viewerStaffId]);
  let cursor = managers.get(viewerStaffId) ?? null;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    ancestors.add(cursor);
    cursor = managers.get(cursor) ?? null;
  }
  return ancestors;
}

/**
 * CEO and COO may open any staff profile.
 * A manager or supervisor may open their own profile and their team only.
 * People above them stay closed. An existing staff-directory role does not widen that.
 * Someone who is not a reporting manager keeps the directory they already have.
 */
export function canOpenStaffProfile(input: {
  companyWide: boolean;
  rosterAccess: boolean;
  /** Direct reports: own profile and the team, and nobody else. */
  teamLimited: boolean;
  viewerStaffId: string | null;
  targetStaffId: string;
  openIds: ReadonlySet<string>;
}): boolean {
  if (input.companyWide) return true;
  if (input.viewerStaffId && input.openIds.has(input.targetStaffId)) return true;
  if (input.teamLimited) return false;
  return input.rosterAccess;
}

/**
 * The signed-in person, everyone who reports through them, and the managers
 * above them. Sibling branches stay out.
 */
export function teamHierarchyVisibleIds(
  people: readonly { staffId: string; reportingManagerStaffId: string | null }[],
  viewerStaffId: string,
): Set<string> {
  const managers = new Map(people.map((person) => [person.staffId, person.reportingManagerStaffId]));
  const visible = reportingDescendants(viewerStaffId, managers);
  visible.add(viewerStaffId);
  const seen = new Set<string>([viewerStaffId]);
  let cursor = managers.get(viewerStaffId) ?? null;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    visible.add(cursor);
    cursor = managers.get(cursor) ?? null;
  }
  return visible;
}

/**
 * Supervisor / manager Operations hierarchy: same reporting edges as the company
 * chart, limited to the viewer's line (ancestors + subtree). Does not invent
 * people or parents from a separate direct-report list — directory/team lists
 * may still include those people elsewhere.
 */
export function teamScopedOrgChartPeople<T extends { staffId: string; reportingManagerStaffId: string | null }>(
  people: readonly T[],
  viewerStaffId: string,
): T[] {
  const visible = teamHierarchyVisibleIds(people, viewerStaffId);
  return people.filter((person) => visible.has(person.staffId));
}
