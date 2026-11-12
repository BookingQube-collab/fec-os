/**
 * Leave entitlement / adjacency / sick→annual policy (HR leave rules).
 *
 * Defaults locked for open HR questions (confirm with HR ops when ready):
 * - Management 30d: heuristics — employment_category `higher_mgmt`, department
 *   matching /management/i, job title/role containing Manager|Director|GM|HoO|Head,
 *   optional `staff_profile_ext.is_management`, or configurable keyword list in
 *   hr_policy leave section (`management_title_keywords`).
 * - DOJ for tenure = `staff.hire_date`.
 * - Leave year = calendar year (existing balances / accrual).
 * - Sandwich OFF+AL+OFF = block submit (safer than silent deduct). HR override later.
 * - Unpublished roster: fall back to `staff.weekly_off_weekday`; if primary is Friday (5),
 *   also treat Saturday (6) as OFF (Fri–Sat pattern used in roster tooling).
 * - Sick quota exhausted → auto-split: sick up to remaining, excess as annual follow-on
 *   with medical docs; approval path HR → GM (site visibility without blocking).
 */

import { countLeaveDays } from "@/lib/hr-leave";
import { policyNumber } from "@/lib/hr-policy";

/** Under 5y from DOJ. */
export const ANNUAL_TIER_UNDER_5Y_DAYS = 21;
export const ANNUAL_TIER_UNDER_5Y_MONTHLY = 1.75;

/** 5 years or more from DOJ. */
export const ANNUAL_TIER_5Y_PLUS_DAYS = 28;
export const ANNUAL_TIER_5Y_PLUS_MONTHLY = 2.33;

/** Management staff flat entitlement. */
export const ANNUAL_TIER_MANAGEMENT_DAYS = 30;
export const ANNUAL_TIER_MANAGEMENT_MONTHLY = 2.5;

export const ANNUAL_TENURE_YEARS_THRESHOLD = 5;

/** Default title/role keywords for management tier (case-insensitive substring). */
export const DEFAULT_MANAGEMENT_TITLE_KEYWORDS = [
  "manager",
  "director",
  "general manager",
  "gm",
  "head of",
  "hoo",
  "head of operations",
  "chief",
] as const;

export type AnnualLeaveTierCode = "under_5y" | "5y_plus" | "management";

export type AnnualLeaveTier = {
  code: AnnualLeaveTierCode;
  annualDays: number;
  monthlyAccrual: number;
  /** Completed years of service used for the tenure decision (null when management). */
  yearsOfService: number | null;
  reason: string;
};

export type ManagementStaffInput = {
  jobTitle?: string | null;
  department?: string | null;
  staffRole?: string | null;
  /** staff_profile_ext.employment_category */
  employmentCategory?: string | null;
  /** Optional explicit flag (staff_profile_ext.is_management). */
  isManagement?: boolean | null;
  /** Override keyword list from hr_policy; falls back to DEFAULT_MANAGEMENT_TITLE_KEYWORDS. */
  titleKeywords?: readonly string[] | null;
};

/**
 * Management detection for the 30-day annual tier.
 * Explicit `isManagement` wins; then higher_mgmt category; then department /
 * title / role keyword heuristics.
 */
export function isManagementStaff(input: ManagementStaffInput): boolean {
  if (input.isManagement === true) return true;
  if (input.isManagement === false) {
    // Explicit false still allows higher_mgmt category (HR grade).
  }
  const category = (input.employmentCategory ?? "").trim().toLowerCase();
  if (category === "higher_mgmt") return true;

  const dept = (input.department ?? "").trim().toLowerCase();
  if (dept.includes("management") || dept === "mgmt" || dept === "ho management") {
    return true;
  }

  const keywords =
    input.titleKeywords && input.titleKeywords.length > 0
      ? input.titleKeywords
      : DEFAULT_MANAGEMENT_TITLE_KEYWORDS;
  const haystack = `${input.jobTitle ?? ""} ${input.staffRole ?? ""}`.toLowerCase();
  if (!haystack.trim()) return false;
  for (const raw of keywords) {
    const kw = String(raw).trim().toLowerCase();
    if (!kw) continue;
    if (kw === "gm") {
      // Word-boundary style: avoid matching "program".
      if (/(^|[^a-z])gm([^a-z]|$)/i.test(haystack)) return true;
      continue;
    }
    if (haystack.includes(kw)) return true;
  }
  return false;
}

