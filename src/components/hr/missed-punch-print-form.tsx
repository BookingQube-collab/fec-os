"use client";

import { useTranslation } from "react-i18next";

import { E3DocumentFooter, E3DocumentLetterhead } from "@/components/hr/e3-document-letterhead";
import {
  formatLetterheadDisplayDate,
  HrLetterheadPrintDialog,
  LetterheadFormField,
  LetterheadRequestNumber,
} from "@/components/hr/hr-letterhead-print-shell";
import {
  missedPunchPrintSignatureDone,
  type MissedPunchPrintSigKey,
} from "@/lib/attendance-hr/missed-punch-approval";

export type MissedPunchPrintSignature = {
  name: string | null;
  at: string | null;
  /** Signed URL for an opt-in digital signature image when available. */
  imageUrl?: string | null;
};

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
  /** Team supervisor filed and auto-approved the first seat. */
  teamSubmitted?: boolean;
  steps?: Array<{
    stepRole: string;
    status: string;
    actedByName?: string | null;
    actedAt?: string | null;
  }>;
  supervisorSignature?: MissedPunchPrintSignature | null;
  siteSignature?: MissedPunchPrintSignature | null;
  hooSignature?: MissedPunchPrintSignature | null;
  hrSignature?: MissedPunchPrintSignature | null;
  gmSignature?: MissedPunchPrintSignature | null;
};

function formatSignatureWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return formatLetterheadDisplayDate(day);
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return day;
  }
}

function SignatureStamp({
  done,
  signature,
}: {
  done: boolean;
  signature?: MissedPunchPrintSignature | null;
}) {
  if (!done) return null;
  const imageUrl = signature?.imageUrl?.trim() || null;
  const name = signature?.name?.trim() || null;
  const when = formatSignatureWhen(signature?.at);
  if (!imageUrl && !name && !when) return null;
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-1 py-1">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL for print
        <img
          src={imageUrl}
          alt={name ? `${name} signature` : "Signature"}
          className="mx-auto max-h-12 max-w-[92%] object-contain"
        />
      ) : null}
      {name ? (
        <span className="max-w-full truncate text-[9px] leading-tight text-neutral-800">{name}</span>
      ) : null}
      {when ? <span className="text-[8px] text-neutral-600">{when}</span> : null}
    </div>
  );
}

function MissedPunchSheet({ payload }: { payload: MissedPunchPrintPayload }) {
  const { t } = useTranslation();
  const sheetNumber = payload.requestNumber?.trim() || null;
  const steps = payload.steps ?? [];
  const teamSubmitted = Boolean(payload.teamSubmitted);
  const done = (key: MissedPunchPrintSigKey) =>
    missedPunchPrintSignatureDone(payload.status, steps, key, { teamSubmitted });

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
        <table className="w-full border-collapse border border-neutral-800 text-center text-[9px]">
          <thead>
            <tr>
              <th className="border border-neutral-800 px-1 py-2 font-bold uppercase">
                {t("hr.missedPunch.print.sigSupervisor")}
              </th>
              <th className="border border-neutral-800 px-1 py-2 font-bold uppercase">
                {t("hr.missedPunch.print.sigSite")}
              </th>
              <th className="border border-neutral-800 px-1 py-2 font-bold uppercase">
                {t("hr.missedPunch.print.sigHoo")}
              </th>
              <th className="border border-neutral-800 px-1 py-2 font-bold uppercase">
                {t("hr.missedPunch.print.sigHr")}
              </th>
              <th className="border border-neutral-800 px-1 py-2 font-bold uppercase">
                {t("hr.missedPunch.print.sigGm")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={done("supervisor")} signature={payload.supervisorSignature} />
              </td>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={done("site")} signature={payload.siteSignature} />
              </td>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={done("hoo")} signature={payload.hooSignature} />
              </td>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={done("hr")} signature={payload.hrSignature} />
              </td>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={done("gm")} signature={payload.gmSignature} />
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
