/**
 * Leave approval routing (mirrors missed-punch seats, with an explicit supervisor step).
 * Employee → Supervisor (manager) → Sr. Site (site) → HoO / F&B (ops, terminal) → HR notify.
 */

import {
  opsApprovalLaneForStaffId,
  opsStepApproverUserIds,
  type OpsApprovalLane,
} from "@/lib/approval-ops-routing";
import {
  requesterLineManagerUserIds,
  type ApprovalDirectory,
} from "@/lib/attendance-hr/missed-punch-approval";
import { isSrSiteSupervisorTitle } from "@/lib/org-hierarchy";
import {
  leaveOpeningStepRole,
  leaveStepSeatLabel,
  type HrLeaveApprovalRole,
} from "@/lib/hr-leave";

function opsSeatUserIds(directory: ApprovalDirectory): Set<string> {
  return new Set([...directory.headOfOperationsUserIds, ...directory.fnbManagerUserIds]);
}

export type LeaveSupervisorRoute = {
  /** Line / Venue supervisor logins for the manager seat (empty when skipped). */
  managerUserIds: string[];
  /** Sr. Site Supervisor logins for the site seat. */
  siteUserIds: string[];
  /** True when the named boss is already Sr. Site (or missing) — skip manager. */
  skipManagerSeat: boolean;
  openingStep: HrLeaveApprovalRole;
};

/**
 * Resolve supervisor vs Sr. Site seats for a leave requester.
 * Named Venue / Team supervisors take `manager`; Sr. Site always holds `site`.
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
  const named = lookupId ? directory.reportingManagerUserIdByStaffId.get(lookupId) : undefined;
  const srSiteSet = new Set(directory.srSiteSupervisorUserIds ?? []);
  const siteUserIds = requesterLineManagerUserIds(directory, args);
  const accept = (id: string) => id !== args.requestedBy && !opsIds.has(id);

  if (named && accept(named) && !srSiteSet.has(named)) {
    return {
      managerUserIds: [named],
      siteUserIds,
      skipManagerSeat: false,
      openingStep: leaveOpeningStepRole(false),
    };
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
 * When the leave subject is Sr. Site, skip supervisor + site and open on HoO
 * (self-apply or recorded leave — mirrors Sr. Site team-submit opening).
 */
export function leaveSubjectSeatSkips(jobTitle: string | null | undefined): {
  skipManagerSeat: boolean;
  skipSiteSeat: boolean;
} | null {
  if (!isSrSiteSupervisorTitle(jobTitle)) return null;
  return { skipManagerSeat: true, skipSiteSeat: true };
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
