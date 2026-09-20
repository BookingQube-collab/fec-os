/**
 * Exit / resignation / termination rules (Phase 6). Pure — no Supabase.
 * NEVER auto-terminate from warnings, roster import, cron, or probation flags.
 * Probation flags_phase6_termination only opens a draft termination for review.
 */

import { policyNumber } from "@/lib/hr-policy";

export const HR_EMPLOYMENT_CATEGORIES = [
  "permanent",
  "secondment",
  "joker",
  "family_visa",
  "higher_mgmt",
  "operations",
] as const;
export type HrEmploymentCategory = (typeof HR_EMPLOYMENT_CATEGORIES)[number];

export const HR_RESIGNATION_STATUSES = [
  "draft",
  "submitted",
  "pending_override_approval",
  "approved",
  "serving_notice",
  "completed",
  "cancelled",
  "withdrawn",
] as const;
export type HrResignationStatus = (typeof HR_RESIGNATION_STATUSES)[number];

export const HR_TERMINATION_TYPES = [
  "immediate",
  "defined_lwd",
  "with_notice",
  "payment_in_lieu",
  "selected_lwd",
] as const;
export type HrTerminationType = (typeof HR_TERMINATION_TYPES)[number];

export const HR_TERMINATION_NOTICE_TREATMENTS = [
  "immediate",
  "with_notice",
  "payment_in_lieu",
  "waived",
  "none",
] as const;
export type HrTerminationNoticeTreatment = (typeof HR_TERMINATION_NOTICE_TREATMENTS)[number];

export const HR_TERMINATION_STATUSES = [
  "draft",
  "pending_hr_approval",
  "pending_exec_approval",
  "approved",
  "applied",
  "cancelled",
  "withdrawn",
] as const;
export type HrTerminationStatus = (typeof HR_TERMINATION_STATUSES)[number];

export const HR_CLEARANCE_KINDS = ["department", "asset", "finance", "it", "other"] as const;
export type HrClearanceKind = (typeof HR_CLEARANCE_KINDS)[number];

/** Default clearance seed labels when opening exit clearance. */
export const DEFAULT_CLEARANCE_SEED: Array<{
  itemKind: HrClearanceKind;
  label: string;
  department?: string;
  sortOrder: number;
}> = [
  { itemKind: "department", label: "Department handover", department: "Department", sortOrder: 10 },
  { itemKind: "asset", label: "Return company assets", department: "Assets", sortOrder: 20 },
  { itemKind: "it", label: "Revoke system access", department: "IT", sortOrder: 30 },
  { itemKind: "finance", label: "Finance / loan clearance", department: "Finance", sortOrder: 40 },
  { itemKind: "finance", label: "Final settlement stub", department: "Finance", sortOrder: 50 },
];

export type NoticeSuggestion = {
  suggestedDays: number;
  contractual: boolean;
  band: string;
  lengthOfServiceDays: number;
  lengthOfServiceYears: number;
};

