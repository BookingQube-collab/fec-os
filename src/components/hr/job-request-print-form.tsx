"use client";

import { useTranslation } from "react-i18next";

import { E3DocumentFooter, E3DocumentLetterhead } from "@/components/hr/e3-document-letterhead";
import {
  formatLetterheadDisplayDate,
  HrLetterheadPrintDialog,
  LetterheadFormField,
  LetterheadRequestNumber,
} from "@/components/hr/hr-letterhead-print-shell";

export type JobRequestPrintPayload = {
  requestNumber?: string | null;
  requestDate: string;
  jobTitle: string;
  departmentName: string | null;
  locationName: string | null;
  vacanciesCount: number;
  requestTypeLabel: string;
  employmentCategory: string | null;
  priorityLabel: string;
  requiredJoiningDate: string | null;
  salaryBudgetLabel: string | null;
  experienceYears: number | null;
  education: string | null;
  justification: string | null;
  jobDescription: string | null;
  skills: string | null;
  status?: string | null;
};

function JobRequestSheet({ payload }: { payload: JobRequestPrintPayload }) {
  const { t } = useTranslation();
  const sheetNumber = payload.requestNumber?.trim() || null;
  const approved = payload.status === "approved" || payload.status === "published";

  return (
    <article className="hr-letterhead-print-sheet mx-auto flex min-h-[260mm] max-w-[210mm] flex-col bg-white px-6 pb-6 pt-4 text-neutral-900 shadow-sm print:min-h-0 print:max-w-none print:shadow-none">
      <E3DocumentLetterhead tag={payload.departmentName} />

      <h1 className="mt-6 text-center text-lg font-bold uppercase tracking-wide text-[#7b2d8e]">
        {t("hr.jobs.print.title")}
      </h1>
      <LetterheadRequestNumber label={t("hr.jobs.print.requestNumber")} value={sheetNumber} />

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
        <LetterheadFormField label={t("hr.jobs.print.jobTitle")} value={payload.jobTitle} />
        <LetterheadFormField
          label={t("hr.jobs.print.formDate")}
          value={formatLetterheadDisplayDate(payload.requestDate)}
        />
        <LetterheadFormField
          label={t("hr.jobs.print.department")}
          value={payload.departmentName ?? "—"}
        />
        <LetterheadFormField
          label={t("hr.jobs.print.location")}
          value={payload.locationName ?? "—"}
        />
        <LetterheadFormField
          label={t("hr.jobs.print.vacancies")}
          value={String(payload.vacanciesCount)}
        />
        <LetterheadFormField label={t("hr.jobs.print.requestType")} value={payload.requestTypeLabel} />
        <LetterheadFormField
          label={t("hr.jobs.print.category")}
          value={payload.employmentCategory ?? "—"}
        />
        <LetterheadFormField label={t("hr.jobs.print.priority")} value={payload.priorityLabel} />
        <LetterheadFormField
          label={t("hr.jobs.print.joining")}
          value={
            payload.requiredJoiningDate
              ? formatLetterheadDisplayDate(payload.requiredJoiningDate)
              : "—"
          }
        />
        <LetterheadFormField
          label={t("hr.jobs.print.salaryBudget")}
          value={payload.salaryBudgetLabel ?? t("hr.jobs.print.salaryHidden")}
        />
        <LetterheadFormField
          label={t("hr.jobs.print.experience")}
          value={payload.experienceYears != null ? String(payload.experienceYears) : "—"}
        />
        <LetterheadFormField label={t("hr.jobs.print.education")} value={payload.education ?? "—"} />
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">
          {t("hr.jobs.print.justification")}
        </p>
        <div className="mt-1 min-h-[3rem] border-b border-neutral-300 pb-1 text-sm leading-relaxed">
          <p>{payload.justification?.trim() || "—"}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">
          {t("hr.jobs.print.jd")}
        </p>
        <div className="mt-1 min-h-[3rem] border-b border-neutral-300 pb-1 text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{payload.jobDescription?.trim() || "—"}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">
          {t("hr.jobs.print.skills")}
        </p>
        <div className="mt-1 min-h-[2rem] border-b border-neutral-300 pb-1 text-sm leading-relaxed">
          <p>{payload.skills?.trim() || "—"}</p>
        </div>
      </div>

      <p className="mt-4 text-[10px] italic text-neutral-600">{t("hr.jobs.print.instruction")}</p>

      <div className="mt-auto pt-8">
        <table className="w-full border-collapse border border-neutral-800 text-center text-[11px]">
          <thead>
            <tr>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.jobs.print.sigOps")}
              </th>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.jobs.print.sigHr")}
              </th>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.jobs.print.sigGm")}
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

export function JobRequestPrintDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: JobRequestPrintPayload | null;
}) {
  const { t } = useTranslation();
  if (!payload) return null;

  return (
    <HrLetterheadPrintDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("hr.jobs.print.dialogTitle")}
      hint={t("hr.jobs.print.dialogHint")}
      requestNumber={payload.requestNumber}
      cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
      printLabel={t("hr.jobs.print.printButton")}
    >
      <JobRequestSheet payload={payload} />
    </HrLetterheadPrintDialog>
  );
}
