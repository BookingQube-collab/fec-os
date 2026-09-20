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

export const HR_LEAVE_APPROVAL_ROLES = ["manager", "ops", "hr"] as const;
export type HrLeaveApprovalRole = (typeof HR_LEAVE_APPROVAL_ROLES)[number];

export const HR_LEAVE_APPROVAL_STATUSES = ["pending", "approved", "skipped", "rejected"] as const;
export type HrLeaveApprovalStatus = (typeof HR_LEAVE_APPROVAL_STATUSES)[number];

export const HR_EMERGENCY_TREATMENTS = ["deduct_annual", "unpaid", "partial"] as const;
export type HrEmergencyTreatment = (typeof HR_EMERGENCY_TREATMENTS)[number];

export const HR_COMPASSIONATE_SCOPES = ["inside_qatar", "outside_qatar"] as const;
export type HrCompassionateScope = (typeof HR_COMPASSIONATE_SCOPES)[number];

export type HrLeaveActor = "employee" | "hr" | "manager" | "ops";

const TRANSITIONS: Record<HrLeaveStatus, Partial<Record<HrLeaveActor, HrLeaveStatus[]>>> = {
  pending: {
    employee: ["cancelled"],
    hr: ["approved", "rejected"],
    manager: ["rejected"],
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

/** Default approval ladder: manager → ops → HR (final syncs attendance). */
export function defaultLeaveApprovalSteps(): Array<{
  stepOrder: number;
  stepRole: HrLeaveApprovalRole;
}> {
  return [
    { stepOrder: 1, stepRole: "manager" },
    { stepOrder: 2, stepRole: "ops" },
    { stepOrder: 3, stepRole: "hr" },
  ];
}
