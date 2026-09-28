import { defaultLeaveApprovalSteps, type HrLeaveApprovalRole } from "@/lib/hr-leave";

/** Same ladder as leave: site supervisor → Head of Operations → HR. */
export type MissedPunchStepRole = HrLeaveApprovalRole;

export type MissedPunchQueue = "waiting" | "mine";

export type CorrectionApprovalView = {
  status: string;
  currentStepRole: MissedPunchStepRole | null;
  locationId: string;
  staffId: string | null;
  requestedBy: string;
};

export type ApprovalDirectory = {
  /** Set only when the reporting manager has a login. Empty means derive from the site. */
  reportingManagerUserIdByStaffId: ReadonlyMap<string, string>;
  branchGmUserIdsByLocationId: ReadonlyMap<string, readonly string[]>;
  siteSupervisorUserIdsByLocationId: ReadonlyMap<string, readonly string[]>;
  headOfOperationsUserIds: readonly string[];
  /**
   * Logins of the people site supervisors at a location report to.
   * The operations step uses this hierarchy together with Head of Operations.
   */
  opsManagerUserIdsByLocationId: ReadonlyMap<string, readonly string[]>;
  hrUserIds: readonly string[];
};

export function missedPunchApprovalSteps(): Array<{ stepOrder: number; stepRole: MissedPunchStepRole }> {
  return defaultLeaveApprovalSteps();
}

export function nextMissedPunchStep(current: MissedPunchStepRole): MissedPunchStepRole | null {
  const steps = missedPunchApprovalSteps();
  const index = steps.findIndex((step) => step.stepRole === current);
  if (index < 0) return null;
  return steps[index + 1]?.stepRole ?? null;
}

const SCHEDULED_OFF = new Set([
  "weekly_off",
  "public_holiday",
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
]);

/**
 * A correctable day offers both punch in and punch out.
 * An existing check-in does not hide punch-in — the employee may correct that time and add the missing punch-out.
 * Scheduled off days and days that already have both punches are not a request.
 */
export function missedPunchRequestSide(summary: {
  missedPunch: boolean;
  status: string;
  hasIn: boolean;
  hasOut: boolean;
}): "in" | "out" | "either" | null {
  if (summary.hasIn && summary.hasOut) return null;
  if (SCHEDULED_OFF.has(summary.status) && !summary.missedPunch) return null;
  const missing = !summary.hasIn || !summary.hasOut;
  const flagged =
    summary.missedPunch ||
    summary.status === "missed_punch" ||
    summary.status === "absent" ||
    summary.status === "incomplete";
  const oneSided = summary.hasIn !== summary.hasOut;
  if (!missing || (!flagged && !oneSided)) return null;
  return "either";
}

/** Site in-charge: venue supervisor role, or a site/venue supervisor title. Not every "supervisor" job. */
export function isSiteSupervisorTitle(jobTitle: string | null | undefined, staffRole: string | null | undefined): boolean {
  if (staffRole === "venue_supervisor") return true;
  const title = (jobTitle ?? "").trim();
  if (!title) return false;
  return (
    /(?:^|[\s/])(?:sr\.?\s+|senior\s+)?site supervisor\b/i.test(title) ||
    /\bvenue supervisor\b/i.test(title)
  );
}

export function isHeadOfOperationsTitle(jobTitle: string | null | undefined): boolean {
  return /head of operations/i.test(jobTitle ?? "");
}

export function lineManagerUserIds(
  directory: ApprovalDirectory,
  locationId: string,
  staffId: string | null,
): string[] {
  if (staffId) {
    const named = directory.reportingManagerUserIdByStaffId.get(staffId);
    if (named) return [named];
  }
  const branch = directory.branchGmUserIdsByLocationId.get(locationId) ?? [];
  const titled = directory.siteSupervisorUserIdsByLocationId.get(locationId) ?? [];
  return [...new Set([...branch, ...titled])];
}

export function approverUserIdsForStep(
  directory: ApprovalDirectory,
  step: MissedPunchStepRole,
  locationId: string,
  staffId: string | null,
): string[] {
  if (step === "manager") return lineManagerUserIds(directory, locationId, staffId);
  if (step === "ops") {
    const fromHierarchy = directory.opsManagerUserIdsByLocationId.get(locationId) ?? [];
    return [...new Set([...directory.headOfOperationsUserIds, ...fromHierarchy])];
  }
  return [...directory.hrUserIds];
}

/**
 * Admin/CEO is copied on the site-supervisor and Head of Operations steps.
 * The HR step stays with HR only.
 */
export function missedPunchCopiesExecutives(step: MissedPunchStepRole): boolean {
  return step === "manager" || step === "ops";
}

export function canUserActOnCorrection(
  directory: ApprovalDirectory,
  userId: string,
  row: CorrectionApprovalView,
): boolean {
  if (row.status !== "pending" || !row.currentStepRole) return false;
  if (userId === row.requestedBy) return false;
  return approverUserIdsForStep(directory, row.currentStepRole, row.locationId, row.staffId).includes(userId);
}

