/**
 * Payroll Excel export matrices (August-workbook comparable, cleaner).
 */

import { HR_PAYROLL_CURRENCY, type HrPayrollPaymentMethod } from "@/lib/hr-payroll";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2026-08" → "August 2026" (August workbook sheet title). */
export function payrollMonthSheetLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTH_NAMES[(m ?? 1) - 1] ?? "Payroll";
  return `${name} ${y || ""}`.trim();
}

/** August sheet earned column: "Gross Salary-August2026". */
export function payrollEarnedHeader(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTH_NAMES[(m ?? 1) - 1] ?? "Period";
  return `Gross Salary-${name}${y || ""}`;
}

/** Column order of the August 2026 monthly sheet (blank code header named Employee Code). */
export function augustPayrollHeaders(month = "2026-08"): string[] {
  return [
    "Sr No.",
    "Employee Code",
    "Name Of Staff",
    "Position",
    "Workplace",
    "Basic Salary",
    "Allowances",
    "Gross Salary",
    "Working Days",
    "Working Hours",
    payrollEarnedHeader(month),
    "Bonus",
    "OT Hours (REG)",
    "OT Pay (REG)",
    "OT HRS(PUB.HOL)",
    "OT Pay (PUB.HOL)",
    "Extra Pay",
    "Advance Pay",
    "Deduction",
    "Net Payable",
    "WPS",
    "Cash",
    "Bank Transfer",
    "Cheq",
    "NOTES",
  ];
}

export const PAYROLL_FULL_EXPORT_HEADERS = augustPayrollHeaders("2026-08");

export type PayrollExportLineInput = {
  srNo?: number | null;
  employeeCode: string;
  employeeName: string;
  position?: string | null;
  workplace?: string | null;
  employmentCategory?: string | null;
  paymentMethod: HrPayrollPaymentMethod | string;
  snapshot?: Record<string, unknown> | null;
  netQar: number;
  importedNetQar?: number | null;
  systemNetQar?: number | null;
  varianceImportQar?: number | null;
  reviewStatus?: string | null;
  notes?: string | null;
};

function n(snap: Record<string, unknown>, key: string): number {
  return Number(snap[key]) || 0;
}

function money(v: number): string {
  return (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);
}

function numOr(snap: Record<string, unknown>, key: string, fallbackKey?: string): number {
  if (snap[key] != null && snap[key] !== "") return Number(snap[key]) || 0;
  if (fallbackKey) return Number(snap[fallbackKey]) || 0;
  return 0;
}

function payBuckets(pm: string, net: number, snap: Record<string, unknown>) {
  const wps = n(snap, "wps");
  const cash = n(snap, "cash");
  const bank = n(snap, "bankTransfer");
  const cheq = n(snap, "cheque");
  if (wps + cash + bank + cheq > 0) return { wps, cash, bank, cheq };
  return {
    wps: pm === "wps" ? net : 0,
    cash: pm === "cash" ? net : 0,
    bank: pm === "bank_transfer" ? net : 0,
    cheq: pm === "cheque" ? net : 0,
  };
}

/** Full payroll sheet in the August 2026 monthly column order. */
export function buildFullPayrollExportMatrix(
  lines: PayrollExportLineInput[],
  opts?: { month?: string | null },
): string[][] {
  const month = opts?.month ?? "2026-08";
  const header = augustPayrollHeaders(month);
  const rows = lines.map((line, idx) => {
    const snap = line.snapshot ?? {};
    const net = line.netQar;
    const pm = String(line.paymentMethod);
    const pay = payBuckets(pm, net, snap);
    const days = snap.workingDays != null ? n(snap, "workingDays") : 0;
    return [
      String(line.srNo ?? idx + 1),
      line.employeeCode,
      line.employeeName,
      line.position ?? String(snap.position ?? ""),
      line.workplace ?? String(snap.workplace ?? ""),
      money(numOr(snap, "contractBasicQar", "basicSalary")),
      money(numOr(snap, "contractAllowancesQar", "allowances")),
      money(numOr(snap, "contractGrossQar", "grossSalary")),
      money(days),
      money(n(snap, "workingHours")),
      money(n(snap, "earnedGross")),
      money(n(snap, "bonus")),
      money(n(snap, "otHoursReg")),
      money(n(snap, "otPayReg")),
      money(n(snap, "otHoursPh")),
      money(n(snap, "otPayPh")),
      money(n(snap, "extraPay")),
      money(n(snap, "advancePay")),
      money(n(snap, "deduction")),
      money(net),
      money(pay.wps),
      money(pay.cash),
      money(pay.bank),
      money(pay.cheq),
      line.notes ?? String(snap.notes ?? ""),
    ];
  });
  return [header, ...rows];
}

