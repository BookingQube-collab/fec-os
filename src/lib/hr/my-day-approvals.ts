import {
  canUserActOnCorrection,
  isHeadOfOperationsTitle,
  isSiteSupervisorTitle,
  type ApprovalDirectory,
  type CorrectionApprovalView,
} from "@/lib/attendance-hr/missed-punch-approval";
import { isFnbManager } from "@/lib/arcade/access";
import {
  canActOnOpsApprovalStep,
  type OpsApprovalLane,
} from "@/lib/approval-ops-routing";
import type { HrLeaveApprovalRole } from "@/lib/hr-leave";
import { canUserDo, type AppRole } from "@/lib/rbac";

const LEAVE_STEPS = new Set<HrLeaveApprovalRole>(["manager", "ops", "hr"]);

/**
 * Roles that already approve a punch step somewhere in the chain.
 * A cashier is not here. Direct reports and a Head of Operations title are handled separately.
 */
const CORRECTION_REVIEW_ROLES = ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "hr"] as const;

function asRoles(roles: readonly string[]): AppRole[] {
  return [...roles] as AppRole[];
}

/**
 * My Day leave button. Same seats as actOnLeaveApproval:
 * line manager at the manager step,
 * Head of Operations (Operations) or F&B Manager (F&B) at the ops step,
 * and hr.leave.manage at the HR step. CEO and GM already hold that capability.
 * A person does not approve their own request from this page.
 */
export function canApproveLeaveOnMyDay(input: {
  roles: readonly string[];
  stepRole: string | null;
  isOwnRequest: boolean;
  isLineManager: boolean;
  jobTitle?: string | null;
  department?: string | null;
  /** Requester's ops lane. Defaults to Operations when omitted. */
  opsLane?: OpsApprovalLane | null;
}): boolean {
  if (input.isOwnRequest) return false;
  if (!input.stepRole || !LEAVE_STEPS.has(input.stepRole as HrLeaveApprovalRole)) return false;
  const roles = asRoles(input.roles);
  const manage = canUserDo(roles, "hr.leave.manage");
  const managerCap = canUserDo(roles, "hr.leave.approve_manager");
  const step = input.stepRole as HrLeaveApprovalRole;
  if (step === "hr") return manage;
  if (step === "manager") return manage || managerCap || input.isLineManager;
  return canActOnOpsApprovalStep({
    manage,
    lane: input.opsLane ?? "head_of_operations",
    actorJobTitle: input.jobTitle,
    actorDepartment: input.department,
  });
}

/** Whether the Leave tab should show the staff-leave approval list. */
export function mayReviewStaffLeaveOnMyDay(input: {
  roles: readonly string[];
  hasDirectReports: boolean;
  jobTitle?: string | null;
  department?: string | null;
}): boolean {
  if (isHeadOfOperationsTitle(input.jobTitle)) return true;
  if (isFnbManager(input.jobTitle, input.department)) return true;
  return canApproveLeaveOnMyDay({
    roles: input.roles,
    stepRole: "manager",
    isOwnRequest: false,
    isLineManager: input.hasDirectReports,
    jobTitle: input.jobTitle,
    department: input.department,
  });
}

/** Whether the Correction tab should show punch requests waiting on this login. */
export function mayReviewStaffCorrectionsOnMyDay(input: {
  roles: readonly string[];
  hasDirectReports: boolean;
  jobTitle?: string | null;
  staffRole?: string | null;
}): boolean {
  if (input.hasDirectReports) return true;
  if (isSiteSupervisorTitle(input.jobTitle, input.staffRole)) return true;
  if (isHeadOfOperationsTitle(input.jobTitle)) return true;
  if (isFnbManager(input.jobTitle, null)) return true;
  return input.roles.some((role) => (CORRECTION_REVIEW_ROLES as readonly string[]).includes(role));
}

/** Punch approval on My Day uses the same directory check as the correction queue. */
export function canApproveCorrectionOnMyDay(
  directory: ApprovalDirectory,
  userId: string,
  row: CorrectionApprovalView,
): boolean {
  return canUserActOnCorrection(directory, userId, row);
}
