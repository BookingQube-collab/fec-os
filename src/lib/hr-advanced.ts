import {
  countLeaveDays,
  type HrCompassionateScope,
  type HrLeaveType,
} from "@/lib/hr-leave";
import { policyNumber } from "@/lib/hr-policy";

export type LeaveBalanceRow = {
  leaveType: HrLeaveType;
  allottedDays: number;
  usedDays: number;
};

export type LeaveBalanceSummary = {
  leaveType: HrLeaveType;
  allottedDays: number;
  usedDays: number;
  remainingDays: number;
  carriedForwardDays?: number;
  expiredDays?: number;
  pendingDays?: number;
  availableDays?: number;
};

export function summarizeLeaveBalances(
  allotments: Array<{
    leaveType: string;
    allottedDays: number;
    carriedForwardDays?: number;
    expiredDays?: number;
    pendingDays?: number;
  }>,
  usedByType: Record<string, number>,
): LeaveBalanceSummary[] {
  const types = new Set<string>([
    ...allotments.map((a) => a.leaveType),
    ...Object.keys(usedByType),
  ]);
  return [...types]
    .sort()
    .map((leaveType) => {
      const row = allotments.find((a) => a.leaveType === leaveType);
      const allotted = row?.allottedDays ?? 0;
      const carried = row?.carriedForwardDays ?? 0;
      const expired = row?.expiredDays ?? 0;
      const pending = row?.pendingDays ?? 0;
      const used = usedByType[leaveType] ?? 0;
      const available = Math.max(0, allotted + carried - expired - used - pending);
      return {
        leaveType: leaveType as HrLeaveType,
        allottedDays: allotted,
        usedDays: used,
        remainingDays: available,
        carriedForwardDays: carried,
        expiredDays: expired,
        pendingDays: pending,
        availableDays: available,
      };
    });
}

export function sumUsedLeaveDays(
  rows: Array<{ leaveType: string; days: number; status: string; dateFrom: string }>,
  year: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.status !== "approved") continue;
    if (Number(row.dateFrom.slice(0, 4)) !== year) continue;
    out[row.leaveType] = (out[row.leaveType] ?? 0) + Number(row.days ?? 0);
  }
  return out;
}

export type LeaveConflictKind = "roster" | "attendance" | "leave_overlap" | "holiday";

export type LeaveConflict = {
  kind: LeaveConflictKind;
  workDate: string;
  detail: string;
};

/** Inclusive YMD overlap between [fromA,toA] and [fromB,toB]. */
export function dateRangesOverlap(
  fromA: string,
  toA: string,
  fromB: string,
  toB: string,
): boolean {
  const a0 = fromA.slice(0, 10);
  const a1 = toA.slice(0, 10);
  const b0 = fromB.slice(0, 10);
  const b1 = toB.slice(0, 10);
  return a0 <= b1 && b0 <= a1;
}

export function detectLeaveConflicts(input: {
  dateFrom: string;
  dateTo: string;
  rosterDates?: string[];
  attendancePresentDates?: string[];
  holidayDates?: string[];
  overlappingLeave?: Array<{ dateFrom: string; dateTo: string; status: string }>;
}): LeaveConflict[] {
  const conflicts: LeaveConflict[] = [];
  const from = input.dateFrom.slice(0, 10);
  const to = input.dateTo.slice(0, 10);
  if (countLeaveDays(from, to) < 1) return conflicts;

  for (const workDate of input.rosterDates ?? []) {
    const d = workDate.slice(0, 10);
    if (d >= from && d <= to) {
      conflicts.push({ kind: "roster", workDate: d, detail: "Assigned on roster" });
    }
  }
  for (const workDate of input.attendancePresentDates ?? []) {
    const d = workDate.slice(0, 10);
    if (d >= from && d <= to) {
      conflicts.push({ kind: "attendance", workDate: d, detail: "Present / punched" });
    }
  }
  for (const workDate of input.holidayDates ?? []) {
    const d = workDate.slice(0, 10);
    if (d >= from && d <= to) {
      conflicts.push({ kind: "holiday", workDate: d, detail: "Public holiday" });
    }
  }
  for (const row of input.overlappingLeave ?? []) {
    if (row.status === "cancelled" || row.status === "rejected") continue;
    if (dateRangesOverlap(from, to, row.dateFrom, row.dateTo)) {
      conflicts.push({
        kind: "leave_overlap",
        workDate: row.dateFrom.slice(0, 10),
        detail: `Overlaps ${row.dateFrom.slice(0, 10)} → ${row.dateTo.slice(0, 10)}`,
      });
    }
  }
  return conflicts;
}

/** Overlapping leave requests are hard-blocked; roster/attendance/holiday may warn. */
export function hasHardLeaveOverlap(conflicts: LeaveConflict[]): boolean {
  return conflicts.some((c) => c.kind === "leave_overlap");
}

