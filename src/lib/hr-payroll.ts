/**
 * Payroll run rules (Phase 8). Pure — no Supabase.
 * FEC 28–27 cycle lives in attendance-hr/roster-period.ts; reuse monthBounds there.
 * WPS export columns are SIF-like for Finance validation — not bank-certified.
 */

import { monthBounds } from "@/lib/attendance-hr/roster-period";
import { canMarkPayrollPosted } from "@/lib/hr-ot";
import { HR_POLICY_DEFAULTS } from "@/lib/hr-policy";

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
}): { factor: number; activeDays: number; periodDays: number; unpaidLeaveDays: number } {
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
  return { factor, activeDays, periodDays, unpaidLeaveDays: unpaid };
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

/** Joker / daily workers: day_rate × countable present (punch) days. */
export function computeDailyRateBasicQar(dayRateQar: number, presentDays: number): number {
  return round2(Math.max(0, Number(dayRateQar) || 0) * Math.max(0, Number(presentDays) || 0));
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

/** Consume OT only when claim is hr_approved (AT#4). */
export function filterConsumableOtClaims<T extends { status: string; amountQar?: number; amount_qar?: number }>(
  claims: T[],
): T[] {
  return claims.filter((c) => canMarkPayrollPosted(c.status as "hr_approved"));
}

export function sumOtAmounts(
  claims: Array<{ amountQar?: number; amount_qar?: number }>,
): number {
  return round2(
    claims.reduce((s, c) => s + (Number(c.amountQar ?? c.amount_qar) || 0), 0),
  );
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
