/**
 * OT claim rules (Phase 4). Pure — no Supabase.
 * Eligible minutes come from attendance-hr overtime_minutes / computeAttendanceOvertimeMinutes;
 * this module only rounds, gates the 1-hour minimum, rates, amounts, and workflow.
 */

export const HR_OT_RATE_TYPES = ["weekday", "weekly_off", "public_holiday", "eid"] as const;
export type HrOtRateType = (typeof HR_OT_RATE_TYPES)[number];

export const HR_OT_STATUSES = [
  "draft",
  "submitted",
  "manager_verified",
  "hr_approved",
  "payroll_posted",
  "rejected",
  "cancelled",
] as const;
export type HrOtStatus = (typeof HR_OT_STATUSES)[number];

export const HR_OT_ROUNDING = ["down", "up", "minutes"] as const;
export type HrOtRounding = (typeof HR_OT_ROUNDING)[number];

export type HrOtActor = "employee" | "manager" | "hr" | "payroll";

const TRANSITIONS: Record<HrOtStatus, Partial<Record<HrOtActor, HrOtStatus[]>>> = {
  draft: {
    employee: ["submitted", "cancelled"],
    hr: ["submitted", "cancelled"],
  },
  submitted: {
    employee: ["cancelled"],
    manager: ["manager_verified", "rejected"],
    hr: ["manager_verified", "rejected", "cancelled"],
  },
  manager_verified: {
    hr: ["hr_approved", "rejected"],
  },
  hr_approved: {
    payroll: ["payroll_posted"],
    hr: ["payroll_posted"],
  },
  payroll_posted: {},
  rejected: {},
  cancelled: {},
};

export function canTransitionOt(from: HrOtStatus, to: HrOtStatus, actor: HrOtActor): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from][actor] ?? []).includes(to);
}

export function assertOtTransition(from: HrOtStatus, to: HrOtStatus, actor: HrOtActor): void {
  if (!canTransitionOt(from, to, actor)) {
    throw new Error(`OT claim cannot move from ${from} to ${to}.`);
  }
}

/** AT#4: payroll_posted only once, only from hr_approved. */
export function canMarkPayrollPosted(status: HrOtStatus): boolean {
  return status === "hr_approved";
}

export function assertCanMarkPayrollPosted(status: HrOtStatus): void {
  if (!canMarkPayrollPosted(status)) {
    throw new Error(
      status === "payroll_posted"
        ? "OT claim is already payroll_posted."
        : "OT claim must be hr_approved before payroll_posted.",
    );
  }
}

export function roundOtMinutes(minutes: number, mode: HrOtRounding = "down"): number {
  const n = Math.max(0, Number(minutes) || 0);
  if (mode === "up") return Math.ceil(n);
  if (mode === "minutes") return Math.round(n);
  return Math.floor(n);
}

/**
 * AT#3: minimum claimable OT is one complete hour (policy default 60).
 * Apply rounding first, then reject below the floor.
 */
export function assertMinClaimableMinutes(
  minutes: number,
  minClaimable = 60,
  rounding: HrOtRounding = "down",
): number {
  const rounded = roundOtMinutes(minutes, rounding);
  if (rounded < minClaimable) {
    throw new Error(
      `OT below minimum: need at least ${minClaimable} complete minutes (got ${rounded}).`,
    );
  }
  return rounded;
}

