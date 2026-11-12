/**
 * Leave approval routing (mirrors missed-punch seats, with an explicit supervisor step).
 * Employee → Supervisor (manager) → Sr. Site (site) → HoO / F&B (ops, terminal) → HR notify.
 * Team Leader is never a leave seat — walk past TL to Venue / line Supervisor, or open on Sr. Site.
 */

import {
  opsApprovalLaneForStaffId,
  opsStepApproverUserIds,
  type OpsApprovalLane,
} from "@/lib/approval-ops-routing";
import {
  isHeadOfOperationsTitle,
  requesterLineManagerUserIds,
  type ApprovalDirectory,
} from "@/lib/attendance-hr/missed-punch-approval";
import { isFnbManager } from "@/lib/arcade/access";
import { isManagerTeamSupervisor } from "@/lib/manager-supervisor-team";
import { isSrSiteSupervisorTitle } from "@/lib/org-hierarchy";
import { isTeamLeaderTitle } from "@/lib/site-ops-access";
import {
  leaveOpeningStepRole,
  leaveStepSeatLabel,
  type HrLeaveApprovalRole,
} from "@/lib/hr-leave";

function opsSeatUserIds(directory: ApprovalDirectory): Set<string> {
  return new Set([...directory.headOfOperationsUserIds, ...directory.fnbManagerUserIds]);
}

/**
 * Leave manager-seat title: Venue / Site / line Supervisor (incl. F&B Supervisor).
 * Not Team Leader, not Sr. Site, not HoO / F&B Manager.
 */
export function isLeaveLineSupervisorTitle(
  jobTitle: string | null | undefined,
  staffRole?: string | null,
): boolean {
  if (isSrSiteSupervisorTitle(jobTitle)) return false;
  if (isHeadOfOperationsTitle(jobTitle)) return false;
  if (isFnbManager(jobTitle, null)) return false;
  if (isTeamLeaderTitle(jobTitle)) return false;
  return isManagerTeamSupervisor(jobTitle, staffRole);
}

/**
 * Walk reporting managers from `staffId` and return the nearest leave Supervisor login.
 * Skips Team Leaders; stops before Sr. Site / HoO (those are later seats).
 */
export function nearestLeaveSupervisorUserId(input: {
  staffId: string;
  reportingManagerStaffIdByStaffId: ReadonlyMap<string, string | null | undefined>;
  managerByStaffId: ReadonlyMap<
    string,
    { userId: string | null; jobTitle: string | null; staffRole: string | null }
  >;
}): string | null {
  let cursor: string | null = input.staffId;
  const seen = new Set<string>();
  for (let depth = 0; depth < 25 && cursor; depth += 1) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    let managerId: string | null = input.reportingManagerStaffIdByStaffId.get(cursor) ?? null;
    if (!managerId) break;
    const manager = input.managerByStaffId.get(managerId);
    if (!manager) {
      cursor = managerId;
      continue;
    }
    if (isSrSiteSupervisorTitle(manager.jobTitle) || isHeadOfOperationsTitle(manager.jobTitle)) {
      break;
    }
    if (isFnbManager(manager.jobTitle, null)) break;
    if (isLeaveLineSupervisorTitle(manager.jobTitle, manager.staffRole) && manager.userId) {
      return manager.userId;
    }
    cursor = managerId;
  }
  return null;
}

export type LeaveSupervisorRoute = {
  /** Line / Venue supervisor logins for the manager seat (empty when skipped). */
  managerUserIds: string[];
  /** Sr. Site Supervisor logins for the site seat. */
  siteUserIds: string[];
  /** True when there is no Venue / line Supervisor seat — skip manager. */
  skipManagerSeat: boolean;
  openingStep: HrLeaveApprovalRole;
};

/**
 * Resolve supervisor vs Sr. Site seats for a leave requester.
 * Venue / line Supervisors take `manager`; Team Leaders are skipped; Sr. Site holds `site`.
 */
export function resolveLeaveSupervisorRoute(
  directory: ApprovalDirectory,
  args: {
    locationId: string;
    staffId: string | null;
    requestedBy: string;
    requesterStaffId?: string | null;
  },
): LeaveSupervisorRoute {
  const opsIds = opsSeatUserIds(directory);
  const lookupId = args.requesterStaffId ?? args.staffId;
  const srSiteSet = new Set(directory.srSiteSupervisorUserIds ?? []);
  const siteUserIds = requesterLineManagerUserIds(directory, args);
  const accept = (id: string) => id !== args.requestedBy && !opsIds.has(id);

  // Prefer the chart walk past Team Leaders to a real Venue / line Supervisor.
  const walked =
    lookupId && directory.leaveSupervisorManagerUserIdByStaffId
      ? directory.leaveSupervisorManagerUserIdByStaffId.get(lookupId)
      : undefined;
  if (walked && accept(walked) && !srSiteSet.has(walked)) {
    return {
      managerUserIds: [walked],
      siteUserIds,
      skipManagerSeat: false,
      openingStep: leaveOpeningStepRole(false),
    };
  }

  // Fallback: named boss only when they are already a known leave Supervisor login
  // (present in site supervisor location maps but not Sr. Site). Never assign TL.
  const named = lookupId ? directory.reportingManagerUserIdByStaffId.get(lookupId) : undefined;
  if (named && accept(named) && !srSiteSet.has(named)) {
    const venueIds = new Set<string>();
    for (const ids of directory.siteSupervisorUserIdsByLocationId.values()) {
      for (const id of ids) {
        if (!srSiteSet.has(id)) venueIds.add(id);
      }
    }
    if (venueIds.has(named)) {
      return {
        managerUserIds: [named],
        siteUserIds,
        skipManagerSeat: false,
        openingStep: leaveOpeningStepRole(false),
      };
    }
  }

  return {
    managerUserIds: [],
    siteUserIds,
    skipManagerSeat: true,
    openingStep: leaveOpeningStepRole(true),
  };
}