export function formatOtPolicySummary(policy: {
  overtimeAfterMinutes: number;
  maxDailyOtMinutes: number | null;
  maxWeeklyOtMinutes: number | null;
  requiresPreapproval: boolean;
}): string {
  const afterH = Math.round((policy.overtimeAfterMinutes / 60) * 10) / 10;
  const parts = [`OT after ${afterH}h worked`];
  if (policy.maxDailyOtMinutes != null) {
    parts.push(`max ${Math.round((policy.maxDailyOtMinutes / 60) * 10) / 10}h/day`);
  }
  if (policy.maxWeeklyOtMinutes != null) {
    parts.push(`max ${Math.round((policy.maxWeeklyOtMinutes / 60) * 10) / 10}h/week`);
  }
  if (policy.requiresPreapproval) parts.push("pre-approval required");
  return parts.join(" · ");
}

export type HeadcountBySite = {
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  headcount: number;
};

export function aggregateHeadcountBySite(
  rows: Array<{ locationId: string | null; locationCode: string | null; locationName: string | null }>,
): HeadcountBySite[] {
  const map = new Map<string, HeadcountBySite>();
  for (const row of rows) {
    const key = row.locationId ?? "none";
    const cur = map.get(key) ?? {
      locationId: row.locationId,
      locationCode: row.locationCode,
      locationName: row.locationName,
      headcount: 0,
    };
    cur.headcount += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.headcount - a.headcount || (a.locationCode ?? "").localeCompare(b.locationCode ?? ""));
}

export function sumLeaveDaysInPeriod(
  rows: Array<{ days: number; status: string; dateFrom: string; dateTo: string }>,
  periodFrom: string,
  periodTo: string,
): number {
  let total = 0;
  const from = periodFrom.slice(0, 10);
  const to = periodTo.slice(0, 10);
  for (const row of rows) {
    if (row.status !== "approved") continue;
    if (!dateRangesOverlap(row.dateFrom, row.dateTo, from, to)) continue;
    total += Number(row.days ?? 0);
  }
  return total;
}

export const HR_DOC_TYPES = [
  "cv",
  "qid",
  "passport",
  "visa",
  "secondment",
  "contract",
  "educational_certificate",
  "mofa_attested_certificate",
  "warning_letter",
  "increment_letter",
  "demotion_letter",
  "resignation_letter",
  "termination_letter",
  "medical_certificate",
  "leave_document",
  "air_ticket_receipt",
  "loan_document",
  "other",
] as const;
export type HrDocType = (typeof HR_DOC_TYPES)[number];

/** Identity / disciplinary / salary docs — extra caps when viewing others. */
export const HR_DOC_SENSITIVE_IDENTITY = new Set<HrDocType>(["qid", "passport"]);
export const HR_DOC_SENSITIVE_DISCIPLINARY = new Set<HrDocType>([
  "warning_letter",
  "demotion_letter",
  "termination_letter",
]);
export const HR_DOC_SENSITIVE_SALARY = new Set<HrDocType>([
  "loan_document",
  "increment_letter",
  "air_ticket_receipt",
]);

/**
 * AT#19 — non-self viewers need elevated caps for identity / disciplinary / salary docs.
 * Pure guard so RBAC can be unit-tested without server actions.
 */
export function assertHrSensitiveDocAccess(input: {
  docType: string;
  isSelf: boolean;
  canManageDocs: boolean;
  canViewSensitive: boolean;
  canViewSalary: boolean;
}): void {
  if (input.isSelf) return;
  const t = input.docType as HrDocType;
  if (HR_DOC_SENSITIVE_IDENTITY.has(t) || HR_DOC_SENSITIVE_DISCIPLINARY.has(t)) {
    if (!input.canManageDocs && !input.canViewSensitive) {
      throw new Error("Sensitive identity/disciplinary documents require elevated access.");
    }
  }
  if (HR_DOC_SENSITIVE_SALARY.has(t)) {
    if (!input.canManageDocs && !input.canViewSalary) {
      throw new Error("Salary-related documents require salary access.");
    }
  }
}

const SENSITIVE_MASK = "••••••••";

/**
 * Strip QID / passport numbers for callers without hr.profile.view_sensitive.
 * Expiry dates stay (ops need “expiring soon”); document files stay gated separately.
 */
export function redactStaffIdentityNumbers<T extends {
  qid?: string | null;
  passport_number?: string | null;
}>(row: T, canViewSensitive: boolean): T {
  if (canViewSensitive) return row;
  return {
    ...row,
    ...(Object.prototype.hasOwnProperty.call(row, "qid")
      ? { qid: row.qid ? SENSITIVE_MASK : null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "passport_number")
      ? { passport_number: row.passport_number ? SENSITIVE_MASK : null }
      : {}),
  };
}

export const HR_CHECKLIST_KINDS = ["onboarding", "offboarding"] as const;
export type HrChecklistKind = (typeof HR_CHECKLIST_KINDS)[number];

/** Fallback when policy store unavailable — keep in sync with hr_policy_settings seed. */
export const DEFAULT_ANNUAL_ALLOTMENT = 21;
export const DEFAULT_SICK_ALLOTMENT = 15;
export const DEFAULT_COMPASSIONATE_INSIDE_QATAR = 5;
export const DEFAULT_COMPASSIONATE_OUTSIDE_QATAR = 11;

