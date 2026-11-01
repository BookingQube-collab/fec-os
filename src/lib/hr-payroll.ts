/**
 * Payroll run rules (Phase 8). Pure — no Supabase.
 * FEC 28–27 cycle lives in attendance-hr/roster-period.ts; reuse monthBounds there.
 * WPS export columns are SIF-like for Finance validation — not bank-certified.
 */

import { monthBounds } from "@/lib/attendance-hr/roster-period";
import { canMarkPayrollPosted } from "@/lib/hr-ot";
import { HR_POLICY_DEFAULTS } from "@/lib/hr-policy";
import {
  partitionPaidDatesByPreviousWindow,
  resolvePreviousCompensationWindow,
  type PreviousCompensationWindow,
  type SalaryHistoryRateRow as PreviousRateHistoryRow,
} from "@/lib/salary-previous-rate";

export const HR_PAYROLL_STATUSES = [
  "draft",
  "attendance_validation",
  "hr_review",
  "finance_review",
  "gm_approved",
  "processed",
  "paid",
  "locked",
] as const;
export type HrPayrollStatus = (typeof HR_PAYROLL_STATUSES)[number];

export const HR_PAYROLL_PAYMENT_METHODS = ["wps", "cheque", "bank_transfer", "cash"] as const;
export type HrPayrollPaymentMethod = (typeof HR_PAYROLL_PAYMENT_METHODS)[number];

export const HR_PAYROLL_CURRENCY = "QAR" as const;

/** Forward workflow only (lock is separate). */
const STATUS_FLOW: HrPayrollStatus[] = [
  "draft",
  "attendance_validation",
  "hr_review",
  "finance_review",
  "gm_approved",
  "processed",
  "paid",
];

export function isPayrollLocked(status: HrPayrollStatus): boolean {
  return status === "locked";
}

export function assertPeriodEditable(status: HrPayrollStatus): void {
  if (isPayrollLocked(status)) {
    throw new Error("Locked payroll period cannot be edited without reopen approval.");
  }
}

export function canAdvancePayrollStatus(from: HrPayrollStatus, to: HrPayrollStatus): boolean {
  if (from === "locked" || to === "locked") return false;
  const fi = STATUS_FLOW.indexOf(from);
  const ti = STATUS_FLOW.indexOf(to);
  return fi >= 0 && ti === fi + 1;
}

export function assertAdvancePayrollStatus(from: HrPayrollStatus, to: HrPayrollStatus): void {
  if (!canAdvancePayrollStatus(from, to)) {
    throw new Error(`Payroll cannot move from ${from} to ${to}.`);
  }
}

export function canLockPayroll(status: HrPayrollStatus): boolean {
  return status === "paid" || status === "processed";
}

export function assertCanLockPayroll(status: HrPayrollStatus): void {
  if (!canLockPayroll(status)) {
    throw new Error("Lock requires processed or paid status.");
  }
}

/** Draft / early-review only — paid/locked runs must reopen (or stay immutable). */
const DELETABLE_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "attendance_validation",
  "hr_review",
]);

/** Accepts raw API/DB strings; unknown statuses are not deletable. */
export function canDeletePayrollPeriod(status: string): boolean {
  return DELETABLE_STATUSES.has(status);
}

export function assertCanDeletePayrollPeriod(status: string): void {
  if (status === "locked") {
    throw new Error("Locked payroll cannot be deleted — reopen it first, then delete from HR review.");
  }
  if (!canDeletePayrollPeriod(status)) {
    throw new Error(
      `Cannot delete payroll in ${status} — only draft, attendance validation, or HR review. Reopen locked periods first.`,
    );
  }
}

/** Default payment method from employment category + policy (overrides allowed per employee). */
export function resolvePaymentMethod(input: {
  override?: string | null;
  employmentCategory?: string | null;
  defaults?: Record<string, string>;
}): HrPayrollPaymentMethod {
  const override = (input.override ?? "").trim().toLowerCase();
  if ((HR_PAYROLL_PAYMENT_METHODS as readonly string[]).includes(override)) {
    return override as HrPayrollPaymentMethod;
  }
  const map =
    input.defaults ??
    (HR_POLICY_DEFAULTS.payroll.default_payment_by_category as Record<string, string>);
  const cat = (input.employmentCategory ?? "permanent").trim().toLowerCase();
  const fromCat = (map[cat] ?? map.permanent ?? "wps").toLowerCase();
  if ((HR_PAYROLL_PAYMENT_METHODS as readonly string[]).includes(fromCat)) {
    return fromCat as HrPayrollPaymentMethod;
  }
  return "wps";
}

