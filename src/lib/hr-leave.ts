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
 * Attendance must not wait on an HR signature seat.
 */
export function shouldFinalizeLeaveOnApprove(
  stepRole: HrLeaveApprovalRole | string,
  nextStepRole: string | null | undefined,
): boolean {
  if (stepRole === "ops" || stepRole === "hr") return true;
  if (!nextStepRole) return true;
  return false;
}

/** Print-slip signature columns: Supervisor → Sr. Site → HoO → HR. */
export type LeavePrintSigKey = "supervisor" | "site" | "hoo" | "hr";

export type LeavePrintSignature = {
  name: string | null;
  at: string | null;
  imageUrl?: string | null;
};

type LeavePrintStepLike = {
  stepRole: string;
  status: string;
  actedByName?: string | null;
  actedAt?: string | null;
  actedBySignatureUrl?: string | null;
};

/**
 * Pre-site-step leaves only had manager → ops → hr. That first seat was the
 * Sr. Site Supervisor (same as missed-punch), not a Venue supervisor column.
 */
export function leavePrintUsesLegacySiteAsManager(
  steps: ReadonlyArray<{ stepRole: string }> | null | undefined,
): boolean {
  const list = steps ?? [];
  if (list.length === 0) return false;
  return !list.some((step) => step.stepRole === "site");
}

/**
 * Progressive print stamps from approval steps.
 * Only `approved` seats fill (skipped stays blank). HR stamps when leave is
 * finalized (ops already wrote attendance) or a legacy hr seat approved.
 * Legacy rows without a `site` seat stamp the old manager approval under Sr. Site.
 */
export function leavePrintSignatureDone(
  status: string | null | undefined,
  steps: ReadonlyArray<{ stepRole: string; status: string }> | null | undefined,
  key: LeavePrintSigKey,
): boolean {
  const list = steps ?? [];
  const byRole = new Map(list.map((step) => [step.stepRole, step.status]));
  const seatApproved = (role: string) => byRole.get(role) === "approved";
  const legacySiteAsManager = leavePrintUsesLegacySiteAsManager(list);

  if (key === "supervisor") {
    // Never treat the legacy first seat as Supervisor — it maps to Sr. Site.
    if (legacySiteAsManager) return false;
    return seatApproved("manager");
  }
  if (key === "site") {
    if (legacySiteAsManager) return seatApproved("manager");
    return seatApproved("site");
  }
  if (key === "hoo") {
    if (seatApproved("ops")) return true;
    // Legacy fully-approved rows with no stored ops seat.
    if (status === "approved" && list.length === 0) return true;
    return false;
  }
  // HR notify-only after ops finalize — show stamp once leave is approved.
  if (seatApproved("hr")) return true;
  if (status === "approved" && (seatApproved("ops") || list.length === 0)) return true;
  return false;
}

/** Map print seats to people who approved (names + optional digital signature URL). */
export function leavePrintSignatureActors(args: {
  status?: string | null;
  steps: ReadonlyArray<LeavePrintStepLike>;
}): Record<LeavePrintSigKey, LeavePrintSignature> {
  const empty = (): LeavePrintSignature => ({ name: null, at: null, imageUrl: null });
  const pick = (role: string): LeavePrintSignature => {
    const step = args.steps.find((s) => s.stepRole === role && s.status === "approved");
    if (!step) return empty();
    return {
      name: step.actedByName?.trim() || null,
      at: step.actedAt ?? null,
      imageUrl: step.actedBySignatureUrl?.trim() || null,
    };
  };
  const legacySiteAsManager = leavePrintUsesLegacySiteAsManager(args.steps);
  return {
    // Legacy manager stamp belongs in Sr. Site — keep Supervisor empty.
    supervisor: legacySiteAsManager ? empty() : pick("manager"),
    site: legacySiteAsManager ? pick("manager") : pick("site"),
    hoo: pick("ops"),
    // HR is notify-only after ops — stamp cell with ✓ via leavePrintSignatureDone; no actor unless legacy hr seat.
    hr: pick("hr"),
  };
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

/**
 * Trail / badge role for display. Pre-site-step leaves stored Sr. Site on
 * `manager` — remap that seat to `site` so labels read Sr. Site Supervisor.
 */
export function leaveDisplayStepRole(
  stepRole: string | null | undefined,
  steps?: ReadonlyArray<{ stepRole: string }> | null,
): string {
  const role = stepRole ?? "manager";
  if (role === "manager" && leavePrintUsesLegacySiteAsManager(steps)) return "site";
  return role;
}

/**
 * Approve / Approved queues: unique by leave id, and collapse identical pending
 * retry rows (same staff + type + dates) to the earliest created request.
 */
export function dedupeLeaveApprovalRows<
  T extends {
    id: string;
    staffId: string;
    leaveType: string;
    dateFrom: string;
    dateTo: string;
    createdAt: string;
    status: string;
  },
>(rows: T[], opts?: { collapsePendingExact?: boolean }): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const unique = [...byId.values()];
  if (!opts?.collapsePendingExact) {
    return unique;
  }
  const pendingBest = new Map<string, T>();
  const other: T[] = [];
  for (const row of unique) {
    if (row.status !== "pending") {
      other.push(row);
      continue;
    }
    const key = `${row.staffId}|${row.leaveType}|${row.dateFrom}|${row.dateTo}`;
    const prev = pendingBest.get(key);
    if (!prev || row.createdAt < prev.createdAt) pendingBest.set(key, row);
  }
  return [...pendingBest.values(), ...other].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}
