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
    secondment_days: 14,
    joker_days: 7,
    family_visa_days: 30,
    higher_mgmt_days: 60,
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
