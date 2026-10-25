"use client";

import { useTranslation } from "react-i18next";

import { E3DocumentFooter, E3DocumentLetterhead } from "@/components/hr/e3-document-letterhead";
import {
  formatLetterheadDisplayDate,
  HrLetterheadPrintDialog,
  LetterheadFormField,
  LetterheadRequestNumber,
} from "@/components/hr/hr-letterhead-print-shell";

export type PayslipPrintMoneyLine = {
  label: string;
  amountQar: number;
};

export type PayslipPrintPayload = {
  staffName: string;
  employeeCode: string | null;
  department: string | null;
  jobTitle: string | null;
  month: string;
  dateFrom: string;
  dateTo: string;
  paymentMethod: string;
  earnings: PayslipPrintMoneyLine[];
  deductions: PayslipPrintMoneyLine[];
  grossQar: number;
  netQar: number;
  workingDays: number | null;
  currency: string;
};

function formatQar(n: number, currency = "QAR"): string {
  const amount = Number.isFinite(n)
    ? n.toLocaleString("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${amount} ${currency}`;
}

function MoneyTable({
  title,
  rows,
  currency,
  emptyLabel,
}: {
  title: string;
  rows: PayslipPrintMoneyLine[];
  currency: string;
  emptyLabel: string;
}) {
  const visible = rows.filter((r) => Number.isFinite(r.amountQar) && r.amountQar !== 0);
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">{title}</p>
      <table className="mt-1 w-full border-collapse border border-neutral-400 text-sm">
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td className="border border-neutral-300 px-2 py-1.5 text-neutral-500">{emptyLabel}</td>
              <td className="border border-neutral-300 px-2 py-1.5 text-end tabular-nums text-neutral-500">
                {formatQar(0, currency)}
              </td>
            </tr>
          ) : (
            visible.map((row) => (
              <tr key={`${row.label}-${row.amountQar}`}>
                <td className="border border-neutral-300 px-2 py-1.5 text-neutral-900">{row.label}</td>
                <td className="border border-neutral-300 px-2 py-1.5 text-end tabular-nums text-neutral-900">
                  {formatQar(row.amountQar, currency)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PayslipSheet({ payload }: { payload: PayslipPrintPayload }) {
  const { t } = useTranslation();
  const currency = payload.currency || "QAR";
  const periodLabel = `${formatLetterheadDisplayDate(payload.dateFrom)} – ${formatLetterheadDisplayDate(payload.dateTo)}`;

  return (
    <article className="hr-letterhead-print-sheet mx-auto flex min-h-[260mm] max-w-[210mm] flex-col bg-white px-6 pb-6 pt-4 text-neutral-900 shadow-sm print:min-h-0 print:max-w-none print:shadow-none">
      <E3DocumentLetterhead tag={payload.department} />

      <h1 className="mt-6 text-center text-lg font-bold uppercase tracking-wide text-[#7b2d8e]">
        {t("hr.payrollRuns.print.title")}
      </h1>
      <LetterheadRequestNumber
        label={t("hr.payrollRuns.print.periodMonth")}
        value={payload.month}
      />

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
        <LetterheadFormField
          label={t("hr.payrollRuns.print.employeeName")}
          value={payload.staffName}
        />
        <LetterheadFormField
          label={t("hr.payrollRuns.print.employeeId")}
          value={payload.employeeCode ?? "—"}
        />
        <LetterheadFormField
          label={t("hr.payrollRuns.print.department")}
          value={payload.department ?? "—"}
        />
        <LetterheadFormField
          label={t("hr.payrollRuns.print.jobTitle")}
          value={payload.jobTitle ?? "—"}
        />
        <LetterheadFormField label={t("hr.payrollRuns.print.cycle")} value={periodLabel} />
        <LetterheadFormField
          label={t("hr.payrollRuns.print.paymentMethod")}
          value={payload.paymentMethod || "—"}
        />
        <LetterheadFormField
          label={t("hr.payrollRuns.print.workingDays")}
          value={payload.workingDays == null ? "—" : String(payload.workingDays)}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <MoneyTable
          title={t("hr.payrollRuns.print.earnings")}
          rows={payload.earnings}
          currency={currency}
          emptyLabel={t("hr.payrollRuns.print.none")}
        />
        <MoneyTable
          title={t("hr.payrollRuns.print.deductions")}
          rows={payload.deductions}
          currency={currency}
          emptyLabel={t("hr.payrollRuns.print.none")}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
        <LetterheadFormField
          label={t("hr.payrollRuns.print.gross")}
          value={formatQar(payload.grossQar, currency)}
        />
        <LetterheadFormField
          label={t("hr.payrollRuns.print.net")}
          value={formatQar(payload.netQar, currency)}
        />
      </div>

      <p className="mt-4 text-[10px] italic text-neutral-600">{t("hr.payrollRuns.print.instruction")}</p>

      <div className="mt-auto pt-8">
        <E3DocumentFooter />
      </div>
    </article>
  );
}

export function PayslipPrintDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: PayslipPrintPayload | null;
}) {
  const { t } = useTranslation();
  if (!payload) return null;

  return (
    <HrLetterheadPrintDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("hr.payrollRuns.print.dialogTitle")}
      hint={t("hr.payrollRuns.print.dialogHint")}
      requestNumber={payload.month}
      cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
      printLabel={t("hr.payrollRuns.print.printButton")}
    >
      <PayslipSheet payload={payload} />
    </HrLetterheadPrintDialog>
  );
}
