"use client";

import { useTranslation } from "react-i18next";

import { E3DocumentFooter, E3DocumentLetterhead } from "@/components/hr/e3-document-letterhead";
import {
  formatLetterheadDisplayDate,
  HrLetterheadPrintDialog,
  LetterheadFormField,
  LetterheadRequestNumber,
} from "@/components/hr/hr-letterhead-print-shell";

export type MissedPunchPrintPayload = {
  requestNumber?: string | null;
  requestDate: string;
  staffName: string;
  employeeCode: string | null;
  department?: string | null;
  jobTitle?: string | null;
  workDate: string | null;
  punchTypeLabel: string;
  punchAtLabel: string;
  reason: string;
  status?: string | null;
};

function MissedPunchSheet({ payload }: { payload: MissedPunchPrintPayload }) {
  const { t } = useTranslation();
  const sheetNumber = payload.requestNumber?.trim() || null;
  const approved = payload.status === "approved";

  return (
    <article className="hr-letterhead-print-sheet mx-auto flex min-h-[260mm] max-w-[210mm] flex-col bg-white px-6 pb-6 pt-4 text-neutral-900 shadow-sm print:min-h-0 print:max-w-none print:shadow-none">
      <E3DocumentLetterhead tag={payload.department} />

      <h1 className="mt-6 text-center text-lg font-bold uppercase tracking-wide text-[#7b2d8e]">
        {t("hr.missedPunch.print.title")}
      </h1>
      <LetterheadRequestNumber label={t("hr.missedPunch.print.requestNumber")} value={sheetNumber} />

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
        <LetterheadFormField label={t("hr.missedPunch.print.employeeName")} value={payload.staffName} />
        <LetterheadFormField
          label={t("hr.missedPunch.print.employeeId")}
          value={payload.employeeCode ?? "—"}
        />
        <LetterheadFormField
          label={t("hr.missedPunch.print.department")}
          value={payload.department ?? "—"}
        />
        <LetterheadFormField
          label={t("hr.missedPunch.print.jobTitle")}
          value={payload.jobTitle ?? "—"}
        />
        <LetterheadFormField
          label={t("hr.missedPunch.print.formDate")}
          value={formatLetterheadDisplayDate(payload.requestDate)}
        />
        <LetterheadFormField
          label={t("hr.missedPunch.print.workDate")}
          value={
            payload.workDate ? formatLetterheadDisplayDate(payload.workDate) : "—"
          }
        />
        <LetterheadFormField label={t("hr.missedPunch.print.punchType")} value={payload.punchTypeLabel} />
        <LetterheadFormField label={t("hr.missedPunch.print.punchTime")} value={payload.punchAtLabel} />
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">
          {t("hr.missedPunch.print.reason")}
        </p>
        <div className="mt-1 min-h-[4.5rem] space-y-2 border-b border-neutral-300 pb-1 text-sm leading-relaxed">
          <p>{payload.reason.trim() || "—"}</p>
          <div className="border-b border-neutral-300" />
          <div className="border-b border-neutral-300" />
        </div>
      </div>

      <p className="mt-4 text-[10px] italic text-neutral-600">{t("hr.missedPunch.print.instruction")}</p>

      <div className="mt-auto pt-8">
        <table className="w-full border-collapse border border-neutral-800 text-center text-[11px]">
          <thead>
            <tr>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.missedPunch.print.sigManager")}
              </th>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.missedPunch.print.sigOps")}
              </th>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.missedPunch.print.sigHr")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="h-20 border border-neutral-800 align-middle text-lg">
                {approved ? "✓" : ""}
              </td>
              <td className="h-20 border border-neutral-800 align-middle text-lg">
                {approved ? "✓" : ""}
              </td>
              <td className="h-20 border border-neutral-800 align-middle text-lg">
                {approved ? "✓" : ""}
              </td>
            </tr>
          </tbody>
        </table>
        <E3DocumentFooter />
      </div>
    </article>
  );
}

export function MissedPunchPrintDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: MissedPunchPrintPayload | null;
}) {
  const { t } = useTranslation();
  if (!payload) return null;

  return (
    <HrLetterheadPrintDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("hr.missedPunch.print.dialogTitle")}
      hint={t("hr.missedPunch.print.dialogHint")}
      requestNumber={payload.requestNumber}
      cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
      printLabel={t("hr.missedPunch.print.printButton")}
    >
      <MissedPunchSheet payload={payload} />
    </HrLetterheadPrintDialog>
  );
}
