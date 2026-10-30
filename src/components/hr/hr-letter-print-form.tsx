"use client";

import { useTranslation } from "react-i18next";

import { E3DocumentFooter, E3DocumentLetterhead } from "@/components/hr/e3-document-letterhead";
import {
  formatLetterheadDisplayDate,
  HrLetterheadPrintDialog,
} from "@/components/hr/hr-letterhead-print-shell";
import type { HrLetterDraft } from "@/lib/hr/hr-letter-types";
import { cn } from "@/lib/utils";

export type HrLetterPrintPayload = {
  letterTypeLabel: string;
  letterDate: string;
  staffName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  draft: HrLetterDraft;
  locale?: "en" | "ar";
};

function HrLetterSheet({ payload }: { payload: HrLetterPrintPayload }) {
  const rtl = payload.locale === "ar";
  const draft = payload.draft;

  return (
    <article
      className={cn(
        "hr-letterhead-print-sheet mx-auto flex min-h-[260mm] max-w-[210mm] flex-col bg-white px-6 pb-6 pt-4 text-neutral-900 shadow-sm print:min-h-0 print:max-w-none print:shadow-none",
        rtl && "text-end",
      )}
      dir={rtl ? "rtl" : "ltr"}
    >
      <E3DocumentLetterhead tag={payload.department} />

      <p className="mt-6 text-sm text-neutral-800">{formatLetterheadDisplayDate(payload.letterDate)}</p>
      {draft.reference?.trim() ? (
        <p className="mt-1 text-sm font-semibold text-neutral-900">Ref: {draft.reference.trim()}</p>
      ) : null}

      <h1 className="mt-5 text-center text-lg font-bold uppercase tracking-wide text-[#7b2d8e]">
        {draft.subject.trim() || payload.letterTypeLabel}
      </h1>

      <div className="mt-4 space-y-0.5 text-sm text-neutral-800">
        <p className="font-medium text-neutral-900">{payload.staffName}</p>
        {payload.employeeCode ? <p>ID: {payload.employeeCode}</p> : null}
        {payload.jobTitle ? <p>{payload.jobTitle}</p> : null}
        {payload.department ? <p>{payload.department}</p> : null}
      </div>

      <p className="mt-6 text-sm font-medium text-neutral-900">{draft.salutation}</p>

      <div className="mt-4 flex-1 space-y-3 text-sm leading-relaxed text-neutral-900">
        {draft.bodyParagraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-10 space-y-10">
        <p className="text-sm text-neutral-900">{draft.closing}</p>
        <p className="text-sm font-semibold text-neutral-900">{draft.signatoryTitle}</p>
      </div>

      <E3DocumentFooter className="mt-auto pt-8" />
    </article>
  );
}

export function HrLetterPrintDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: HrLetterPrintPayload | null;
}) {
  const { t } = useTranslation();
  if (!payload) return null;

  return (
    <HrLetterheadPrintDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("hrWorkspace.letters.printTitle")}
      hint={t("hrWorkspace.letters.printHint")}
      printLabel={t("common.print", { defaultValue: "Print" })}
    >
      <HrLetterSheet payload={payload} />
    </HrLetterheadPrintDialog>
  );
}
