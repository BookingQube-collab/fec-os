/**
 * HR policy defaults + pure readers.
 * Seeded values live in hr_policy_settings; these are fallbacks when DB is empty
 * (must match migration 20260920120000_hr_policy_foundation.sql).
 */

export const HR_POLICY_SECTIONS = [
  "leave",
  "ot",
  "warning",
  "probation",
  "notice",
  "document",
  "air_ticket",
  "payroll",
  "notification",
] as const;

export type HrPolicySection = (typeof HR_POLICY_SECTIONS)[number];

export type HrPolicyRow = {
  id: string;
  companyId: string | null;
  section: HrPolicySection;
  key: string;
  value: unknown;
  updatedAt: string;
};

/** Fallback defaults — sick is 15 (approved brief), never 14. */
export const HR_POLICY_DEFAULTS: Record<HrPolicySection, Record<string, unknown>> = {
  leave: {
    sick_days: 15,
    annual_days: 21,
    annual_from_hire_date: true,
    emergency_days: 7,
    emergency_min_days: 1,
    emergency_max_days: 7,
    maternity_days: 50,
    maternity_attach_annual: true,
    hajj_days: 14,
    compassionate_inside_qatar_days: 5,
    compassionate_outside_qatar_days: 11,
    carry_forward_max_days: 5,
    carry_forward_expiry_months: 3,
    comp_off_expiry_days: 90,
  },
  ot: {
    min_claimable_minutes: 60,
    rounding: "down",
    overtime_after_minutes: 480,
    max_daily_ot_minutes: null,
    max_weekly_ot_minutes: null,
    requires_preapproval: false,
    eligible_categories: ["secondment"],
    eligible_staff_ids: [] as string[],
    rate_weekday: 1.25,
    rate_weekly_off: 1.5,
    rate_public_holiday: 1.5,
    rate_eid: 2.5,
    /** Fallback daily hours when staff.expected_hours is unset. */
    hours_per_day: 9,
    /** Calendar-month day divisor for OT hourly rate (always 30; not staff contract 26/28). */
    days_per_month: 30,
  },
  warning: {
    active_threshold: 3,
    probation_threshold: 1,
    auto_terminate: false,
  },
  probation: {
    default_months: 6,
    reminder_days: [30, 15, 7],
  },
  notice: {
    permanent_days: 30,
    secondment_days: 7,
    secondment_contractual: false,
    joker_days: 7,
    family_visa_days: 30,
    higher_mgmt_days: 60,
    higher_mgmt_lte_2y_days: 30,
    higher_mgmt_gt_2_lte_4y_days: 60,
    higher_mgmt_gt_4y_days: 90,
    operations_days: 30,
  },
  document: {
    qid_alert_days: 30,
    passport_alert_days: [180, 90, 60, 30],
    reminder_frequency_days: 7,
  },
  air_ticket: {
    cycle_months: 12,
    from_hire_date: true,
    family_eligible_default: false,
    carry_forward_enabled: true,
    carry_forward_months: 3,
    upcoming_horizon_days: 60,
  },
  payroll: {
    currency: "QAR",
    timezone: "Asia/Qatar",
    default_payment_by_category: {
      permanent: "wps",
      secondment: "cheque",
      joker: "cheque",
      family_visa: "bank_transfer",
      higher_mgmt: "wps",
      operations: "wps",
    },
    /**
     * Late punch salary deduction (payroll period).
     * - Each late worked day deducts `late_deduct_units_per_day` day-units (paid = 1 − units).
     *   Default 0.5 = half-day pay (matches prior hardcode).
     * - Optional: when late count ≥ `late_escalate_after_count` (>0), also deduct
     *   `late_escalate_extra_units` once from the period total (e.g. 3 lates → +1 full day).
     * Week off / leave never count as late.
     */
    late_deduct_enabled: true,
    late_deduct_units_per_day: 0.5,
    late_escalate_after_count: 0,
    late_escalate_extra_units: 1,
    /**
     * Optional WPS/SIF employer fields (Finance). Empty = export labels the gap;
     * not bank-certified until Finance supplies real MOL / establishment values.
     */
    wps_employer_eid: "",
    wps_payer_eid: "",
    wps_establishment_id: "",
  },
  notification: {
    channels: ["in_app", "email"],
    qid_alert_days: 30,
    passport_alert_days: [180, 90, 60, 30],
    probation_reminder_days: [30, 15, 7],
  },
};

export function getPolicyDefault(section: HrPolicySection, key: string): unknown {
  return HR_POLICY_DEFAULTS[section]?.[key];
}

export function mergePolicySection(
  section: HrPolicySection,
  rows: Array<{ key: string; value: unknown }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...HR_POLICY_DEFAULTS[section] };
  for (const row of rows) {
    out[row.key] = row.value;
  }
  return out;
}

export function policyNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

export function policyBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

/** Clamp day-units used by late deduct (0 … 1). */
export function clampLateDeductUnits(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return Math.round(value * 100) / 100;
}

/**
 * Resolved late-punch deduction policy for a payroll period.
 * See HR_POLICY_DEFAULTS.payroll late_* keys.
 */
export type LateDeductPolicy = {
  enabled: boolean;
  /** Day-units removed from each late worked day (0 / 0.5 / 1). Paid = 1 − this. */
  unitsPerLateDay: number;
  /** When late count ≥ this (>0), apply extra once. 0 = off. */
  escalateAfterCount: number;
  /** Extra day-units deducted once when the threshold is met. */
  escalateExtraUnits: number;
};

