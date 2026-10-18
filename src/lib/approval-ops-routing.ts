/**
 * Shared Operations vs F&B approval lane for leave and punch corrections.
 * Operations: line manager → Head of Operations → HR.
 * F&B: line manager / F&B Supervisor → F&B Manager → HR (never Head of Operations).
 */

import { isFnbManager, isFoodBeverageText } from "@/lib/arcade/access";
import { orgFocusDepartmentOfName } from "@/lib/exclude-org-departments";

export type OpsApprovalLane = "head_of_operations" | "fnb_manager";

const CAFE_WORD = /(?:^|[\s/,])(?:cafe|café)(?:$|[\s/,])/i;

/** Staff on the F&B org chart (café team, F&B titles, F&B department labels). */
export function isFoodBeverageStaff(
  jobTitle?: string | null,
  department?: string | null,
): boolean {
  if (isFoodBeverageText(jobTitle) || isFoodBeverageText(department)) return true;
  if (orgFocusDepartmentOfName(jobTitle) === "fb_cafe") return true;
  if (orgFocusDepartmentOfName(department) === "fb_cafe") return true;
  if (CAFE_WORD.test(jobTitle ?? "") || CAFE_WORD.test(department ?? "")) return true;
  return false;
}

export function opsApprovalLaneForStaff(
  jobTitle?: string | null,
  department?: string | null,
): OpsApprovalLane {
  return isFoodBeverageStaff(jobTitle, department) ? "fnb_manager" : "head_of_operations";
}

export function opsStepApproverLabel(lane: OpsApprovalLane): string {
  return lane === "fnb_manager" ? "F&B Manager" : "Head of Operations";
}

function isHeadOfOperationsTitle(jobTitle?: string | null): boolean {
  return /head of operations/i.test(jobTitle ?? "");
}

/**
 * Who may approve the ops / department step for this requester lane.
 * HR and company leave managers (manage) may always act.
 * F&B Manager title acts only on the F&B lane; Head of Operations only on Operations.
 */
export function canActOnOpsApprovalStep(input: {
  manage: boolean;
  lane: OpsApprovalLane;
  actorJobTitle?: string | null;
  actorDepartment?: string | null;
}): boolean {
  if (input.manage) return true;
  if (input.lane === "fnb_manager") {
    return isFnbManager(input.actorJobTitle, input.actorDepartment);
  }
  return isHeadOfOperationsTitle(input.actorJobTitle);
}

/** Directory lookup for the ops-step approver user ids for one staff member. */
export function opsStepApproverUserIds(
  directory: {
    headOfOperationsUserIds: readonly string[];
    fnbManagerUserIds: readonly string[];
    fnbStaffIds: ReadonlySet<string>;
  },
  staffId: string | null,
): string[] {
  if (staffId && directory.fnbStaffIds.has(staffId)) {
    return [...directory.fnbManagerUserIds];
  }
  return [...directory.headOfOperationsUserIds];
}

export function opsApprovalLaneForStaffId(
  directory: { fnbStaffIds: ReadonlySet<string> },
  staffId: string | null,
): OpsApprovalLane {
  if (staffId && directory.fnbStaffIds.has(staffId)) return "fnb_manager";
  return "head_of_operations";
}
