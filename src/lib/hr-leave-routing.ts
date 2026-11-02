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
