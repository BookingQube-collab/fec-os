export const HR_LEAVE_TYPES = ["annual", "sick", "unpaid", "emergency", "other"] as const;
export type HrLeaveType = (typeof HR_LEAVE_TYPES)[number];

export const HR_LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type HrLeaveStatus = (typeof HR_LEAVE_STATUSES)[number];

export type HrLeaveActor = "employee" | "hr";

const TRANSITIONS: Record<HrLeaveStatus, Partial<Record<HrLeaveActor, HrLeaveStatus[]>>> = {
  pending: {
    employee: ["cancelled"],
    hr: ["approved", "rejected"],
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
