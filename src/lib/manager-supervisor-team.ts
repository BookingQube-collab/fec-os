import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";

/**
 * Site supervision titles a manager walks through.
 * Exact label after trim and case-fold, matching the roster department names:
 * Supervisor, Site Supervisor, Sr. Site Supervisor, Senior Site Supervisor,
 * and Venue Supervisor. F&B Supervisor, Production Supervisor, and cashier
 * titles are not a bridge.
 */
const SUPERVISOR_TITLE_KEYS = new Set([
  "supervisor",
  "site supervisor",
  "sr. site supervisor",
  "sr site supervisor",
  "sr.site supervisor",
  "senior site supervisor",
  "venue supervisor",
]);

export type ManagerTeamPerson = {
  staffId: string;
  jobTitle: string | null;
  staffRole: string | null;
  reportingManagerStaffId: string | null;
};

function supervisorTitleKey(jobTitle: string | null | undefined): string {
  return (jobTitle ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sr. Site Supervisor, Site Supervisor, Supervisor, and the venue-supervisor role. */
export function isManagerTeamSupervisor(
  jobTitle: string | null | undefined,
  staffRole?: string | null,
): boolean {
  if (staffRole === "venue_supervisor") return true;
  return SUPERVISOR_TITLE_KEYS.has(supervisorTitleKey(jobTitle));
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
 * The walk continues only through supervisor titles, one or more levels.
 * A cashier's own reports are not pulled in. People on another manager's
 * line are not included. The viewer is not included.
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
  return [...included].sort();
}
