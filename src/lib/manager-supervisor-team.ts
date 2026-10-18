import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { isActiveStaffStatus, isServingNoticeStaffStatus } from "@/lib/staff-status";

/**
 * A supervisor bridge is any job title with the whole word "supervisor".
 * That covers operations titles (Supervisor, Site Supervisor, Sr. Site Supervisor,
 * Senior Site Supervisor, Venue Supervisor) and F&B titles used on staff
 * (F&B Supervisor, Barista/Supervisor, Café Supervisor). The same word also
 * covers maintenance and production supervisors, so the walk is not limited
 * to Operations. Cashier, host, barista, and chef titles are not a bridge.
 */
const SUPERVISOR_WORD = /(?:^|[^a-z])supervisor(?=$|[^a-z])/;

export type ManagerTeamPerson = {
  staffId: string;
  jobTitle: string | null;
  staffRole: string | null;
  reportingManagerStaffId: string | null;
};

/** Operations and F&B supervisors, plus the venue-supervisor role. Cashier titles are not. */
export function isManagerTeamSupervisor(
  jobTitle: string | null | undefined,
  staffRole?: string | null,
): boolean {
  if (staffRole === "venue_supervisor") return true;
  const title = (jobTitle ?? "").trim().toLowerCase();
  if (!title) return false;
  return SUPERVISOR_WORD.test(title);
}

/**
 * Who may see their full reporting subtree (not only direct reports).
 * Venue / Site / Sr. Site / Operations / F&B supervisors, F&B and other
 * managers, and Head of Operations. A cashier, host, or other front-line
 * title stays on direct reports only.
 */
export function viewerRollsUpSupervisorTeam(
  jobTitle: string | null | undefined,
  staffRole?: string | null,
): boolean {
  if (isManagerTeamSupervisor(jobTitle, staffRole)) return true;
  if (isHeadOfOperationsTitle(jobTitle)) return true;
  const title = (jobTitle ?? "").trim().toLowerCase();
  if (!title) return false;
  return /(?:^|[^a-z])manager(?=$|[^a-z])/.test(title);
}

/**
 * The viewer plus everyone who reports through them on the org chart.
 *
 * Venue / Site / Sr. Site / Operations supervisors, F&B Supervisor, F&B Manager,
 * and other rollup titles walk every reporting edge (Shift Lead → crew, cashier
 * lead → helper). Cashiers and other front-line titles keep direct reports only.
 * People on another manager's line are not included.
 */
export function managerSupervisorTeamIds(input: {
  viewerStaffId: string;
  viewerJobTitle?: string | null;
  viewerStaffRole?: string | null;
  people: readonly ManagerTeamPerson[];
}): string[] {
  const rollup = viewerRollsUpSupervisorTeam(input.viewerJobTitle, input.viewerStaffRole);
  const children = new Map<string, ManagerTeamPerson[]>();
  for (const person of input.people) {
    if (!person.staffId || person.staffId === input.viewerStaffId) continue;
    const managerId = person.reportingManagerStaffId;
    if (!managerId || managerId === person.staffId) continue;
    const list = children.get(managerId) ?? [];
    list.push(person);
    children.set(managerId, list);
  }

  const included = new Set<string>();
  const seen = new Set<string>([input.viewerStaffId]);
  let frontier = [input.viewerStaffId];
  for (let depth = 0; depth < 25 && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const managerId of frontier) {
      for (const person of children.get(managerId) ?? []) {
        if (seen.has(person.staffId)) continue;
        seen.add(person.staffId);
        included.add(person.staffId);
        // Rollup viewers keep every descendant edge (Shift Lead, cashier lead, …).
        if (rollup) next.push(person.staffId);
      }
    }
    if (!rollup) break;
    frontier = next;
  }
  if (rollup && input.viewerStaffId) {
    included.add(input.viewerStaffId);
  }
  return [...included].sort();
}

export type TeamOverviewPerson = ManagerTeamPerson & {
  status?: string | null;
};

/**
 * Who appears on Team overview.
 * A rollup manager or supervisor sees themselves and their full reporting subtree
 * (including crew under a Shift Lead). Serving notice stays on the list.
 * Resigned, terminated, and other closed statuses do not.
 */
export function teamOverviewMemberIds(input: {
  viewerStaffId: string;
  viewerJobTitle?: string | null;
  viewerStaffRole?: string | null;
  people: readonly TeamOverviewPerson[];
}): string[] {
  const roster = input.people.filter((person) => {
    if (person.staffId === input.viewerStaffId) return true;
    return isActiveStaffStatus(person.status) || isServingNoticeStaffStatus(person.status);
  });
  return managerSupervisorTeamIds({ ...input, people: roster });
}