/** Project Staff sheet from the August workbook (different columns from the monthly sheet). */
export function buildProjectStaffExportMatrix(
  lines: PayrollExportLineInput[],
  opts?: { month?: string | null },
): string[][] {
  const month = opts?.month ?? "2026-08";
  const header = [
    "Sr No.",
    "Name Of Staff",
    "Position",
    "Workplace/Project",
    "Per Day",
    "Gross Salary",
    "Working Days",
    "Working Hours",
    payrollEarnedHeader(month),
    "Deductions",
    "Extra Pay",
    "Net Payable",
    "WPS",
    "Cash",
    "Bank Transfer",
    "Cheq",
    "Remarks",
  ];
  const rows = lines.map((line, idx) => {
    const snap = line.snapshot ?? {};
    const net = line.netQar;
    const pay = payBuckets(String(line.paymentMethod), net, snap);
    return [
      String(line.srNo ?? idx + 1),
      line.employeeName,
      line.position ?? String(snap.position ?? ""),
      line.workplace ?? String(snap.workplace ?? ""),
      money(n(snap, "perDayRate") || n(snap, "dayRateQar")),
      money(numOr(snap, "contractGrossQar", "grossSalary")),
      money(n(snap, "workingDays")),
      money(n(snap, "workingHours")),
      money(n(snap, "earnedGross")),
      money(n(snap, "deduction")),
      money(n(snap, "extraPay")),
      money(net),
      money(pay.wps),
      money(pay.cash),
      money(pay.bank),
      money(pay.cheq),
      line.notes ?? String(snap.notes ?? ""),
    ];
  });
  return [header, ...rows];
}

export function buildPayrollSummaryMatrix(kpis: {
  employees: number;
  basic: number;
  allowances: number;
  gross: number;
  regularOt: number;
  phOt: number;
  bonus: number;
  extra: number;
  deductions: number;
  advances: number;
  net: number;
  wps: number;
  cash: number;
  bankTransfer: number;
  cheque: number;
  month: string;
}): string[][] {
  return [
    ["Metric", "Amount QAR"],
    ["Period", kpis.month],
    ["Currency", HR_PAYROLL_CURRENCY],
    ["Employees", String(kpis.employees)],
    ["Basic", money(kpis.basic)],
    ["Allowances", money(kpis.allowances)],
    ["Gross", money(kpis.gross)],
    ["Regular OT", money(kpis.regularOt)],
    ["Public Holiday OT", money(kpis.phOt)],
    ["Bonus", money(kpis.bonus)],
    ["Extra", money(kpis.extra)],
    ["Deductions", money(kpis.deductions)],
    ["Advances", money(kpis.advances)],
    ["Net Payable", money(kpis.net)],
    ["WPS", money(kpis.wps)],
    ["Cash", money(kpis.cash)],
    ["Bank Transfer", money(kpis.bankTransfer)],
    ["Cheque", money(kpis.cheque)],
  ];
}

export function buildReconciliationExportMatrix(
  rows: Array<{
    employeeName: string;
    excelNetPay: number;
    systemNetPay: number;
    difference: number;
    status: string;
  }>,
): string[][] {
  return [
    ["Employee", "Excel Net Pay", "System Net Pay", "Difference", "Status"],
    ...rows.map((r) => [
      r.employeeName,
      money(r.excelNetPay),
      money(r.systemNetPay),
      money(r.difference),
      r.status,
    ]),
  ];
}
