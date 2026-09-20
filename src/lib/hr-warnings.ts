/**
 * Warning / disciplinary rules (Phase 5). Pure — no Supabase.
 * NEVER auto-terminate. Escalation = formal review + casual leave block only.
 */

export const HR_WARNING_CATEGORIES = [
  "conduct",
  "attendance",
  "performance",
  "safety",
  "policy",
  "other",
] as const;
export type HrWarningCategory = (typeof HR_WARNING_CATEGORIES)[number];

export const HR_WARNING_LEVELS = ["verbal", "written", "final", "other"] as const;
export type HrWarningLevel = (typeof HR_WARNING_LEVELS)[number];

export const HR_WARNING_STATUSES = [
  "active",
  "acknowledged",
  "appealed",
  "withdrawn",
  "expired",
  "amended",
] as const;
export type HrWarningStatus = (typeof HR_WARNING_STATUSES)[number];

/** Leave types treated as casual for escalation block (emergency ≈ casual). */
export const HR_CASUAL_LEAVE_TYPES = new Set(["emergency", "other"]);

export type WarningCountInput = {
  status: string;
  validUntil?: string | null;
};

/**
 * Active counter: status=active AND not past valid_until.
 * Expired/withdrawn/amended/etc. never count.
 */
export function isActiveWarning(w: WarningCountInput, today: string): boolean {
  if (w.status !== "active") return false;
  const until = w.validUntil?.slice(0, 10);
  if (until && until < today.slice(0, 10)) return false;
  return true;
}

export function countActiveWarnings(rows: WarningCountInput[], today: string): number {
  return rows.filter((w) => isActiveWarning(w, today)).length;
}

export type WarningPolicy = {
  activeThreshold: number;
  probationThreshold: number;
  autoTerminate: boolean;
};

export function warningPolicyFromSection(section: Record<string, unknown>): WarningPolicy {
  const active =
    typeof section.active_threshold === "number"
      ? section.active_threshold
      : Number(section.active_threshold);
  const probation =
    typeof section.probation_threshold === "number"
      ? section.probation_threshold
      : Number(section.probation_threshold);
  return {
    activeThreshold: Number.isFinite(active) && active > 0 ? active : 3,
    probationThreshold: Number.isFinite(probation) && probation > 0 ? probation : 1,
    autoTerminate: section.auto_terminate === true,
  };
}

export type WarningEscalation = {
  activeCount: number;
  requiresFormalReview: boolean;
  blocksCasualLeave: boolean;
  triggersProbationReview: boolean;
  /** Always false — policy may claim otherwise; Phase 5 never terminates. */
  autoTerminate: false;
  staffStatusTerminated: false;
};

/**
 * AT#5 / AT#6: thresholds fire review flags only — never termination.
 */
export function evaluateWarningEscalation(input: {
  activeCount: number;
  onProbation: boolean;
  policy: WarningPolicy;
}): WarningEscalation {
  const requiresFormalReview = input.activeCount >= input.policy.activeThreshold;
  const triggersProbationReview =
    input.onProbation && input.activeCount >= input.policy.probationThreshold;
  return {
    activeCount: input.activeCount,
    requiresFormalReview,
    blocksCasualLeave: requiresFormalReview,
    triggersProbationReview,
    autoTerminate: false,
    staffStatusTerminated: false,
  };
}

export function isCasualLeaveBlocked(
  leaveType: string,
  escalation: Pick<WarningEscalation, "blocksCasualLeave">,
): boolean {
  return escalation.blocksCasualLeave && HR_CASUAL_LEAVE_TYPES.has(leaveType);
}

/** Withdraw / cancel / amend require decide capability (enforced at call site). */
export function requiresDecideCapability(action: "withdraw" | "amend" | "cancel"): boolean {
  return action === "withdraw" || action === "amend" || action === "cancel";
}

export function assertWarningLetterRequired(letterDocumentId: string | null | undefined): string {
  const id = letterDocumentId?.trim();
  if (!id) throw new Error("Warning letter document is required before issuing a warning.");
  return id;
}