/** Attendance engine leave statuses (see attendance-hr/calculate). */
export type AttendanceLeaveType = "annual_leave" | "sick_leave" | "unpaid_leave";

/** Map HR leave request types onto attendance_leave_records.leave_type. */
export function mapHrLeaveTypeToAttendance(leaveType: string): AttendanceLeaveType {
  if (leaveType === "annual" || leaveType === "maternity" || leaveType === "hajj" || leaveType === "compassionate" || leaveType === "comp_off") {
    return "annual_leave";
  }
  if (leaveType === "sick") return "sick_leave";
  return "unpaid_leave";
}

export function compassionateDaysFromPolicy(
  leaveSection: Record<string, unknown>,
  scope: HrCompassionateScope,
): number {
  if (scope === "outside_qatar") {
    return policyNumber(
      leaveSection.compassionate_outside_qatar_days,
      DEFAULT_COMPASSIONATE_OUTSIDE_QATAR,
    );
  }
  return policyNumber(
    leaveSection.compassionate_inside_qatar_days,
    DEFAULT_COMPASSIONATE_INSIDE_QATAR,
  );
}

/**
 * Annual leave accrual from hire_date (AT#8 leave portion).
 * When annual_from_hire_date is false, full policy annual_days once hired.
 * Otherwise pro-rate by full months from hire within the calendar year (Qatar TZ dates as YMD).
 */
export function annualAccrualFromHireDate(input: {
  hireDate: string | null | undefined;
  year: number;
  annualDays: number;
  fromHireDate?: boolean;
  asOfDate?: string;
}): {
  eligible: boolean;
  accruedDays: number;
  monthsAccrued: number;
  fullYearDays: number;
} {
  const fullYearDays = Math.max(0, Number(input.annualDays) || 0);
  const hire = input.hireDate?.slice(0, 10) ?? null;
  if (!hire) {
    return { eligible: false, accruedDays: 0, monthsAccrued: 0, fullYearDays };
  }
  const hireYear = Number(hire.slice(0, 4));
  if (!Number.isFinite(hireYear) || hireYear > input.year) {
    return { eligible: false, accruedDays: 0, monthsAccrued: 0, fullYearDays };
  }

  const asOf = (input.asOfDate ?? `${input.year}-12-31`).slice(0, 10);
  const asOfYear = Number(asOf.slice(0, 4));
  if (asOfYear < input.year) {
    return { eligible: false, accruedDays: 0, monthsAccrued: 0, fullYearDays };
  }
  if (asOf < hire) {
    return { eligible: false, accruedDays: 0, monthsAccrued: 0, fullYearDays };
  }

  if (input.fromHireDate === false) {
    return { eligible: true, accruedDays: fullYearDays, monthsAccrued: 12, fullYearDays };
  }

  const yearStart = `${input.year}-01-01`;
  const periodStart = hire > yearStart ? hire : yearStart;
  const periodEnd = asOf > `${input.year}-12-31` ? `${input.year}-12-31` : asOf;
  if (periodEnd < periodStart) {
    return { eligible: true, accruedDays: 0, monthsAccrued: 0, fullYearDays };
  }

  const startY = Number(periodStart.slice(0, 4));
  const startM = Number(periodStart.slice(5, 7));
  const endY = Number(periodEnd.slice(0, 4));
  const endM = Number(periodEnd.slice(5, 7));
  // Full calendar months from start month through end month inclusive.
  const monthsAccrued = Math.max(0, (endY - startY) * 12 + (endM - startM) + 1);
  const cappedMonths = Math.min(12, monthsAccrued);
  const accruedDays = Math.round((fullYearDays * cappedMonths) / 12 * 10) / 10;
  return { eligible: true, accruedDays, monthsAccrued: cappedMonths, fullYearDays };
}

/** Comp-off may be used only before expiry unless HR exception is set. */
export function canUseCompOff(input: {
  expiresOn: string | null | undefined;
  asOfDate: string;
  hrException?: boolean;
  remainingDays: number;
}): boolean {
  if (input.remainingDays <= 0) return false;
  if (input.hrException) return true;
  if (!input.expiresOn) return true;
  return input.asOfDate.slice(0, 10) <= input.expiresOn.slice(0, 10);
}

/** Inclusive calendar dates (YYYY-MM-DD) for a leave span. */
export function enumerateLeaveDates(dateFrom: string, dateTo: string): string[] {
  const from = dateFrom.slice(0, 10);
  const to = dateTo.slice(0, 10);
  const days = countLeaveDays(from, to);
  if (days < 1) return [];
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00.000Z`);
  for (let i = 0; i < days; i += 1) {
    out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export function checklistProgress(items: Array<{ status: string }>): {
  done: number;
  total: number;
  percent: number;
} {
  const total = items.length;
  const done = items.filter((i) => i.status === "done" || i.status === "skipped").length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