/** Whole days between hire and asOf (inclusive of start day = 0). */
export function lengthOfServiceDays(hireDate: string, asOf: string): number {
  const a = Date.parse(`${hireDate.slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${asOf.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function lengthOfServiceYears(hireDate: string, asOf: string): number {
  return lengthOfServiceDays(hireDate, asOf) / 365.25;
}

/**
 * AT#9 — suggest notice from employment category + service length + policy.
 * Higher Management bands: ≤2y → 1m; >2–4y → 2m; >4y → 3m.
 * Operations permanent: 1 month. Secondment: ≥1 week, non-contractual by default.
 */
export function suggestNoticePeriod(input: {
  category: string | null | undefined;
  hireDate: string | null | undefined;
  asOf: string;
  policy: Record<string, unknown>;
}): NoticeSuggestion {
  const hire = input.hireDate?.slice(0, 10) ?? input.asOf.slice(0, 10);
  const days = lengthOfServiceDays(hire, input.asOf);
  const years = days / 365.25;
  const cat = (input.category ?? "permanent").trim().toLowerCase();

  if (cat === "higher_mgmt") {
    const lte2 = policyNumber(input.policy.higher_mgmt_lte_2y_days, 30);
    const gt2 = policyNumber(input.policy.higher_mgmt_gt_2_lte_4y_days, 60);
    const gt4 = policyNumber(input.policy.higher_mgmt_gt_4y_days, 90);
    if (years <= 2) {
      return {
        suggestedDays: lte2,
        contractual: true,
        band: "higher_mgmt_lte_2y",
        lengthOfServiceDays: days,
        lengthOfServiceYears: years,
      };
    }
    if (years <= 4) {
      return {
        suggestedDays: gt2,
        contractual: true,
        band: "higher_mgmt_gt_2_lte_4y",
        lengthOfServiceDays: days,
        lengthOfServiceYears: years,
      };
    }
    return {
      suggestedDays: gt4,
      contractual: true,
      band: "higher_mgmt_gt_4y",
      lengthOfServiceDays: days,
      lengthOfServiceYears: years,
    };
  }

  if (cat === "secondment") {
    return {
      suggestedDays: policyNumber(input.policy.secondment_days, 7),
      contractual: input.policy.secondment_contractual === true,
      band: "secondment",
      lengthOfServiceDays: days,
      lengthOfServiceYears: years,
    };
  }

  if (cat === "operations") {
    return {
      suggestedDays: policyNumber(input.policy.operations_days, 30),
      contractual: true,
      band: "operations",
      lengthOfServiceDays: days,
      lengthOfServiceYears: years,
    };
  }

  const key =
    cat === "joker"
      ? "joker_days"
      : cat === "family_visa"
        ? "family_visa_days"
        : "permanent_days";
  const fallback = cat === "joker" ? 7 : 30;
  return {
    suggestedDays: policyNumber(input.policy[key], fallback),
    contractual: true,
    band: cat || "permanent",
    lengthOfServiceDays: days,
    lengthOfServiceYears: years,
  };
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * AT#10 — override suggested notice only with mandatory reason + approval.
 */
export function assertNoticeOverrideAllowed(input: {
  suggestedDays: number;
  requiredNoticeDays: number;
  overrideReason?: string | null;
  approved: boolean;
}): { overridden: boolean } {
  const overridden = input.requiredNoticeDays !== input.suggestedDays;
  if (!overridden) return { overridden: false };
  const reason = input.overrideReason?.trim();
  if (!reason) {
    throw new Error("Notice override requires a mandatory reason (AT#10).");
  }
  if (!input.approved) {
    throw new Error("Notice override requires approval before it is applied (AT#10).");
  }
  return { overridden: true };
}

/** Allowed termination types by category family. */
export function allowedTerminationTypes(category: string | null | undefined): HrTerminationType[] {
  const cat = (category ?? "").trim().toLowerCase();
  if (cat === "higher_mgmt") return ["immediate", "defined_lwd"];
  return ["immediate", "with_notice", "payment_in_lieu", "selected_lwd"];
}

export function assertTerminationTypeAllowed(
  category: string | null | undefined,
  type: HrTerminationType,
): void {
  const allowed = allowedTerminationTypes(category);
  if (!allowed.includes(type)) {
    throw new Error(
      `Termination type "${type}" is not allowed for category "${category ?? "unknown"}".`,
    );
  }
}

/**
 * Termination never mutates staff until both HR + exec approvals and apply step.
 */
export function assertTerminationCanApply(input: {
  status: string;
  hrApprovedBy: string | null | undefined;
  execApprovedBy: string | null | undefined;
}): void {
  if (!input.hrApprovedBy || !input.execApprovedBy) {
    throw new Error("Termination requires dual approval (HR Manager + GM/CEO) before apply.");
  }
  if (input.hrApprovedBy === input.execApprovedBy) {
    throw new Error("Dual approval requires two distinct approvers.");
  }
  if (input.status !== "approved") {
    throw new Error(`Cannot apply termination in status "${input.status}".`);
  }
}

/** Next status after one approval slot is filled. */
export function nextTerminationStatusAfterApproval(input: {
  hrApproved: boolean;
  execApproved: boolean;
}): HrTerminationStatus {
  if (input.hrApproved && input.execApproved) return "approved";
  if (input.hrApproved && !input.execApproved) return "pending_exec_approval";
  if (!input.hrApproved && input.execApproved) return "pending_hr_approval";
  return "draft";
}

/** Roles that count as HR Manager approval slot. */
export const HR_TERMINATION_HR_APPROVER_ROLES = ["hr", "coo"] as const;
/** Roles that count as GM/CEO exec approval slot. */
export const HR_TERMINATION_EXEC_APPROVER_ROLES = ["ceo", "coo", "branch_gm"] as const;

export function isHrTerminationApproverSlot(roles: string[]): boolean {
  return roles.some((r) =>
    (HR_TERMINATION_HR_APPROVER_ROLES as readonly string[]).includes(r),
  );
}

export function isExecTerminationApproverSlot(roles: string[]): boolean {
  return roles.some((r) =>
    (HR_TERMINATION_EXEC_APPROVER_ROLES as readonly string[]).includes(r),
  );
}

/**
 * Probation Phase 6 flag → draft termination only.
 * Never sets staff.terminated alone.
 */
export function draftTerminationFromProbationFlag(): {
  status: "draft";
  staffStatusTerminated: false;
  autoTerminatesStaff: false;
  requiresApproval: true;
} {
  return {
    status: "draft",
    staffStatusTerminated: false,
    autoTerminatesStaff: false,
    requiresApproval: true,
  };
}

/** Regression: warnings / roster must never auto-terminate. */
export function exitAutoTerminateGuard(): {
  autoTerminate: false;
  staffStatusTerminated: false;
} {
  return { autoTerminate: false, staffStatusTerminated: false };
}

export function allClearanceComplete(
  items: Array<{ completed: boolean }>,
): boolean {
  if (!items.length) return false;
  return items.every((i) => i.completed);
}
