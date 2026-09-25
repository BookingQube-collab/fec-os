/**
 * Historical import reconciliation: Excel Net vs System Net vs Variance.
 */

import {
  computeExcelStyleNet,
  computeProjectStaffNet,
  type ParsedPayrollImportRow,
} from "@/lib/hr-payroll-import";
import type { PayrollMatchResult } from "@/lib/hr-payroll-match";
import { computePayrollLineAmounts } from "@/lib/hr-payroll";

export type ReconStatus = "matched" | "variance" | "unmatched" | "reviewed";

export type PayrollReconRow = {
  employeeName: string;
  employeeCode: string | null;
  staffId: string | null;
  matchRule: string;
  excelNetPay: number;
  systemNetPay: number;
  difference: number;
  status: ReconStatus;
  category: string;
  paymentMethod: string;
  warnings: string[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** System calc from imported components (does not change Excel historical figures). */
export function systemNetFromImportRow(row: ParsedPayrollImportRow): number {
  if (row.category === "project_staff") {
    return computeProjectStaffNet({
      perDayRate: row.perDayRate ?? 0,
      workingDays: row.workingDays,
      extraPay: row.extraPay,
      deduction: row.deduction,
    });
  }
  // Mirror Excel columns through existing engine pieces
  const computed = computePayrollLineAmounts({
    basicQar: row.earnedGross > 0 ? 0 : row.basicSalary,
    allowancesQar: row.earnedGross > 0 ? 0 : row.allowances,
    otQar: round2(row.otPayReg + row.otPayPh),
    bonusQar: row.bonus,
    otherEarningsQar: round2(row.extraPay + (row.earnedGross > 0 ? row.earnedGross : 0)),
    loanAdvanceQar: row.advancePay,
    otherDeductionsQar: row.deduction,
    proration: { factor: 1, unpaidLeaveDays: 0 },
    paymentMethod: row.paymentMethod === "cash" ? "cheque" : row.paymentMethod,
  });
  return computed.netQar;
}

export function reconcileImportRow(
  row: ParsedPayrollImportRow & { match: PayrollMatchResult },
  opts?: { toleranceQar?: number },
): PayrollReconRow {
  const tolerance = opts?.toleranceQar ?? 0.05;
  const excelNet =
    row.netPayable ||
    (row.category === "project_staff"
      ? computeProjectStaffNet({
          perDayRate: row.perDayRate ?? 0,
          workingDays: row.workingDays,
          extraPay: row.extraPay,
          deduction: row.deduction,
        })
      : computeExcelStyleNet(row));
  const systemNet = systemNetFromImportRow(row);
  const difference = round2(excelNet - systemNet);

  let status: ReconStatus = "matched";
  if (!row.match.staffId) status = "unmatched";
  else if (Math.abs(difference) > tolerance) status = "variance";

  return {
    employeeName: row.employeeName,
    employeeCode: row.employeeCode,
    staffId: row.match.staffId,
    matchRule: row.match.matchRule,
    excelNetPay: excelNet,
    systemNetPay: systemNet,
    difference,
    status,
    category: row.category,
    paymentMethod: row.paymentMethod,
    warnings: row.match.warnings,
  };
}

export function buildReconciliationReport(
  rows: Array<ParsedPayrollImportRow & { match: PayrollMatchResult }>,
  opts?: { toleranceQar?: number },
): {
  rows: PayrollReconRow[];
  summary: {
    total: number;
    matched: number;
    variance: number;
    unmatched: number;
    excelNetTotal: number;
    systemNetTotal: number;
    successfullyReconciled: boolean;
  };
} {
  const recon = rows.map((r) => reconcileImportRow(r, opts));
  const matched = recon.filter((r) => r.status === "matched").length;
  const variance = recon.filter((r) => r.status === "variance").length;
  const unmatched = recon.filter((r) => r.status === "unmatched").length;
  const excelNetTotal = round2(recon.reduce((s, r) => s + r.excelNetPay, 0));
  const systemNetTotal = round2(recon.reduce((s, r) => s + r.systemNetPay, 0));
  return {
    rows: recon,
    summary: {
      total: recon.length,
      matched,
      variance,
      unmatched,
      excelNetTotal,
      systemNetTotal,
      // "Successfully reconciled" only when no unexplained diffs remain
      successfullyReconciled: variance === 0 && unmatched === 0 && recon.length > 0,
    },
  };
}

export type PayrollKpiBundle = {
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
};

export function sumPayrollKpis(
  rows: Array<{
    snapshot?: Record<string, unknown> | null;
    imported_amounts?: Record<string, unknown> | null;
    net_qar?: number;
    payment_method?: string;
    earnings?: Array<{ code: string; amountQar: number }>;
    deductions?: Array<{ code: string; amountQar: number }>;
  }>,
): PayrollKpiBundle {
  const empty: PayrollKpiBundle = {
    employees: rows.length,
    basic: 0,
    allowances: 0,
    gross: 0,
    regularOt: 0,
    phOt: 0,
    bonus: 0,
    extra: 0,
    deductions: 0,
    advances: 0,
    net: 0,
    wps: 0,
    cash: 0,
    bankTransfer: 0,
    cheque: 0,
  };
  for (const r of rows) {
    const snap = (r.imported_amounts ?? r.snapshot ?? {}) as Record<string, unknown>;
    const n = (k: string) => Number(snap[k]) || 0;
    empty.basic += n("basicSalary") || n("basic");
    empty.allowances += n("allowances");
    empty.gross += n("grossSalary") || n("earnedGross") || Number(r.net_qar) || 0;
    empty.regularOt += n("otPayReg");
    empty.phOt += n("otPayPh");
    empty.bonus += n("bonus");
    empty.extra += n("extraPay");
    empty.deductions += n("deduction");
    empty.advances += n("advancePay");
    empty.net += Number(r.net_qar) || n("netPayable");
    const pm = String(r.payment_method ?? snap.paymentMethod ?? "");
    const netLine = Number(r.net_qar) || n("netPayable");
    if (pm === "wps") empty.wps += netLine;
    else if (pm === "cash") empty.cash += netLine;
    else if (pm === "bank_transfer") empty.bankTransfer += netLine;
    else if (pm === "cheque") empty.cheque += netLine;
  }
  for (const k of Object.keys(empty) as (keyof PayrollKpiBundle)[]) {
    if (k === "employees") continue;
    empty[k] = round2(empty[k] as number) as never;
  }
  return empty;
}

export type PayrollExceptionKind =
  | "missing_salary"
  | "excessive_ot"
  | "unapproved_ot"
  | "missing_bank_wps"
  | "negative_net"
  | "new_joiner"
  | "resigned"
  | "final_settlement"
  | "salary_diff_vs_prev"
  | "import_variance"
  | "unmatched_staff";

export type PayrollException = {
  kind: PayrollExceptionKind;
  staffId: string | null;
  employeeName: string;
  detail: string;
  severity: "info" | "warning" | "critical";
};

export function detectPayrollExceptions(input: {
  lines: Array<{
    staffId: string | null;
    staffName: string;
    netQar: number;
    varianceVsPrev: number | null;
    reviewStatus?: string | null;
    paymentMethod: string;
    snapshot?: Record<string, unknown> | null;
    notes?: string | null;
    wpsEligible?: boolean;
    hasIban?: boolean;
  }>;
  excessiveOtHours?: number;
}): PayrollException[] {
  const out: PayrollException[] = [];
  const otCap = input.excessiveOtHours ?? 40;
  for (const line of input.lines) {
    const snap = line.snapshot ?? {};
    const missingComp = snap.missingCompensation === true;
    const basic = Number(snap.basicSalary) || 0;
    const otH = (Number(snap.otHoursReg) || 0) + (Number(snap.otHoursPh) || 0);
    if (missingComp || (basic <= 0 && line.netQar <= 0 && snap.dayRateQar == null)) {
      out.push({
        kind: "missing_salary",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: "Missing salary / zero net",
        severity: "warning",
      });
    }
    if (otH > otCap) {
      out.push({
        kind: "excessive_ot",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: `${otH} OT hours exceeds ${otCap}h review threshold`,
        severity: "warning",
      });
    }
    if (line.paymentMethod === "wps" && line.hasIban === false) {
      out.push({
        kind: "missing_bank_wps",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: "WPS selected but IBAN missing",
        severity: "critical",
      });
    }
    if (line.netQar < 0) {
      out.push({
        kind: "negative_net",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: `Negative net ${line.netQar}`,
        severity: "critical",
      });
    }
    if (line.varianceVsPrev != null && Math.abs(line.varianceVsPrev) >= 500) {
      out.push({
        kind: "salary_diff_vs_prev",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: `Variance vs previous month: ${line.varianceVsPrev.toFixed(2)} QAR`,
        severity: "info",
      });
    }
    if (line.reviewStatus === "variance") {
      out.push({
        kind: "import_variance",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: "Excel vs system net variance needs review",
        severity: "warning",
      });
    }
    if (line.reviewStatus === "unmatched" || !line.staffId) {
      out.push({
        kind: "unmatched_staff",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: "Not linked to Employee Master",
        severity: "critical",
      });
    }
    const notes = (line.notes ?? "").toLowerCase();
    if (/terminat|final settlement|fs\b|resign/i.test(notes)) {
      out.push({
        kind: /final settlement|fs\b/i.test(notes) ? "final_settlement" : "resigned",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: line.notes ?? "Exit / settlement note",
        severity: "warning",
      });
    }
    if (/new join|joined|joining/i.test(notes)) {
      out.push({
        kind: "new_joiner",
        staffId: line.staffId,
        employeeName: line.staffName,
        detail: line.notes ?? "New joiner",
        severity: "info",
      });
    }
  }
  return out;
}