/** AT#11: bucket staff by payment method. */
export function partitionByPaymentMethod<T extends { paymentMethod: HrPayrollPaymentMethod }>(
  lines: T[],
): Record<HrPayrollPaymentMethod, T[]> {
  const out: Record<HrPayrollPaymentMethod, T[]> = {
    wps: [],
    cheque: [],
    bank_transfer: [],
    cash: [],
  };
  for (const line of lines) out[line.paymentMethod].push(line);
  return out;
}

export function fecPeriodForMonth(month: string): { month: string; dateFrom: string; dateTo: string } {
  const m = month.slice(0, 7);
  return { month: m, ...monthBounds(m) };
}

/**
 * Proration factor from hire/exit vs period (calendar days in FEC window).
 * Unpaid leave days reduce further (unit-testable AT#12).
 */
/**
 * Hire/exit proration only. Unpaid leave is a separate deduction (AT#12) — do not
 * fold it into the factor or basic is cut twice.
 */
export function computeProrationFactor(input: {
  dateFrom: string;
  dateTo: string;
  hireDate?: string | null;
  exitDate?: string | null;
  unpaidLeaveDays?: number;
  daysPerMonth?: number;
}): {
  factor: number;
  activeDays: number;
  periodDays: number;
  unpaidLeaveDays: number;
  /** Inclusive hire/exit clip of the period. Worked-day pay counts only inside this window. */
  activeFrom: string;
  activeTo: string;
} {
  const from = input.dateFrom.slice(0, 10);
  const to = input.dateTo.slice(0, 10);
  const periodDays = Math.max(1, daysBetweenInclusive(from, to));
  let activeFrom = from;
  let activeTo = to;
  if (input.hireDate && input.hireDate.slice(0, 10) > activeFrom) {
    activeFrom = input.hireDate.slice(0, 10);
  }
  if (input.exitDate && input.exitDate.slice(0, 10) < activeTo) {
    activeTo = input.exitDate.slice(0, 10);
  }
  const activeDays = activeFrom > activeTo ? 0 : daysBetweenInclusive(activeFrom, activeTo);
  const unpaid = Math.max(0, Number(input.unpaidLeaveDays) || 0);
  const denom = Math.max(1, input.daysPerMonth ?? 30);
  const base = Math.min(periodDays, denom);
  const factor = Math.min(1, activeDays / base);
  return { factor, activeDays, periodDays, unpaidLeaveDays: unpaid, activeFrom, activeTo };
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

export type PayrollMoneyLine = {
  code: string;
  label: string;
  amountQar: number;
  meta?: Record<string, unknown>;
};

export type ComputedPayrollLine = {
  paymentMethod: HrPayrollPaymentMethod;
  wpsEligible: boolean;
  earnings: PayrollMoneyLine[];
  deductions: PayrollMoneyLine[];
  grossQar: number;
  netQar: number;
  prorationFactor: number;
  varianceVsPrev: number | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** True when compensation is day-rate (no positive monthly). Reuses staff_compensation.daily_rate_qar. */
export function isDailyRateCompensation(input: {
  monthlySalaryQar?: number | null;
  dailyRateQar?: number | null;
}): boolean {
  const daily = Number(input.dailyRateQar);
  if (!Number.isFinite(daily) || daily <= 0) return false;
  const monthly = Number(input.monthlySalaryQar);
  return !(Number.isFinite(monthly) && monthly > 0);
}

function positiveRate(v: number | null | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isJokerEmployment(employmentType?: string | null, employmentCategory?: string | null): boolean {
  const cat = String(employmentCategory ?? employmentType ?? "")
    .trim()
    .toLowerCase();
  return cat === "joker";
}

/**
 * Resolve whether this staff line is paid day_rate × present days, and which rate to use.
 * Jokers are always day-rate workers; rate prefers daily_rate_qar, then monthly_salary_qar
 * when HR filed the per-day amount in the monthly field.
 */
export function resolveDailyRatePayroll(input: {
  employmentType?: string | null;
  employmentCategory?: string | null;
  monthlySalaryQar?: number | null;
  dailyRateQar?: number | null;
}): { dailyPay: boolean; dayRateQar: number | null } {
  const daily = positiveRate(input.dailyRateQar);
  const monthly = positiveRate(input.monthlySalaryQar);
  if (isJokerEmployment(input.employmentType, input.employmentCategory)) {
    // ponytail: joker pay-basis UI defaulted to monthly, so many day rates live in monthly_salary_qar.
    // Ceiling: a true joker monthly salary (rare) is indistinguishable — use daily_rate_qar going forward.
    return { dailyPay: Boolean(daily ?? monthly), dayRateQar: daily ?? monthly };
  }
  if (isDailyRateCompensation(input)) {
    return { dailyPay: true, dayRateQar: daily };
  }
  return { dailyPay: false, dayRateQar: daily };
}

/** Day rate × attendance-listing worked days. */
export function computeDailyRateBasicQar(dayRateQar: number, presentDays: number): number {
  return round2(Math.max(0, Number(dayRateQar) || 0) * Math.max(0, Number(presentDays) || 0));
}

export type SalaryRateHistoryRow = {
  effectiveOn: string;
  dailyRateQar?: number | null;
  monthlyTotalQar?: number | null;
  createdAt?: string | null;
};

/**
 * Pick the day rate in effect on a work date from salary history (latest effective_on ≤ date).
 * Falls back to live compensation when no history row covers the date.
 */
export function resolveDayRateOnDate(input: {
  workDate: string;
  history: SalaryRateHistoryRow[];
  employmentType?: string | null;
  employmentCategory?: string | null;
  fallbackDailyRateQar?: number | null;
  fallbackMonthlySalaryQar?: number | null;
}): number | null {
  const ymd = String(input.workDate ?? "").slice(0, 10);
  let best: SalaryRateHistoryRow | null = null;
  for (const row of input.history ?? []) {
    const on = String(row.effectiveOn ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on > ymd) continue;
    if (!best) {
      best = row;
      continue;
    }
    const bestOn = String(best.effectiveOn).slice(0, 10);
    if (on > bestOn) {
      best = row;
      continue;
    }
    if (on === bestOn) {
      const a = String(row.createdAt ?? "");
      const b = String(best.createdAt ?? "");
      if (a > b) best = row;
    }
  }
  return resolveDailyRatePayroll({
    employmentType: input.employmentType,
    employmentCategory: input.employmentCategory,
    dailyRateQar: best?.dailyRateQar ?? input.fallbackDailyRateQar,
    monthlySalaryQar: best?.monthlyTotalQar ?? input.fallbackMonthlySalaryQar,
  }).dayRateQar;
}

/** Sum day-rate pay across worked dates, using the history rate in effect each day. */
export function computeDailyRateBasicFromHistory(input: {
  workedDates: string[];
  history: SalaryRateHistoryRow[];
  employmentType?: string | null;
  employmentCategory?: string | null;
  fallbackDailyRateQar?: number | null;
  fallbackMonthlySalaryQar?: number | null;
}): { basicQar: number; primaryDayRateQar: number | null; distinctRates: number } {
  const rates = new Map<number, number>();
  let basic = 0;
  for (const workDate of input.workedDates) {
    const rate = resolveDayRateOnDate({
      workDate,
      history: input.history,
      employmentType: input.employmentType,
      employmentCategory: input.employmentCategory,
      fallbackDailyRateQar: input.fallbackDailyRateQar,
      fallbackMonthlySalaryQar: input.fallbackMonthlySalaryQar,
    });
    if (rate == null || rate <= 0) continue;
    basic += rate;
    rates.set(rate, (rates.get(rate) ?? 0) + 1);
  }
  let primaryDayRateQar: number | null = null;
  let primaryDays = -1;
  for (const [rate, days] of rates) {
    if (days > primaryDays) {
      primaryDays = days;
      primaryDayRateQar = rate;
    }
  }
  return {
    basicQar: round2(basic),
    primaryDayRateQar,
    distinctRates: rates.size,
  };
}

/**
 * Earned basic from the payroll paid-day count (worked + paid week off / annual leave / …).
 * Joker / day-rate: stored day rate × paid days (monthly_salary_qar is the legacy day rate).
 * Monthly (permanent / secondment): contract ÷ calendar days in the payroll window × paid days.
 * A fixed ÷30 rate pays the full contract at 30 paid days even when the window is longer
 * (FEC 28–27 is 31 days). Do not also deduct absences — unpaid / absent days are already excluded.
 */
export function resolveEarnedBasicQar(input: {
  dailyPay: boolean;
  contractBasicQar: number;
  dailyRateQar: number | null;
  workedDays: number;
  /** Inclusive calendar days in the payroll window. Monthly divisor. Defaults to 30 only when omitted. */
  periodDays?: number;
}): number {
  if (input.dailyPay) {
    return computeDailyRateBasicQar(Number(input.dailyRateQar) || 0, input.workedDays);
  }
  const periodDays = Math.max(1, Math.round(Number(input.periodDays) || 0) || 30);
  const rate = (Number(input.contractBasicQar) || 0) / periodDays;
  return computeDailyRateBasicQar(rate, input.workedDays);
}

function previousWindowMatchesPayKind(
  dailyPay: boolean,
  window: PreviousCompensationWindow | null | undefined,
): window is PreviousCompensationWindow {
  if (!window) return false;
  return dailyPay ? window.kind === "daily" : window.kind === "monthly";
}

/**
 * Earned basic across paid dates, applying previous-rate window days at the previous
 * amount and all other paid days at the current day rate / monthly package.
 * A month that straddles From/To must split — not pick one rate for the whole period.
 */
export function resolveEarnedBasicWithPreviousWindow(input: {
  dailyPay: boolean;
  /** Current monthly package (permanent / secondment). Ignored for day-rate. */
  contractBasicQar: number;
  /** Current day rate. Ignored for monthly. */
  dailyRateQar: number | null;
  paidDates: readonly string[];
  /** Inclusive calendar days in the payroll window. Monthly divisor. */
  periodDays: number;
  previousWindow?: PreviousCompensationWindow | null;
}): {
  earnedBasicQar: number;
  previousDays: number;
  currentDays: number;
  usedPreviousWindow: boolean;
} {
  const paidDates = (input.paidDates ?? []).map((d) => String(d ?? "").slice(0, 10));
  const periodDays = Math.max(1, Math.round(Number(input.periodDays) || 0) || 30);
  const window = previousWindowMatchesPayKind(input.dailyPay, input.previousWindow)
    ? input.previousWindow
    : null;

  if (!window) {
    const earnedBasicQar = resolveEarnedBasicQar({
      dailyPay: input.dailyPay,
      contractBasicQar: input.contractBasicQar,
      dailyRateQar: input.dailyRateQar,
      workedDays: paidDates.length,
      periodDays,
    });
    return {
      earnedBasicQar,
      previousDays: 0,
      currentDays: paidDates.length,
      usedPreviousWindow: false,
    };
  }

  const { previousDates, currentDates } = partitionPaidDatesByPreviousWindow(paidDates, window);
  if (input.dailyPay) {
    const previousPart = computeDailyRateBasicQar(window.amountQar, previousDates.length);
    const currentPart = computeDailyRateBasicQar(Number(input.dailyRateQar) || 0, currentDates.length);
    return {
      earnedBasicQar: round2(previousPart + currentPart),
      previousDays: previousDates.length,
      currentDays: currentDates.length,
      usedPreviousWindow: previousDates.length > 0,
    };
  }

  const previousDaily = window.amountQar / periodDays;
  const currentDaily = (Number(input.contractBasicQar) || 0) / periodDays;
  const previousPart = computeDailyRateBasicQar(previousDaily, previousDates.length);
  const currentPart = computeDailyRateBasicQar(currentDaily, currentDates.length);
  return {
    earnedBasicQar: round2(previousPart + currentPart),
    previousDays: previousDates.length,
    currentDays: currentDates.length,
    usedPreviousWindow: previousDates.length > 0,
  };
}

/** Map salary-history DB/API rows into the previous-rate resolver shape. */
export function toPreviousRateHistoryRows(
  rows: readonly {
    id?: string | null;
    effective_on?: string | null;
    effectiveOn?: string | null;
    daily_rate_qar?: number | null;
    dailyRateQar?: number | null;
    monthly_total_qar?: number | null;
    monthlyTotalQar?: number | null;
    basic_qar?: number | null;
    basicQar?: number | null;
    reason?: string | null;
    created_at?: string | null;
    createdAt?: string | null;
  }[],
): PreviousRateHistoryRow[] {
  return (rows ?? []).map((row) => ({
    id: row.id != null ? String(row.id) : null,
    effectiveOn: String(row.effectiveOn ?? row.effective_on ?? "").slice(0, 10),
    dailyRateQar:
      row.dailyRateQar != null
        ? Number(row.dailyRateQar)
        : row.daily_rate_qar != null
          ? Number(row.daily_rate_qar)
          : null,
    monthlyTotalQar:
      row.monthlyTotalQar != null
        ? Number(row.monthlyTotalQar)
        : row.monthly_total_qar != null
          ? Number(row.monthly_total_qar)
          : null,
    basicQar:
      row.basicQar != null
        ? Number(row.basicQar)
        : row.basic_qar != null
          ? Number(row.basic_qar)
          : null,
    reason: row.reason != null ? String(row.reason) : null,
    createdAt:
      row.createdAt != null
        ? String(row.createdAt)
        : row.created_at != null
          ? String(row.created_at)
          : null,
  }));
}

export function previousCompensationWindowFromHistory(
  history: readonly PreviousRateHistoryRow[],
): PreviousCompensationWindow | null {
  return resolvePreviousCompensationWindow(history);
}

export type PayrollPayPreviewSource = "generated" | "estimate" | "missing";

/**
 * Readiness-list pay preview using the same basic/allowance (+ submitted OT) rules as
 * Generate lines. When paidDates + previousWindow are provided, days inside [from, to]
 * use previous amount. otQar should already be computed from submitted pipeline claims
 * (Ops / F&B / Cafe amount_qar via the OT formula).
 */
export function estimatePayrollReadinessPay(input: {
  employmentType?: string | null;
  employmentCategory?: string | null;
  monthlySalaryQar?: number | null;
  dailyRateQar?: number | null;
  /** Prefer salary-history basic when present (same as Generate). */
  contractBasicQar?: number | null;
  allowancesQar?: number | null;
  paidDays: number;
  periodDays: number;
  /** Preferred: actual paid entitlement dates so previous-rate windows can straddle. */
  paidDates?: readonly string[] | null;
  previousWindow?: PreviousCompensationWindow | null;
  /** Submitted (visible) OT claim amounts already computed with the OT formula. */
  otQar?: number | null;
}): {
  dailyPay: boolean;
  missingCompensation: boolean;
  earnedBasicQar: number;
  allowancesQar: number;
  otQar: number;
  payQar: number;
  paySource: Extract<PayrollPayPreviewSource, "estimate" | "missing">;
  previousDays: number;
  currentDays: number;
  usedPreviousWindow: boolean;
} {
  const monthlyStored = positiveRate(input.monthlySalaryQar);
  const dailyStored = positiveRate(input.dailyRateQar);
  const { dailyPay, dayRateQar } = resolveDailyRatePayroll({
    employmentType: input.employmentType,
    employmentCategory: input.employmentCategory,
    monthlySalaryQar: monthlyStored,
    dailyRateQar: dailyStored,
  });
  const basicRaw = Number(input.contractBasicQar);
  const basic =
    Number.isFinite(basicRaw) && basicRaw > 0
      ? basicRaw
      : monthlyStored != null
        ? monthlyStored
        : 0;
  const allowances = Math.max(0, Number(input.allowancesQar) || 0);
  const paidDays = Math.max(0, Number(input.paidDays) || 0);
  const periodDays = Math.max(1, Math.round(Number(input.periodDays) || 0) || 30);
  const paidDates =
    input.paidDates != null && input.paidDates.length > 0
      ? input.paidDates.map((d) => String(d ?? "").slice(0, 10))
      : null;
  const hasComp = dailyPay
    ? dayRateQar != null && dayRateQar > 0
    : basic > 0;
  const otQar = round2(Math.max(0, Number(input.otQar) || 0));
  if (!hasComp) {
    return {
      dailyPay,
      missingCompensation: true,
      earnedBasicQar: 0,
      allowancesQar: 0,
      otQar: 0,
      payQar: 0,
      paySource: "missing",
      previousDays: 0,
      currentDays: 0,
      usedPreviousWindow: false,
    };
  }
  const split = paidDates
    ? resolveEarnedBasicWithPreviousWindow({
        dailyPay,
        contractBasicQar: basic,
        dailyRateQar: dayRateQar,
        paidDates,
        periodDays,
        previousWindow: input.previousWindow,
      })
    : {
        earnedBasicQar: resolveEarnedBasicQar({
          dailyPay,
          contractBasicQar: basic,
          dailyRateQar: dayRateQar,
          workedDays: paidDays,
          periodDays,
        }),
        previousDays: 0,
        currentDays: paidDays,
        usedPreviousWindow: false,
      };
  const earnedBasicQar = split.earnedBasicQar;
  const allowanceRatio = dailyPay || !(basic > 0) ? 0 : earnedBasicQar / basic;
  const allowancesQar = round2(allowances * allowanceRatio);
  return {
    dailyPay,
    missingCompensation: false,
    earnedBasicQar,
    allowancesQar,
    otQar,
    payQar: round2(earnedBasicQar + allowancesQar + otQar),
    paySource: "estimate",
    previousDays: split.previousDays,
    currentDays: split.currentDays,
    usedPreviousWindow: split.usedPreviousWindow,
  };
}

/**
 * AT#12 unpaid days for monthly staff.
 * Absences always deduct. Leave-request unpaid and attendance unpaid_leave often
 * describe the same days (leave sync) — take max so we do not double-cut.
 */
export function mergeUnpaidDaysForPayroll(input: {
  leaveUnpaidDays: number;
  attendanceAbsentDays: number;
  attendanceUnpaidLeaveDays?: number;
}): number {
  const leave = Math.max(0, Number(input.leaveUnpaidDays) || 0);
  const absent = Math.max(0, Number(input.attendanceAbsentDays) || 0);
  const attUnpaid = Math.max(0, Number(input.attendanceUnpaidLeaveDays) || 0);
  return absent + Math.max(leave, attUnpaid);
}

function sumLines(lines: PayrollMoneyLine[]): number {
  return round2(lines.reduce((s, l) => s + (Number(l.amountQar) || 0), 0));
}

/**
 * Build earnings/deductions and net. OT must already be filtered to consumable claims (AT#4).
 * Unpaid leave / absence days reduce net via deductions (AT#12).
 */
export function computePayrollLineAmounts(input: {
  basicQar: number;
  allowancesQar?: number;
  otQar?: number;
  commissionQar?: number;
  bonusQar?: number;
  airTicketAllowanceQar?: number;
  leaveEncashmentQar?: number;
  otherEarningsQar?: number;
  loanAdvanceQar?: number;
  unpaidLeaveDays?: number;
  attendanceDeductionQar?: number;
  noticeRecoveryQar?: number;
  otherDeductionsQar?: number;
  dailyRateQar?: number | null;
  proration: { factor: number; unpaidLeaveDays: number };
  paymentMethod: HrPayrollPaymentMethod;
  previousNetQar?: number | null;
}): ComputedPayrollLine {
  const factor = Math.max(0, Math.min(1, input.proration.factor));
  const basic = round2((Number(input.basicQar) || 0) * factor);
  const allowances = round2((Number(input.allowancesQar) || 0) * factor);
  const earnings: PayrollMoneyLine[] = [
    { code: "basic", label: "Basic", amountQar: basic },
    { code: "allowances", label: "Allowances", amountQar: allowances },
  ];
  const ot = round2(Number(input.otQar) || 0);
  if (ot) earnings.push({ code: "ot", label: "Approved OT", amountQar: ot });
  const commission = round2(Number(input.commissionQar) || 0);
  if (commission) earnings.push({ code: "commission", label: "Commission", amountQar: commission });
  const bonus = round2(Number(input.bonusQar) || 0);
  if (bonus) earnings.push({ code: "bonus", label: "Bonus", amountQar: bonus });
  const air = round2(Number(input.airTicketAllowanceQar) || 0);
  if (air) earnings.push({ code: "air_ticket", label: "Air-ticket allowance", amountQar: air });
  const encash = round2(Number(input.leaveEncashmentQar) || 0);
  if (encash) earnings.push({ code: "leave_encashment", label: "Leave encashment", amountQar: encash });
  const otherE = round2(Number(input.otherEarningsQar) || 0);
  if (otherE) earnings.push({ code: "other", label: "Other earnings", amountQar: otherE });

  const deductions: PayrollMoneyLine[] = [];
  const unpaidDays = Math.max(0, Number(input.unpaidLeaveDays ?? input.proration.unpaidLeaveDays) || 0);
  const daily =
    input.dailyRateQar != null && Number.isFinite(input.dailyRateQar)
      ? Number(input.dailyRateQar)
      : (Number(input.basicQar) || 0) / 30;
  const unpaidDeduction = round2(unpaidDays * daily);
  if (unpaidDeduction > 0) {
    deductions.push({
      code: "unpaid_leave",
      label: "Unpaid leave",
      amountQar: unpaidDeduction,
      meta: { days: unpaidDays, dailyRateQar: round2(daily) },
    });
  }
  const att = round2(Number(input.attendanceDeductionQar) || 0);
  if (att) deductions.push({ code: "attendance", label: "Attendance deduction", amountQar: att });
  const loan = round2(Number(input.loanAdvanceQar) || 0);
  if (loan) deductions.push({ code: "loan_advance", label: "Loan / advance", amountQar: loan });
  const notice = round2(Number(input.noticeRecoveryQar) || 0);
  if (notice) deductions.push({ code: "notice_recovery", label: "Notice recovery", amountQar: notice });
  const otherD = round2(Number(input.otherDeductionsQar) || 0);
  if (otherD) deductions.push({ code: "other", label: "Other deductions", amountQar: otherD });

  const grossQar = sumLines(earnings);
  const dedTotal = sumLines(deductions);
  const netQar = round2(Math.max(0, grossQar - dedTotal));
  const varianceVsPrev =
    input.previousNetQar == null || !Number.isFinite(Number(input.previousNetQar))
      ? null
      : round2(netQar - Number(input.previousNetQar));

  return {
    paymentMethod: input.paymentMethod,
    wpsEligible: input.paymentMethod === "wps",
    earnings,
    deductions,
    grossQar,
    netQar,
    prorationFactor: factor,
    varianceVsPrev,
  };
}

/** AT#20: locked line amounts are a snapshot — policy changes must not rewrite them. */
export function lockedLineResistsPolicyChange(
  locked: { grossQar: number; netQar: number; earnings: PayrollMoneyLine[]; deductions: PayrollMoneyLine[] },
  _newPolicyBasicQar: number,
): { grossQar: number; netQar: number } {
  // Intentional: return stored snapshot only
  void _newPolicyBasicQar;
  return { grossQar: locked.grossQar, netQar: locked.netQar };
}

/**
 * Mark OT as payroll_posted only when claim is gm_approved (AT#4; once).
 * Pay figures may still include earlier submitted pipeline amounts — see
 * {@link filterPayableOtClaims}.
 */
export function filterConsumableOtClaims<T extends { status: string; amountQar?: number; amount_qar?: number }>(
  claims: T[],
): T[] {
  return claims.filter((c) => canMarkPayrollPosted(c.status as "gm_approved"));
}

export function sumOtAmounts(
  claims: Array<{ amountQar?: number; amount_qar?: number }>,
): number {
  return round2(
    claims.reduce((s, c) => s + (Number(c.amountQar ?? c.amount_qar) || 0), 0),
  );
}

/**
 * Pipeline OT that should appear on payroll readiness / period review / Generate pay.
 * Includes Ops supervisor + F&B Cafe submissions from `submitted` onward.
 * amount_qar on each claim is already computed with the OT formula at submit time.
 * Consuming to payroll_posted still requires gm_approved (AT#4).
 */
export const PAYROLL_VISIBLE_OT_STATUSES = [
  "submitted",
  "manager_verified",
  "ops_approved",
  "hr_approved",
  "gm_approved",
  "payroll_posted",
] as const;

/** OT claims whose stored amount_qar should add into Generate / readiness Pay. */
export function filterPayableOtClaims<T extends { status: string }>(claims: T[]): T[] {
  return filterVisibleOtClaims(claims);
}

/** Sum payable (submitted+) OT amounts by staff for readiness Pay / Generate lines. */
export function sumVisibleOtAmountsByStaff(
  claims: Array<{
    staff_id?: string | null;
    staffId?: string | null;
    status: string;
    amountQar?: number | null;
    amount_qar?: number | null;
  }>,
): Map<string, number> {
  const byStaff = new Map<string, number>();
  for (const claim of filterPayableOtClaims(claims)) {
    const staffId = String(claim.staffId ?? claim.staff_id ?? "");
    if (!staffId) continue;
    const amount = Number(claim.amountQar ?? claim.amount_qar) || 0;
    if (amount <= 0) continue;
    byStaff.set(staffId, round2((byStaff.get(staffId) ?? 0) + amount));
  }
  return byStaff;
}

export function isPayrollVisibleOtStatus(status: string): boolean {
  return (PAYROLL_VISIBLE_OT_STATUSES as readonly string[]).includes(status);
}

/** Prefer approved minutes once stamped; else claimed (submitted) minutes. */
export function otClaimMinutes(claim: {
  approved_minutes?: number | null;
  approvedMinutes?: number | null;
  claimed_minutes?: number | null;
  claimedMinutes?: number | null;
}): number {
  const approved = claim.approvedMinutes ?? claim.approved_minutes;
  if (approved != null && Number.isFinite(Number(approved)) && Number(approved) > 0) {
    return Math.max(0, Number(approved));
  }
  return Math.max(0, Number(claim.claimedMinutes ?? claim.claimed_minutes ?? 0) || 0);
}

export function filterVisibleOtClaims<T extends { status: string }>(claims: T[]): T[] {
  return claims.filter((c) => isPayrollVisibleOtStatus(String(c.status ?? "")));
}

/** Sum OT minutes by staff for payroll readiness (Ops / F&B / Cafe submitted claims). */
export function sumVisibleOtMinutesByStaff(
  claims: Array<{
    staff_id?: string | null;
    staffId?: string | null;
    status: string;
    approved_minutes?: number | null;
    approvedMinutes?: number | null;
    claimed_minutes?: number | null;
    claimedMinutes?: number | null;
  }>,
): Map<string, number> {
  const byStaff = new Map<string, number>();
  for (const claim of filterVisibleOtClaims(claims)) {
    const staffId = String(claim.staffId ?? claim.staff_id ?? "");
    if (!staffId) continue;
    const mins = otClaimMinutes(claim);
    if (mins <= 0) continue;
    byStaff.set(staffId, (byStaff.get(staffId) ?? 0) + mins);
  }
  return byStaff;
}

export function minutesToOtHours(minutes: number): number {
  return Math.round((Math.max(0, Number(minutes) || 0) / 60) * 100) / 100;
}

/** Best-effort SIF-like WPS columns — Finance validation only, not bank certification. */
export const WPS_EXPORT_COLUMNS = [
  "Employee ID",
  "Employee Name",
  "QID",
  "IBAN",
  "Bank Name",
  "WPS Employee ID",
  "Salary Month",
  "Fixed Income",
  "Variable Income",
  "Deductions",
  "Net Salary",
  "Currency",
  "Payment Method",
] as const;

export const CHEQUE_EXPORT_COLUMNS = [
  "Employee Code",
  "Employee Name",
  "Net Salary QAR",
  "Salary Month",
  "Cheque Reference",
] as const;

export const BANK_TRANSFER_EXPORT_COLUMNS = [
  "Employee Code",
  "Employee Name",
  "IBAN",
  "Bank Name",
  "Net Salary QAR",
  "Salary Month",
  "Currency",
] as const;

export type PayrollExportRow = {
  employeeCode: string;
  employeeName: string;
  qid?: string | null;
  iban?: string | null;
  bankName?: string | null;
  wpsEmployeeId?: string | null;
  month: string;
  fixedIncome: number;
  variableIncome: number;
  deductions: number;
  netQar: number;
  paymentMethod: HrPayrollPaymentMethod;
};

export function buildWpsExportRows(rows: PayrollExportRow[]): string[][] {
  return [
    [...WPS_EXPORT_COLUMNS],
    ...rows.map((r) => [
      r.employeeCode,
      r.employeeName,
      r.qid ?? "",
      r.iban ?? "",
      r.bankName ?? "",
      r.wpsEmployeeId ?? "",
      r.month,
      String(r.fixedIncome),
      String(r.variableIncome),
      String(r.deductions),
      String(r.netQar),
      HR_PAYROLL_CURRENCY,
      r.paymentMethod,
    ]),
  ];
}

export function buildChequeExportRows(rows: PayrollExportRow[]): string[][] {
  return [
    [...CHEQUE_EXPORT_COLUMNS],
    ...rows.map((r) => [r.employeeCode, r.employeeName, String(r.netQar), r.month, ""]),
  ];
}

export function buildBankTransferExportRows(rows: PayrollExportRow[]): string[][] {
  return [
    [...BANK_TRANSFER_EXPORT_COLUMNS],
    ...rows.map((r) => [
      r.employeeCode,
      r.employeeName,
      r.iban ?? "",
      r.bankName ?? "",
      String(r.netQar),
      r.month,
      HR_PAYROLL_CURRENCY,
    ]),
  ];
}

export function earningsToFixedVariable(earnings: PayrollMoneyLine[]): {
  fixedIncome: number;
  variableIncome: number;
} {
  let fixed = 0;
  let variable = 0;
  for (const e of earnings) {
    if (e.code === "basic" || e.code === "allowances") fixed += e.amountQar;
    else variable += e.amountQar;
  }
  return { fixedIncome: round2(fixed), variableIncome: round2(variable) };
}

export function nextStatusAfter(from: HrPayrollStatus): HrPayrollStatus | null {
  const i = STATUS_FLOW.indexOf(from);
  if (i < 0 || i >= STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[i + 1]!;
}

export function statusLabel(status: HrPayrollStatus): string {
  return status.replace(/_/g, " ");
}

/** Typed phrase required by Administration → Remove all payroll. */
export const PAYROLL_RESET_CONFIRMATION = "REMOVE ALL PAYROLL";

export function assertPayrollResetConfirmation(value: string): void {
  if (value.trim() !== PAYROLL_RESET_CONFIRMATION) {
    throw new Error(`Type ${PAYROLL_RESET_CONFIRMATION} to confirm. This cannot be undone.`);
  }
}
