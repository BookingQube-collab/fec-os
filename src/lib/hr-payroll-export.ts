/**
 * Payroll Excel export matrices (August-workbook comparable, cleaner).
 */

import { HR_PAYROLL_CURRENCY, type HrPayrollPaymentMethod } from "@/lib/hr-payroll";

export const PAYROLL_FULL_EXPORT_HEADERS = [
  "Sr No",
  "Employee Code",
  "Employee",
  "Position",
  "Workplace",
  "Employment Type",
  "Basic Salary",
  "Allowances",
  "Gross Salary",
  "Working Days",
  "Working Hours",
  "Earned Gross",
  "Bonus",
  "Regular OT Hours",
  "Regular OT Pay",
  "Public Holiday OT Hours",
  "Public Holiday OT Pay",
  "Extra Pay",
  "Advance Pay",
  "Deduction",
  "Net Payable",
  "WPS",
  "Cash",
  "Bank Transfer",
  "Cheque",
  "Payment Method",
  "Review Status",
  "Excel Net",
  "System Net",
  "Variance",
  "Notes",
] as const;

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

export function buildFullPayrollExportMatrix(lines: PayrollExportLineInput[]): string[][] {
  const header = [...PAYROLL_FULL_EXPORT_HEADERS];
  const rows = lines.map((line, idx) => {
    const snap = line.snapshot ?? {};
    const net = line.netQar;
    const pm = String(line.paymentMethod);
    const wps = pm === "wps" ? net : n(snap, "wps");
    const cash = pm === "cash" ? net : n(snap, "cash");
    const bank = pm === "bank_transfer" ? net : n(snap, "bankTransfer");
    const cheq = pm === "cheque" ? net : n(snap, "cheque");
    return [
      String(line.srNo ?? idx + 1),
      line.employeeCode,
      line.employeeName,
      line.position ?? String(snap.position ?? ""),
      line.workplace ?? String(snap.workplace ?? ""),
      line.employmentCategory ?? String(snap.category ?? ""),
      money(n(snap, "basicSalary")),
      money(n(snap, "allowances")),
      money(n(snap, "grossSalary")),
      money(n(snap, "workingDays")),
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
      money(wps),
      money(cash),
      money(bank),
      money(cheq),
      pm,
      line.reviewStatus ?? "",
      money(line.importedNetQar ?? n(snap, "netPayable")),
      money(line.systemNetQar ?? 0),
      money(line.varianceImportQar ?? 0),
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