export function correctionVisibleToUser(args: {
  queue: MissedPunchQueue;
  userId: string;
  canFinalApprove: boolean;
  viewAll: boolean;
  canSeeLocation: (locationId: string) => boolean;
  directory: ApprovalDirectory;
  row: CorrectionApprovalView;
  /** CEO may open supervisor and operations steps without becoming the approver. */
  observeExecutiveSteps?: boolean;
}): boolean {
  if (args.queue === "mine") return args.row.requestedBy === args.userId;
  if (canUserActOnCorrection(args.directory, args.userId, args.row)) return true;
  if (
    args.observeExecutiveSteps &&
    args.row.status === "pending" &&
    args.row.currentStepRole &&
    missedPunchCopiesExecutives(args.row.currentStepRole) &&
    args.row.requestedBy !== args.userId
  ) {
    return true;
  }
  const legacy = args.row.status === "pending" && !args.row.currentStepRole;
  if (legacy) {
    if (!args.canSeeLocation(args.row.locationId)) return false;
    return args.canFinalApprove || args.viewAll;
  }
  if (!userFollowsCorrection(args.directory, args.userId, args.row, args.canSeeLocation)) return false;
  if (args.row.status === "rejected" || args.row.status === "approved" || args.row.status === "change_required") {
    return true;
  }
  // Earlier approvers keep a read-only view after their step, so the row can show Approved.
  if (args.row.status === "pending" && args.row.currentStepRole === "ops") {
    return lineManagerUserIds(args.directory, args.row.locationId, args.row.staffId).includes(args.userId);
  }
  if (args.row.status === "pending" && args.row.currentStepRole === "hr") {
    return (
      lineManagerUserIds(args.directory, args.row.locationId, args.row.staffId).includes(args.userId) ||
      approverUserIdsForStep(args.directory, "ops", args.row.locationId, args.row.staffId).includes(args.userId)
    );
  }
  return false;
}

function userFollowsCorrection(
  directory: ApprovalDirectory,
  userId: string,
  row: CorrectionApprovalView,
  canSeeLocation: (locationId: string) => boolean,
): boolean {
  if (canSeeLocation(row.locationId)) return true;
  return (
    lineManagerUserIds(directory, row.locationId, row.staffId).includes(userId) ||
    approverUserIdsForStep(directory, "ops", row.locationId, row.staffId).includes(userId) ||
    approverUserIdsForStep(directory, "hr", row.locationId, row.staffId).includes(userId)
  );
}

export type CorrectionReviewLine = {
  id: string;
};

/**
 * One click reviews one correction id.
 * A second punch-in or punch-out for the same employee and day is a different id and stays untouched.
 */
export function correctionIdsForReview(rows: readonly CorrectionReviewLine[], correctionId: string): string[] {
  const target = correctionId.trim();
  if (!target) return [];
  return rows.filter((row) => row.id === target).map((row) => row.id);
}

export function punchTypeFromCorrectionValue(
  value: Record<string, unknown> | null | undefined,
): "in" | "out" | null {
  const raw = value && typeof value === "object" ? value.punch_type ?? value.punchType : null;
  if (raw === "in" || raw === "out") return raw;
  return null;
}

/** Clock time the employee submitted. Missing stored time stays empty — never invent one. */
export function punchAtFromCorrectionValue(value: Record<string, unknown> | null | undefined): string | null {
  if (!value || typeof value !== "object") return null;
  const raw = value.punch_at ?? value.punchAt ?? value.time ?? value.punch_time;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Times to print on one correction card.
 * The other side stays empty so a sibling request's clock is not copied onto this card.
 */
export function correctionCardClocks(
  punchType: "in" | "out" | null,
  punchAt: string | null,
): { punchIn: string | null; punchOut: string | null } {
  return {
    punchIn: punchType === "in" ? punchAt : null,
    punchOut: punchType === "out" ? punchAt : null,
  };
}

export type AcceptedCorrectionPunch = {
  id: string;
  staffId: string | null;
  workDate: string | null;
  status: string;
  currentStepRole: MissedPunchStepRole | null;
  punchType: "in" | "out" | null;
  punchAt: string | null;
  requestedAt?: string | null;
};

/**
 * The punch counts once the current step has accepted it.
 * Still waiting on the site supervisor does not. Rejected and change-required do not.
 */
export function correctionPunchAccepted(row: {
  status: string;
  currentStepRole: MissedPunchStepRole | null;
}): boolean {
  if (row.status === "approved") return true;
  if (row.status !== "pending") return false;
  return row.currentStepRole === "ops" || row.currentStepRole === "hr";
}

export function applyAcceptedCorrectionTimes<
  T extends {
    staff_id: string | null;
    work_date: string;
    actual_in: string | null;
    actual_out: string | null;
  },
>(rows: readonly T[], corrections: readonly AcceptedCorrectionPunch[]): T[] {
  const accepted = corrections
    .filter((row) => correctionPunchAccepted(row) && row.punchAt && row.staffId && row.workDate)
    .slice()
    .sort((a, b) => String(a.requestedAt ?? "").localeCompare(String(b.requestedAt ?? "")));
  return rows.map((row) => {
    const staffId = row.staff_id;
    const workDate = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !workDate) return row;
    let actualIn = row.actual_in;
    let actualOut = row.actual_out;
    for (const correction of accepted) {
      if (correction.staffId !== staffId) continue;
      if (String(correction.workDate).slice(0, 10) !== workDate) continue;
      const punchAt = correction.punchAt;
      if (!punchAt) continue;
      if (correction.punchType === "in") actualIn = punchAt;
      else if (correction.punchType === "out") actualOut = punchAt;
      else if (!actualIn) actualIn = punchAt;
      else if (!actualOut) actualOut = punchAt;
    }
    if (actualIn === row.actual_in && actualOut === row.actual_out) return row;
    return { ...row, actual_in: actualIn, actual_out: actualOut };
  });
}

/** Qatar HH:mm for the employee time input. */
export function punchTimeInputValue(punchAt: string | null | undefined): string {
  if (!punchAt) return "";
  const match = punchAt.match(/T(\d{2}):(\d{2})/);
  if (match && /[+-]\d{2}:\d{2}$/.test(punchAt)) return `${match[1]}:${match[2]}`;
  const parsed = new Date(punchAt);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  if (!hour || !minute) return "";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}