export function resolveOtRateMultiplier(
  rateType: HrOtRateType,
  policy: Record<string, unknown>,
): number {
  const key =
    rateType === "weekday"
      ? "rate_weekday"
      : rateType === "weekly_off"
        ? "rate_weekly_off"
        : rateType === "public_holiday"
          ? "rate_public_holiday"
          : "rate_eid";
  const fallback =
    rateType === "weekday" ? 1.25 : rateType === "eid" ? 2.5 : 1.5;
  const raw = policy[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isOtEligible(input: {
  employmentCategory?: string | null;
  staffId?: string | null;
  policy: Record<string, unknown>;
}): boolean {
  const staffIds = Array.isArray(input.policy.eligible_staff_ids)
    ? input.policy.eligible_staff_ids.map(String)
    : [];
  if (input.staffId && staffIds.includes(input.staffId)) return true;

  const cats = Array.isArray(input.policy.eligible_categories)
    ? input.policy.eligible_categories.map((c) => String(c).toLowerCase())
    : ["secondment"];
  const cat = (input.employmentCategory ?? "").toLowerCase().trim();
  if (!cat) return cats.length === 0;
  return cats.includes(cat) || cats.includes("*") || cats.includes("all");
}

/** Hourly rate from monthly basic (or daily) using policy day/hour divisors. */
export function hourlyRateFromPay(input: {
  monthlyBasicQar?: number | null;
  dailyRateQar?: number | null;
  hoursPerDay?: number;
  daysPerMonth?: number;
}): number {
  const hours = input.hoursPerDay && input.hoursPerDay > 0 ? input.hoursPerDay : 8;
  const days = input.daysPerMonth && input.daysPerMonth > 0 ? input.daysPerMonth : 30;
  const monthly = Number(input.monthlyBasicQar);
  if (Number.isFinite(monthly) && monthly > 0) return monthly / days / hours;
  const daily = Number(input.dailyRateQar);
  if (Number.isFinite(daily) && daily > 0) return daily / hours;
  return 0;
}

export function computeOtAmountQar(input: {
  approvedMinutes: number;
  rateMultiplier: number;
  hourlyRateQar: number;
}): number {
  const hours = Math.max(0, input.approvedMinutes) / 60;
  const amount = hours * Math.max(0, input.hourlyRateQar) * Math.max(0, input.rateMultiplier);
  return Math.round(amount * 100) / 100;
}

/**
 * Prefer stored attendance overtime_minutes; optionally reuse computeAttendanceOvertimeMinutes
 * via a precomputed fallback — never invent a second attendance engine here.
 */
export function resolveEligibleOtMinutes(input: {
  storedOvertimeMinutes?: number | null;
  computedOvertimeMinutes?: number | null;
}): number {
  const stored = Number(input.storedOvertimeMinutes);
  if (Number.isFinite(stored) && stored > 0) return Math.round(stored);
  const computed = Number(input.computedOvertimeMinutes);
  if (Number.isFinite(computed) && computed > 0) return Math.round(computed);
  return 0;
}

export type OtSummaryBucket = {
  key: string;
  staffId?: string;
  staffName?: string | null;
  department?: string | null;
  employmentType?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  claims: number;
  eligibleMinutes: number;
  approvedMinutes: number;
  amountQar: number;
};

export function aggregateOtSummaries(
  rows: Array<{
    staffId: string;
    staffName?: string | null;
    department?: string | null;
    employmentType?: string | null;
    locationId?: string | null;
    locationName?: string | null;
    eligibleMinutes: number;
    approvedMinutes: number;
    amountQar: number;
    status: string;
  }>,
  groupBy: "employee" | "department" | "employment_type" | "location",
): OtSummaryBucket[] {
  const map = new Map<string, OtSummaryBucket>();
  for (const row of rows) {
    if (row.status === "rejected" || row.status === "cancelled" || row.status === "draft") continue;
    const key =
      groupBy === "employee"
        ? row.staffId
        : groupBy === "department"
          ? row.department || "—"
          : groupBy === "employment_type"
            ? row.employmentType || "—"
            : row.locationId || "—";
    const existing = map.get(key) ?? {
      key,
      staffId: groupBy === "employee" ? row.staffId : undefined,
      staffName: groupBy === "employee" ? row.staffName ?? null : undefined,
      department: groupBy === "department" ? row.department ?? null : undefined,
      employmentType: groupBy === "employment_type" ? row.employmentType ?? null : undefined,
      locationId: groupBy === "location" ? row.locationId ?? null : undefined,
      locationName: groupBy === "location" ? row.locationName ?? null : undefined,
      claims: 0,
      eligibleMinutes: 0,
      approvedMinutes: 0,
      amountQar: 0,
    };
    existing.claims += 1;
    existing.eligibleMinutes += Math.max(0, row.eligibleMinutes);
    existing.approvedMinutes += Math.max(0, row.approvedMinutes);
    existing.amountQar = Math.round((existing.amountQar + Math.max(0, row.amountQar)) * 100) / 100;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.amountQar - a.amountQar);
}