export function leaveApproverUserIdsForStep(
  directory: ApprovalDirectory,
  step: HrLeaveApprovalRole | string,
  args: {
    locationId: string;
    staffId: string | null;
    requestedBy: string;
    requesterStaffId?: string | null;
  },
): string[] {
  if (step === "manager") {
    return resolveLeaveSupervisorRoute(directory, args).managerUserIds;
  }
  if (step === "site") {
    return resolveLeaveSupervisorRoute(directory, args).siteUserIds;
  }
  if (step === "ops") {
    return opsStepApproverUserIds(directory, args.staffId);
  }
  if (step === "hr") {
    return [...directory.hrUserIds];
  }
  if (step === "gm") {
    return [...(directory.generalManagerUserIds ?? [])];
  }
  return [];
}

export function leaveWaitingNotifyBody(input: {
  staffName: string;
  dateFrom?: string | null;
  requestNumber?: string | null;
  stepRole: string;
  opsLane?: OpsApprovalLane | null;
}): string {
  const who = input.staffName.trim() || "Staff";
  const number = input.requestNumber?.trim();
  const numberSuffix = number ? ` (${number})` : "";
  const date = input.dateFrom ? ` from ${input.dateFrom}` : "";
  const seat = leaveStepSeatLabel(input.stepRole, { opsLane: input.opsLane });
  return `${who} submitted leave request${numberSuffix}${date}. It is waiting for ${seat}.`;
}

export function leaveOpsLaneForDirectoryStaff(
  directory: ApprovalDirectory,
  staffId: string | null,
): OpsApprovalLane {
  return opsApprovalLaneForStaffId(directory, staffId);
}

/** Sr. Site title holds the site seat (not the supervisor manager seat). */
export function isLeaveSiteStepActor(jobTitle: string | null | undefined): boolean {
  return isSrSiteSupervisorTitle(jobTitle);
}

/** HoO / F&B Manager title holds only the ops seat on leave. */
export function isLeaveOpsStepActor(
  jobTitle: string | null | undefined,
  department?: string | null,
): boolean {
  return isHeadOfOperationsTitle(jobTitle) || isFnbManager(jobTitle, department);
}

/**
 * Print form Supervisor column visibility.
 * Prefer the approval trail: show only when a real supervisor (`manager`) seat
 * is pending or approved. Skipped / absent manager (chain starts at Sr. Site)
 * and legacy manager→ops→hr rows (first seat was Sr. Site) hide the column.
 * When steps are unknown yet, fall back to the applicant title (Sr. Site → hide).
 */
export function leavePrintShowsSupervisorSeat(
  jobTitle: string | null | undefined,
  steps?: ReadonlyArray<{ stepRole: string; status: string }> | null,
): boolean {
  const list = steps ?? [];
  if (list.length > 0) {
    // Pre-site-step ladder: manager was Sr. Site — no Venue supervisor column.
    if (!list.some((step) => step.stepRole === "site")) return false;
    const manager = list.find((step) => step.stepRole === "manager");
    if (!manager) return false;
    return manager.status === "approved" || manager.status === "pending";
  }
  return !isSrSiteSupervisorTitle(jobTitle);
}

/**
 * When the leave subject is Supervisor / Venue Supervisor, skip the manager seat
 * and open on Sr. Site (mirrors correction). Sr. Site subjects also skip site → HoO.
 */
export function leaveSubjectSeatSkips(
  jobTitle: string | null | undefined,
  staffRole?: string | null,
): {
  skipManagerSeat: boolean;
  skipSiteSeat: boolean;
} | null {
  if (isSrSiteSupervisorTitle(jobTitle)) {
    return { skipManagerSeat: true, skipSiteSeat: true };
  }
  if (isLeaveLineSupervisorTitle(jobTitle, staffRole)) {
    return { skipManagerSeat: true, skipSiteSeat: false };
  }
  return null;
}

/**
 * When a supervisor / Sr. Site / HoO applies leave for a team member, skip seats
 * they already hold so the request does not return to the same actor.
 */
export function leaveTeamSubmitSkips(opening: "site" | "ops" | "final"): {
  skipManagerSeat: boolean;
  skipSiteSeat: boolean;
} {
  if (opening === "final" || opening === "ops") {
    return { skipManagerSeat: true, skipSiteSeat: true };
  }
  return { skipManagerSeat: true, skipSiteSeat: false };
}
