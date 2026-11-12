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
import {
  isLeaveLineSupervisorTitle,
  isLeaveOpsStepActor,
  isLeaveSiteStepActor,
} from "@/lib/hr-leave-routing";
import { canUserDo, type AppRole } from "@/lib/rbac";

const LEAVE_STEPS = new Set<HrLeaveApprovalRole>(["manager", "site", "ops", "hr", "gm"]);

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
 * line / Venue supervisor at manager,
 * Sr. Site Supervisor at site,
 * Head of Operations (Operations) or F&B Manager (F&B) at ops (terminal),
 * and hr.leave.manage only for legacy hr seats; branch_gm / General Manager title for gm.
 * A person does not approve their own request from this page.
 *
 * Title seats win over manage: Sr. Site with branch_gm (hr.leave.manage) still
 * only acts on the site step; HoO / F&B with regional_ops manage only act on ops —
 * manage must not clear Supervisor, Sr. Site, or the wrong ops lane.
 * Exception: when the pending seat is `gm`, branch_gm may act (sick→annual path).
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
  const srSite = isLeaveSiteStepActor(input.jobTitle);
  const opsTitle = isLeaveOpsStepActor(input.jobTitle, input.department);
  // GM seat (sick→annual) — branch_gm role or General Manager title; not Sr. Site / HoO title seats.
  if (step === "gm") {
    if (srSite || opsTitle) return false;
    if (roles.includes("branch_gm")) return true;
    const title = (input.jobTitle ?? "").toLowerCase();
    return title.includes("general manager") || /(^|[^a-z])gm([^a-z]|$)/i.test(title);
  }
  // Title seats are exclusive — manage / approve_manager must not unlock other seats.
  if (srSite) {
    return step === "site";
  }
  if (opsTitle) {
    if (step !== "ops") return false;
    return canActOnOpsApprovalStep({
      manage: false,
      lane: input.opsLane ?? "head_of_operations",
      actorJobTitle: input.jobTitle,
      actorDepartment: input.department,
    });
  }
  if (step === "hr") return manage;
  if (step === "site") return manage;
  if (step === "manager") {
    return manage || managerCap || input.isLineManager;
  }
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
  staffRole?: string | null;
}): boolean {
  if (isHeadOfOperationsTitle(input.jobTitle)) return true;
  if (isFnbManager(input.jobTitle, input.department)) return true;
  if (isLeaveSiteStepActor(input.jobTitle)) return true;
  // Venue / line Supervisor holds the manager seat (team may be under Team Leads).
  if (isLeaveLineSupervisorTitle(input.jobTitle, input.staffRole)) return true;
  // GM seat for sick→annual follow-on.
  if (
    canApproveLeaveOnMyDay({
      roles: input.roles,
      stepRole: "gm",
      isOwnRequest: false,
      isLineManager: false,
      jobTitle: input.jobTitle,
      department: input.department,
    })
  ) {
    return true;
  }
  return canApproveLeaveOnMyDay({
    roles: input.roles,
    stepRole: "manager",
    isOwnRequest: false,
    isLineManager: input.hasDirectReports,
    jobTitle: input.jobTitle,
    department: input.department,
  });
}

/**
 * Waiting Approve rows for My Day. `listLeaveRequests({ approvals: true })` already
 * applies `canApproveLeaveOnMyDay` with the leave team scope (Venue Supervisor OT /
 * chart rollup, not direct reports only). Re-filtering with direct-report IDs drops
 * crew under Team Leads while the tab badge still counts them — keep badge === list.
 */
export function leaveWaitingRowsFromApprovalsList<T extends { staffId: string }>(
  rows: readonly T[],
  myStaffId: string,
): T[] {
  return rows.filter((row) => row.staffId !== myStaffId);
}

/** Badge count must match the visible Waiting Approve list length. */
export function leaveApproveTabCountMatchesList(
  badgeCount: number,
  visibleRows: readonly unknown[],
): boolean {
  return badgeCount === visibleRows.length;
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
