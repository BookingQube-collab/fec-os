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
  if (step === "ops") return [...directory.headOfOperationsUserIds];
  return [...directory.hrUserIds];
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
}): boolean {
  if (args.queue === "mine") return args.row.requestedBy === args.userId;
  if (canUserActOnCorrection(args.directory, args.userId, args.row)) return true;
  const legacy = args.row.status === "pending" && !args.row.currentStepRole;
  if (!legacy) return false;
  if (!args.canSeeLocation(args.row.locationId)) return false;
  return args.canFinalApprove || args.viewAll;
}