export const DEFAULT_LATE_DEDUCT_POLICY: LateDeductPolicy = {
  enabled: true,
  unitsPerLateDay: 0.5,
  escalateAfterCount: 0,
  escalateExtraUnits: 1,
};

/** Build late deduct policy from a merged payroll policy section. */
export function lateDeductPolicyFromSection(
  section: Record<string, unknown> | null | undefined,
): LateDeductPolicy {
  const src = section ?? HR_POLICY_DEFAULTS.payroll;
  return {
    enabled: policyBoolean(src.late_deduct_enabled, DEFAULT_LATE_DEDUCT_POLICY.enabled),
    unitsPerLateDay: clampLateDeductUnits(
      policyNumber(src.late_deduct_units_per_day, DEFAULT_LATE_DEDUCT_POLICY.unitsPerLateDay),
    ),
    escalateAfterCount: Math.max(
      0,
      Math.round(policyNumber(src.late_escalate_after_count, DEFAULT_LATE_DEDUCT_POLICY.escalateAfterCount)),
    ),
    escalateExtraUnits: clampLateDeductUnits(
      policyNumber(src.late_escalate_extra_units, DEFAULT_LATE_DEDUCT_POLICY.escalateExtraUnits),
    ),
  };
}

/** Paid day-units for one calendar date under late policy (no period escalation). */
export function paidUnitsForLateDate(
  isLate: boolean,
  policy: LateDeductPolicy = DEFAULT_LATE_DEDUCT_POLICY,
): number {
  if (!policy.enabled || !isLate) return 1;
  return Math.max(0, 1 - policy.unitsPerLateDay);
}

/**
 * Sum paid day-units across paid dates, applying per-late-day deduct and optional
 * once-per-period escalation when late count reaches the threshold.
 */
export function sumPaidUnitsWithLatePolicy(
  paidDates: readonly string[],
  lateDates: readonly string[] | null | undefined,
  policy: LateDeductPolicy = DEFAULT_LATE_DEDUCT_POLICY,
): {
  units: number;
  lateDays: number;
  escalateApplied: boolean;
  escalateUnits: number;
} {
  const lateSet = new Set(
    (lateDates ?? []).map((d) => String(d ?? "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  );
  let units = 0;
  let lateDays = 0;
  for (const raw of paidDates) {
    const ymd = String(raw ?? "").slice(0, 10);
    const isLate = lateSet.has(ymd);
    if (isLate) lateDays += 1;
    units += paidUnitsForLateDate(isLate, policy);
  }
  let escalateApplied = false;
  let escalateUnits = 0;
  if (
    policy.enabled &&
    policy.escalateAfterCount > 0 &&
    lateDays >= policy.escalateAfterCount &&
    policy.escalateExtraUnits > 0
  ) {
    escalateUnits = policy.escalateExtraUnits;
    units = Math.max(0, units - escalateUnits);
    escalateApplied = true;
  }
  return {
    units: Math.round((units + Number.EPSILON) * 100) / 100,
    lateDays,
    escalateApplied,
    escalateUnits,
  };
}

/** Subtract escalation units from current bucket first, then previous. */
export function applyLateEscalateToSplitUnits(input: {
  previousUnits: number;
  currentUnits: number;
  lateDays: number;
  policy: LateDeductPolicy;
}): {
  previousUnits: number;
  currentUnits: number;
  escalateApplied: boolean;
  escalateUnits: number;
} {
  const { policy, lateDays } = input;
  let previousUnits = Math.max(0, input.previousUnits);
  let currentUnits = Math.max(0, input.currentUnits);
  if (
    !policy.enabled ||
    policy.escalateAfterCount <= 0 ||
    lateDays < policy.escalateAfterCount ||
    policy.escalateExtraUnits <= 0
  ) {
    return { previousUnits, currentUnits, escalateApplied: false, escalateUnits: 0 };
  }
  let remaining = policy.escalateExtraUnits;
  const fromCurrent = Math.min(currentUnits, remaining);
  currentUnits -= fromCurrent;
  remaining -= fromCurrent;
  if (remaining > 0) {
    const fromPrevious = Math.min(previousUnits, remaining);
    previousUnits -= fromPrevious;
    remaining -= fromPrevious;
  }
  return {
    previousUnits: Math.round((previousUnits + Number.EPSILON) * 100) / 100,
    currentUnits: Math.round((currentUnits + Number.EPSILON) * 100) / 100,
    escalateApplied: true,
    escalateUnits: policy.escalateExtraUnits - remaining,
  };
}

/** Leave allotment defaults for annual/sick from a merged leave section. */
export function leaveAllotmentDefaultsFromPolicy(leaveSection: Record<string, unknown>): {
  annual: number;
  sick: number;
} {
  return {
    annual: policyNumber(leaveSection.annual_days, 21),
    sick: policyNumber(leaveSection.sick_days, 15),
  };
}

/**
 * Roster import must not auto-terminate. Archive = flag for HR review only.
 * Termination requires an explicit approved workflow (later phase).
 */
export function rosterMissingStaffMutation(): {
  flagged_for_hr_review: true;
  auto_terminated: false;
} {
  return { flagged_for_hr_review: true, auto_terminated: false };
}
