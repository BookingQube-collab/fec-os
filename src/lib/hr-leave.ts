export const HR_LEAVE_TYPES = [
  "annual",
  "sick",
  "unpaid",
  "emergency",
  "maternity",
  "hajj",
  "compassionate",
  "comp_off",
  "other",
] as const;
export type HrLeaveType = (typeof HR_LEAVE_TYPES)[number];

export const HR_LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type HrLeaveStatus = (typeof HR_LEAVE_STATUSES)[number];

/**
 * Leave seats: manager (line / Venue supervisor) → site (Sr. Site) → ops (HoO / F&B).
 * `hr` remains for legacy in-flight rows only (notify-only on the ops-final ladder).
 */
export const HR_LEAVE_APPROVAL_ROLES = ["manager", "site", "ops", "hr"] as const;
export type HrLeaveApprovalRole = (typeof HR_LEAVE_APPROVAL_ROLES)[number];

export const HR_LEAVE_APPROVAL_STATUSES = ["pending", "approved", "skipped", "rejected"] as const;
export type HrLeaveApprovalStatus = (typeof HR_LEAVE_APPROVAL_STATUSES)[number];

export const HR_EMERGENCY_TREATMENTS = ["deduct_annual", "unpaid", "partial"] as const;
export type HrEmergencyTreatment = (typeof HR_EMERGENCY_TREATMENTS)[number];

export const HR_COMPASSIONATE_SCOPES = ["inside_qatar", "outside_qatar"] as const;
export type HrCompassionateScope = (typeof HR_COMPASSIONATE_SCOPES)[number];

export type HrLeaveActor = "employee" | "hr" | "manager" | "site" | "ops";

const TRANSITIONS: Record<HrLeaveStatus, Partial<Record<HrLeaveActor, HrLeaveStatus[]>>> = {
  pending: {
    employee: ["cancelled"],
    hr: ["approved", "rejected"],
    manager: ["rejected"],
    site: ["rejected"],
    ops: ["rejected"],
  },
  approved: {},
  rejected: {},
  cancelled: {},
};

export function canTransitionLeave(
  from: HrLeaveStatus,
  to: HrLeaveStatus,
  actor: HrLeaveActor,
): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from][actor] ?? []).includes(to);
}

export function assertLeaveTransition(
  from: HrLeaveStatus,
  to: HrLeaveStatus,
  actor: HrLeaveActor,
): void {
  if (!canTransitionLeave(from, to, actor)) {
    throw new Error(`Leave cannot move from ${from} to ${to}.`);
  }
}

export function countLeaveDays(dateFrom: string, dateTo: string): number {
  const from = Date.parse(`${dateFrom.slice(0, 10)}T00:00:00.000Z`);
  const to = Date.parse(`${dateTo.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

/**
 * Active approval ladder: supervisor → Sr. Site Supervisor → HoO / F&B Manager.
 * Ops is terminal (syncs attendance / roster). HR is notified after ops, not a seat.
 */
export function defaultLeaveApprovalSteps(): Array<{
  stepOrder: number;
  stepRole: HrLeaveApprovalRole;
}> {
  return [
    { stepOrder: 1, stepRole: "manager" },
    { stepOrder: 2, stepRole: "site" },
    { stepOrder: 3, stepRole: "ops" },
  ];
}

/**
 * When the named boss is already Sr. Site (or missing), skip the supervisor seat
 * and start on `site` so Mary is not asked twice.
 * Team submit by Sr. Site also skips `site` and opens on `ops` (HoO).
 */
export function leaveApprovalStepsForRequester(input: {
  skipManagerSeat: boolean;
  skipSiteSeat?: boolean;
}): Array<{ stepOrder: number; stepRole: HrLeaveApprovalRole; status: "pending" | "skipped" }> {
  const skipManager = Boolean(input.skipManagerSeat || input.skipSiteSeat);
  const skipSite = Boolean(input.skipSiteSeat);
  return defaultLeaveApprovalSteps().map((step) => {
    if (step.stepRole === "manager" && skipManager) {
      return { ...step, status: "skipped" as const };
    }
    if (step.stepRole === "site" && skipSite) {
      return { ...step, status: "skipped" as const };
    }
    return { ...step, status: "pending" as const };
  });
}

export function leaveOpeningStepRole(skipManagerSeat: boolean, skipSiteSeat = false): HrLeaveApprovalRole {
  if (skipSiteSeat) return "ops";
  return skipManagerSeat ? "site" : "manager";
}

/**
 * Team leave submit (mirrors missed-punch team corrections):
 * - Venue / line supervisor → Sr. Site (`site`)
 * - Sr. Site → HoO (`ops`)
 * - HoO / F&B Manager → finalize immediately
 */
export type LeaveTeamSubmitOpening = "site" | "ops" | "final";

export function leaveTeamSubmitOpening(input: {
  isSrSite: boolean;
  isOpsFinalizer: boolean;
}): LeaveTeamSubmitOpening {
  if (input.isOpsFinalizer) return "final";
  if (input.isSrSite) return "ops";
  return "site";
}

/**
 * HoO / F&B approval writes attendance_leave_records (roster leave codes) and finishes
 * the request. Legacy `hr` seats still finalize when reached.
 */
export function shouldFinalizeLeaveOnApprove(
  stepRole: HrLeaveApprovalRole | string,
  nextStepRole: string | null | undefined,
): boolean {
  if (stepRole === "ops" || stepRole === "hr") return true;
  if (!nextStepRole) return true;
  return false;
}

export function leaveStepSeatLabel(
  stepRole: string | null | undefined,
  opts?: { opsLane?: "head_of_operations" | "fnb_manager" | null },
): string {
  if (stepRole === "manager") return "Supervisor";
  if (stepRole === "site") return "Sr. Site Supervisor";
  if (stepRole === "ops") {
    return opts?.opsLane === "fnb_manager" ? "F&B Manager" : "Head of Operations";
  }
  if (stepRole === "hr") return "HR";
  return "Supervisor";
}