/** Completed whole years from DOJ (hire_date) to as-of date. */
export function completedYearsOfService(
  hireDate: string | null | undefined,
  asOfDate: string,
): number | null {
  const hire = hireDate?.slice(0, 10);
  const asOf = asOfDate.slice(0, 10);
  if (!hire || !/^\d{4}-\d{2}-\d{2}$/.test(hire) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return null;
  }
  if (asOf < hire) return null;
  const hy = Number(hire.slice(0, 4));
  const hm = Number(hire.slice(5, 7));
  const hd = Number(hire.slice(8, 10));
  const ay = Number(asOf.slice(0, 4));
  const am = Number(asOf.slice(5, 7));
  const ad = Number(asOf.slice(8, 10));
  let years = ay - hy;
  if (am < hm || (am === hm && ad < hd)) years -= 1;
  return Math.max(0, years);
}

export type ResolveAnnualLeaveTierInput = ManagementStaffInput & {
  hireDate: string | null | undefined;
  /** Usually today or leave start; defaults to end of year if omitted by callers. */
  asOfDate: string;
  /** Policy overrides (hr_policy leave section). */
  under5yDays?: number;
  fiveYearPlusDays?: number;
  managementDays?: number;
  tenureYearsThreshold?: number;
};

export function resolveAnnualLeaveTier(input: ResolveAnnualLeaveTierInput): AnnualLeaveTier {
  const under5 = Math.max(0, input.under5yDays ?? ANNUAL_TIER_UNDER_5Y_DAYS);
  const fivePlus = Math.max(0, input.fiveYearPlusDays ?? ANNUAL_TIER_5Y_PLUS_DAYS);
  const management = Math.max(0, input.managementDays ?? ANNUAL_TIER_MANAGEMENT_DAYS);
  const threshold = Math.max(1, input.tenureYearsThreshold ?? ANNUAL_TENURE_YEARS_THRESHOLD);

  if (isManagementStaff(input)) {
    return {
      code: "management",
      annualDays: management,
      monthlyAccrual: Math.round((management / 12) * 100) / 100,
      yearsOfService: completedYearsOfService(input.hireDate, input.asOfDate),
      reason: "management_staff",
    };
  }

  const years = completedYearsOfService(input.hireDate, input.asOfDate);
  if (years != null && years >= threshold) {
    return {
      code: "5y_plus",
      annualDays: fivePlus,
      monthlyAccrual: Math.round((fivePlus / 12) * 100) / 100,
      yearsOfService: years,
      reason: `tenure_${years}y_gte_${threshold}`,
    };
  }

  return {
    code: "under_5y",
    annualDays: under5,
    monthlyAccrual: Math.round((under5 / 12) * 100) / 100,
    yearsOfService: years,
    reason: years == null ? "no_hire_date_or_under_threshold" : `tenure_${years}y_lt_${threshold}`,
  };
}

/** Read tier day numbers from a merged leave policy section. */
export function annualTierDaysFromPolicy(leaveSection: Record<string, unknown>): {
  under5yDays: number;
  fiveYearPlusDays: number;
  managementDays: number;
  tenureYearsThreshold: number;
  titleKeywords: string[];
  sandwichBlockSubmit: boolean;
} {
  const keywordsRaw = leaveSection.management_title_keywords;
  const titleKeywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map((k) => String(k)).filter(Boolean)
    : [...DEFAULT_MANAGEMENT_TITLE_KEYWORDS];
  const sandwichRaw = leaveSection.sandwich_block_submit;
  return {
    under5yDays: policyNumber(leaveSection.annual_days_under_5y, ANNUAL_TIER_UNDER_5Y_DAYS),
    fiveYearPlusDays: policyNumber(leaveSection.annual_days_5y_plus, ANNUAL_TIER_5Y_PLUS_DAYS),
    managementDays: policyNumber(leaveSection.annual_days_management, ANNUAL_TIER_MANAGEMENT_DAYS),
    tenureYearsThreshold: policyNumber(
      leaveSection.annual_tenure_years_threshold,
      ANNUAL_TENURE_YEARS_THRESHOLD,
    ),
    titleKeywords,
    // Default true — block sandwich on submit (safer than silent deduct).
    sandwichBlockSubmit: sandwichRaw === false || sandwichRaw === "false" ? false : true,
  };
}

