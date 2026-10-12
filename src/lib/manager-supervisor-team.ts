import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";

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
 * Who may see past a supervisor to that supervisor's team.
 * Managers, head of operations, and these supervisor titles may.
 * A cashier, host, or other title stays on direct reports only.
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
 * Direct reports, plus the people under a supervisor in this viewer's line.
 * The walk continues only through supervisor titles, one or more levels,
 * in every department. A cashier's own reports are not pulled in. People on
 * another manager's line are not included. A supervisor viewer is included
 * with their team. A manager viewer is not included.
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
        if (rollup && isManagerTeamSupervisor(person.jobTitle, person.staffRole)) {
          next.push(person.staffId);
        }
      }
    }
    if (!rollup) break;
    frontier = next;
  }
  if (isManagerTeamSupervisor(input.viewerJobTitle, input.viewerStaffRole) && input.viewerStaffId) {
    included.add(input.viewerStaffId);
  }
  return [...included].sort();
}
