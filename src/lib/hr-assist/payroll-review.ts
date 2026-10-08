import { englishAssistText } from "./copy";
import { resultFrom, takeItems } from "./items";
import type { AssistItem, AssistResult } from "./types";

const VARIANCE_QAR = 500;
const OT_QAR = 200;
const MONEY_GAP = 0.05;

export type PayComponent = { code: string; amountQar: number };

export type PayrollReviewLine = {
  staffId: string;
  staffName: string;
  grossQar: number;
  netQar: number;
  earnings: PayComponent[];
  deductions: PayComponent[];
  varianceVsPrev: number | null;
  hasPrevious: boolean;
  previousDeductionCodes: string[];
  previousOtQar: number | null;
  otQar: number;
  importedNetQar: number | null;
  systemNetQar: number | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sum(lines: PayComponent[]): number {
  return round2(lines.reduce((total, line) => total + (Number(line.amountQar) || 0), 0));
}

function money(n: number): string {
  return round2(n).toFixed(2);
}

function lineItem(
  id: string,
  titleKey: string,
  whyKey: string,
  evidenceKey: string,
  values: Record<string, string | number>,
): AssistItem {
  return {
    id,
    titleKey,
    whyKey,
    evidenceKey,
    actionKey: "hrAssist.payroll.action",
    values,
  };
}

export function payrollReviewLineFromRow(row: {
  staff_id?: string | null;
  staffName?: string | null;
  gross_qar?: number | null;
  net_qar?: number | null;
  earnings?: unknown;
  deductions?: unknown;
  variance_vs_prev?: number | null;
  imported_net_qar?: number | null;
  system_net_qar?: number | null;
  snapshot?: unknown;
  hasPrevious?: boolean;
  previousDeductionCodes?: string[];
  previousOtQar?: number | null;
}): PayrollReviewLine {
  const earnings = components(row.earnings);
  const deductions = components(row.deductions);
  const snap = row.snapshot && typeof row.snapshot === "object" ? (row.snapshot as Record<string, unknown>) : {};
  const otSnap = (Number(snap.otPayReg) || 0) + (Number(snap.otPayPh) || 0);
  const otEarn = sum(earnings.filter((line) => /ot/i.test(line.code)));
  return {
    staffId: String(row.staff_id ?? ""),
    staffName: String(row.staffName ?? "").trim(),
    grossQar: Number(row.gross_qar) || 0,
    netQar: Number(row.net_qar) || 0,
    earnings,
    deductions,
    varianceVsPrev: row.variance_vs_prev == null ? null : Number(row.variance_vs_prev),
    hasPrevious: Boolean(row.hasPrevious),
    previousDeductionCodes: row.previousDeductionCodes ?? [],
    previousOtQar: row.previousOtQar == null ? null : Number(row.previousOtQar),
    otQar: round2(Math.max(otEarn, otSnap)),
    importedNetQar: row.imported_net_qar == null ? null : Number(row.imported_net_qar),
    systemNetQar: row.system_net_qar == null ? null : Number(row.system_net_qar),
  };
}

function components(value: unknown): PayComponent[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      code: String(row.code ?? ""),
      amountQar: Number(row.amountQar ?? row.amount_qar) || 0,
    };
  });
}

export function buildPayrollReview(input: {
  periodLabel: string;
  lines: PayrollReviewLine[];
}): AssistResult {
  if (!input.periodLabel.trim()) return { status: "insufficient", items: [] };
  if (!input.lines.length) return { status: "empty", items: [] };

  const items: AssistItem[] = [];
  for (const line of input.lines) {
    const base = { staffName: line.staffName, periodLabel: input.periodLabel };
    const delta = line.varianceVsPrev;
    if (delta != null && Number.isFinite(delta) && Math.abs(delta) >= VARIANCE_QAR) {
      const previous = round2(line.netQar - delta);
      items.push(
        lineItem(
          `pay:variance:${line.staffId}`,
          "hrAssist.payroll.variance.title",
          "hrAssist.payroll.variance.why",
          "hrAssist.payroll.variance.evidence",
          { ...base, netQar: money(line.netQar), deltaQar: money(delta), previousNetQar: money(previous) },
        ),
      );
    }

    if (line.hasPrevious) {
      const previousCodes = new Set(line.previousDeductionCodes.map((code) => code.toLowerCase()));
      for (const deduction of line.deductions) {
        if (deduction.amountQar <= 0 || previousCodes.has(deduction.code.toLowerCase())) continue;
        items.push(
          lineItem(
            `pay:deduction:${line.staffId}:${deduction.code}`,
            "hrAssist.payroll.deduction.title",
            "hrAssist.payroll.deduction.why",
            "hrAssist.payroll.deduction.evidence",
            {
              ...base,
              amountQar: money(deduction.amountQar),
              code: deduction.code || "deduction",
              previousCodes: line.previousDeductionCodes.length ? line.previousDeductionCodes.join(", ") : "none",
            },
          ),
        );
      }
      if (line.previousOtQar != null && line.previousOtQar < 1 && line.otQar >= OT_QAR) {
        items.push(
          lineItem(
            `pay:ot:${line.staffId}`,
            "hrAssist.payroll.overtime.title",
            "hrAssist.payroll.overtime.why",
            "hrAssist.payroll.overtime.evidence",
            { ...base, otQar: money(line.otQar), previousOtQar: money(line.previousOtQar) },
          ),
        );
      }
    }

    const earningsQar = sum(line.earnings);
    const deductionsQar = sum(line.deductions);
    const expectedNet = round2(line.grossQar - deductionsQar);
    const shared = {
      ...base,
      grossQar: money(line.grossQar),
      earningsQar: money(earningsQar),
      deductionsQar: money(deductionsQar),
      netQar: money(line.netQar),
      expectedNetQar: money(expectedNet),
      importedNetQar: line.importedNetQar == null ? "" : money(line.importedNetQar),
      systemNetQar: line.systemNetQar == null ? "" : money(line.systemNetQar),
    };
    if (line.earnings.length && Math.abs(earningsQar - line.grossQar) > MONEY_GAP) {
      items.push(
        lineItem(
          `pay:recon-earn:${line.staffId}`,
          "hrAssist.payroll.reconcile.title",
          "hrAssist.payroll.reconcile.why",
          "hrAssist.payroll.reconcile.evidence",
          { ...shared, detailCode: "earnings" },
        ),
      );
    } else if (Math.abs(expectedNet - line.netQar) > MONEY_GAP && (line.earnings.length || line.deductions.length)) {
      items.push(
        lineItem(
          `pay:recon-net:${line.staffId}`,
          "hrAssist.payroll.reconcile.title",
          "hrAssist.payroll.reconcile.why",
          "hrAssist.payroll.reconcile.evidence",
          { ...shared, detailCode: "net" },
        ),
      );
    }
    if (
      line.importedNetQar != null &&
      line.systemNetQar != null &&
      Math.abs(line.importedNetQar - line.systemNetQar) > MONEY_GAP
    ) {
      items.push(
        lineItem(
          `pay:recon-import:${line.staffId}`,
          "hrAssist.payroll.reconcile.title",
          "hrAssist.payroll.reconcile.why",
          "hrAssist.payroll.reconcile.evidence",
          { ...shared, detailCode: "import" },
        ),
      );
    }
  }

  return resultFrom(takeItems(items, 3, 12));
}

export function describePayrollItem(item: AssistItem): { why: string; evidence: string } {
  return {
    why: englishAssistText(item.whyKey, item.values),
    evidence: englishAssistText(item.evidenceKey, item.values),
  };
}