// ---------------------------------------------------------------------------
// Weekly OFF adjacency / sandwich
// ---------------------------------------------------------------------------

/** Qatar-local weekday 0=Sun..6=Sat for a YYYY-MM-DD. */
export function qatarWeekday(ymd: string): number {
  return new Date(`${ymd.slice(0, 10)}T12:00:00+03:00`).getUTCDay();
}

/**
 * Standing OFF weekdays from staff.weekly_off_weekday.
 * Friday (5) also implies Saturday (6) — Fri–Sat pattern used in roster tooling.
 */
export function standingWeeklyOffWeekdays(
  weeklyOffWeekday: number | null | undefined,
): number[] {
  if (weeklyOffWeekday == null || !Number.isFinite(Number(weeklyOffWeekday))) return [];
  const day = Math.round(Number(weeklyOffWeekday));
  if (day < 0 || day > 6) return [];
  if (day === 5) return [5, 6];
  return [day];
}

export function addCalendarDays(ymd: string, delta: number): string {
  const t = Date.parse(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  const next = new Date(t + delta * 86_400_000);
  return next.toISOString().slice(0, 10);
}

export type WeeklyOffLookup = {
  /** Explicit OFF dates from roster (is_week_off) keyed YYYY-MM-DD. */
  rosterOffDates?: ReadonlySet<string> | ReadonlyMap<string, boolean>;
  /** Dates that have a published roster row (any status). */
  rosterPublishedDates?: ReadonlySet<string>;
  weeklyOffWeekday?: number | null;
};

function rosterSaysOff(lookup: WeeklyOffLookup, ymd: string): boolean | null {
  const key = ymd.slice(0, 10);
  if (lookup.rosterOffDates instanceof Set) {
    if (lookup.rosterPublishedDates && !lookup.rosterPublishedDates.has(key)) return null;
    if (lookup.rosterOffDates.has(key)) return true;
    if (lookup.rosterPublishedDates?.has(key)) return false;
    return null;
  }
  if (lookup.rosterOffDates instanceof Map) {
    if (lookup.rosterOffDates.has(key)) return Boolean(lookup.rosterOffDates.get(key));
    if (lookup.rosterPublishedDates?.has(key)) return false;
    return null;
  }
  return null;
}

/** True when the date is a weekly OFF (roster wins; else standing weekday fallback). */
export function isWeeklyOffDate(ymd: string, lookup: WeeklyOffLookup): boolean {
  const roster = rosterSaysOff(lookup, ymd);
  if (roster != null) return roster;
  const standing = standingWeeklyOffWeekdays(lookup.weeklyOffWeekday);
  if (standing.length === 0) return false;
  return standing.includes(qatarWeekday(ymd));
}

/**
 * Walk contiguous OFF days immediately before `dateFrom` (exclusive).
 * Returns the OFF block touching the leave start (may be multiple days, e.g. Fri–Sat).
 */
export function prefixWeeklyOffDates(
  dateFrom: string,
  lookup: WeeklyOffLookup,
  maxScan = 14,
): string[] {
  const out: string[] = [];
  let cursor = addCalendarDays(dateFrom.slice(0, 10), -1);
  for (let i = 0; i < maxScan; i += 1) {
    if (!isWeeklyOffDate(cursor, lookup)) break;
    out.unshift(cursor);
    cursor = addCalendarDays(cursor, -1);
  }
  return out;
}

/** Contiguous OFF days immediately after `dateTo` (exclusive). */
export function suffixWeeklyOffDates(
  dateTo: string,
  lookup: WeeklyOffLookup,
  maxScan = 14,
): string[] {
  const out: string[] = [];
  let cursor = addCalendarDays(dateTo.slice(0, 10), 1);
  for (let i = 0; i < maxScan; i += 1) {
    if (!isWeeklyOffDate(cursor, lookup)) break;
    out.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return out;
}

export type SandwichDetection = {
  /** OFF days immediately before annual leave. */
  prefixOffDates: string[];
  /** OFF days immediately after annual leave. */
  suffixOffDates: string[];
  hasPrefix: boolean;
  hasSuffix: boolean;
  /** True when both prefix and suffix OFF touch the AL block (not allowed). */
  isSandwich: boolean;
  /** OFF days that would be charged if deduct mode were enabled. */
  chargeableOffDates: string[];
};

/**
 * Prefix OR suffix weekly OFF with annual leave is allowed.
 * Prefix AND suffix (OFF + AL + OFF) is a sandwich — not allowed.
 */
export function detectAnnualLeaveSandwich(input: {
  dateFrom: string;
  dateTo: string;
  lookup: WeeklyOffLookup;
}): SandwichDetection {
  const prefixOffDates = prefixWeeklyOffDates(input.dateFrom, input.lookup);
  const suffixOffDates = suffixWeeklyOffDates(input.dateTo, input.lookup);
  const hasPrefix = prefixOffDates.length > 0;
  const hasSuffix = suffixOffDates.length > 0;
  const isSandwich = hasPrefix && hasSuffix;
  return {
    prefixOffDates,
    suffixOffDates,
    hasPrefix,
    hasSuffix,
    isSandwich,
    chargeableOffDates: isSandwich ? [...prefixOffDates, ...suffixOffDates] : [],
  };
}

// ---------------------------------------------------------------------------
// Sick quota → annual follow-on split
// ---------------------------------------------------------------------------

export type SickAnnualSplit = {
  /** Days that still fit in sick quota (0 when exhausted). */
  sickDays: number;
  /** Excess days that must consume annual. */
  annualDays: number;
  sickDateFrom: string | null;
  sickDateTo: string | null;
  annualDateFrom: string | null;
  annualDateTo: string | null;
  /** True when any portion must use annual after sick quota. */
  requiresAnnualFollowOn: boolean;
  /** Medical docs required for the annual follow-on (and when sick is used). */
  requiresMedicalDocs: boolean;
  /** Use HR → GM approval ladder for the annual follow-on request. */
  useHrThenGmPath: boolean;
  remainingSickBefore: number;
};

/**
 * Split a continuous absence into sick (up to remaining quota) + annual excess.
 * Prefer clear UX: two linked date ranges rather than silent type coercion.
 */
export function splitSickToAnnual(input: {
  dateFrom: string;
  dateTo: string;
  remainingSickDays: number;
}): SickAnnualSplit {
  const from = input.dateFrom.slice(0, 10);
  const to = input.dateTo.slice(0, 10);
  const total = countLeaveDays(from, to);
  const remaining = Math.max(0, Number(input.remainingSickDays) || 0);

  if (total < 1) {
    return {
      sickDays: 0,
      annualDays: 0,
      sickDateFrom: null,
      sickDateTo: null,
      annualDateFrom: null,
      annualDateTo: null,
      requiresAnnualFollowOn: false,
      requiresMedicalDocs: false,
      useHrThenGmPath: false,
      remainingSickBefore: remaining,
    };
  }

  if (remaining <= 0) {
    return {
      sickDays: 0,
      annualDays: total,
      sickDateFrom: null,
      sickDateTo: null,
      annualDateFrom: from,
      annualDateTo: to,
      requiresAnnualFollowOn: true,
      requiresMedicalDocs: true,
      useHrThenGmPath: true,
      remainingSickBefore: 0,
    };
  }

  if (total <= remaining) {
    return {
      sickDays: total,
      annualDays: 0,
      sickDateFrom: from,
      sickDateTo: to,
      annualDateFrom: null,
      annualDateTo: null,
      requiresAnnualFollowOn: false,
      requiresMedicalDocs: true,
      useHrThenGmPath: false,
      remainingSickBefore: remaining,
    };
  }

  const sickDays = remaining;
  const annualDays = total - remaining;
  const sickDateTo = addCalendarDays(from, sickDays - 1);
  const annualDateFrom = addCalendarDays(sickDateTo, 1);
  return {
    sickDays,
    annualDays,
    sickDateFrom: from,
    sickDateTo,
    annualDateFrom,
    annualDateTo: to,
    requiresAnnualFollowOn: true,
    requiresMedicalDocs: true,
    useHrThenGmPath: true,
    remainingSickBefore: remaining,
  };
}

/** Approval seats for sick→annual follow-on: HR then GM (terminal). */
export function sickAnnualFollowOnApprovalSteps(): Array<{
  stepOrder: number;
  stepRole: "hr" | "gm";
  status: "pending";
}> {
  return [
    { stepOrder: 1, stepRole: "hr", status: "pending" },
    { stepOrder: 2, stepRole: "gm", status: "pending" },
  ];
}
