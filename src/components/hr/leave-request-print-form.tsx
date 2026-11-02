"use client";

import { useTranslation } from "react-i18next";

import { DigitalSignatureImage } from "@/components/hr/digital-signature-image";
import { E3DocumentFooter, E3DocumentLetterhead } from "@/components/hr/e3-document-letterhead";
import {
  formatLetterheadDisplayDate,
  HrLetterheadPrintDialog,
  LetterheadFormField,
  LetterheadRequestNumber,
} from "@/components/hr/hr-letterhead-print-shell";
import {
  leavePrintSignatureActors,
  leavePrintSignatureDone,
  type HrLeaveStatus,
  type LeavePrintSigKey,
  type LeavePrintSignature,
} from "@/lib/hr-leave";
import { leavePrintShowsSupervisorSeat } from "@/lib/hr-leave-routing";

export type LeaveRequestPrintStep = {
  stepRole: string;
  status: string;
  actedByName?: string | null;
  actedAt?: string | null;
  actedBySignatureUrl?: string | null;
};

export type LeaveRequestPrintPayload = {
  requestNumber?: string | null;
  requestDate: string;
  staffName: string;
  employeeCode: string | null;
  department: string | null;
  jobTitle: string | null;
  phone?: string | null;
  leaveTypeLabel: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  reason: string | null;
  status?: HrLeaveStatus | null;
  /** Approval trail — drives which signature cells fill after each seat approves. */
  steps?: LeaveRequestPrintStep[];
  /**
   * When false, hide the Supervisor column (no supervisor seat on this leave).
   * Defaults from approval steps (preferred) or applicant jobTitle.
   */
  showSupervisorSignature?: boolean;
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
  signature?: LeavePrintSignature | null;
}) {
  if (!done) return null;
  const imageUrl = signature?.imageUrl?.trim() || null;
  const name = signature?.name?.trim() || null;
  const when = formatSignatureWhen(signature?.at);
  if (!imageUrl && !name && !when) {
    return <span className="text-lg leading-none">✓</span>;
  }
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 bg-transparent px-1 py-1">
      {imageUrl ? (
        <DigitalSignatureImage
          src={imageUrl}
          alt={name ? `${name} signature` : "Signature"}
          className="max-h-12 max-w-[92%]"
        />
      ) : (
        <span className="text-lg leading-none">✓</span>
      )}
      {name ? (
        <span className="max-w-full truncate text-[9px] leading-tight text-neutral-800">{name}</span>
      ) : null}
      {when ? <span className="text-[8px] text-neutral-600">{when}</span> : null}
    </div>
  );
}

function LeaveRequestSheet({ payload }: { payload: LeaveRequestPrintPayload }) {
  const { t } = useTranslation();
  const sheetNumber = payload.requestNumber?.trim() || null;
  const steps = payload.steps ?? [];
  const showSupervisor =
    payload.showSupervisorSignature ??
    leavePrintShowsSupervisorSeat(payload.jobTitle, steps);
  const actors = leavePrintSignatureActors({ status: payload.status, steps });
  const done = (key: LeavePrintSigKey) => leavePrintSignatureDone(payload.status, steps, key);

  const columns: Array<{ key: LeavePrintSigKey; label: string }> = [
    ...(showSupervisor
      ? [{ key: "supervisor" as const, label: t("hr.leave.print.sigSupervisor") }]
      : []),
    { key: "site", label: t("hr.leave.print.sigSite") },
    { key: "hoo", label: t("hr.leave.print.sigHoo") },
    { key: "hr", label: t("hr.leave.print.sigHr") },
  ];

  return (
    <article className="hr-letterhead-print-sheet mx-auto flex min-h-[260mm] max-w-[210mm] flex-col bg-white px-6 pb-6 pt-4 text-neutral-900 shadow-sm print:min-h-0 print:max-w-none print:shadow-none">
      <E3DocumentLetterhead tag={payload.department} />

      <h1 className="mt-6 text-center text-lg font-bold uppercase tracking-wide text-[#7b2d8e]">
        {t("hr.leave.print.title")}
      </h1>
      <LetterheadRequestNumber label={t("hr.leave.print.requestNumber")} value={sheetNumber} />

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
        <LetterheadFormField label={t("hr.leave.print.employeeName")} value={payload.staffName} />
        <LetterheadFormField
          label={t("hr.leave.print.employeeId")}
          value={payload.employeeCode ?? "—"}
        />
        <LetterheadFormField
          label={t("hr.leave.print.department")}
          value={payload.department ?? "—"}
        />
        <LetterheadFormField label={t("hr.leave.print.jobTitle")} value={payload.jobTitle ?? "—"} />
        <LetterheadFormField
          label={t("hr.leave.print.formDate")}
          value={formatLetterheadDisplayDate(payload.requestDate)}
        />
        <LetterheadFormField label={t("hr.leave.print.phone")} value={payload.phone ?? "—"} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
        <LetterheadFormField label={t("hr.leave.print.leaveType")} value={payload.leaveTypeLabel} />
        <LetterheadFormField
          label={t("hr.leave.print.days")}
          value={String(payload.days)}
        />
        <LetterheadFormField
          label={t("hr.leave.print.dateFrom")}
          value={formatLetterheadDisplayDate(payload.dateFrom)}
        />
        <LetterheadFormField
          label={t("hr.leave.print.dateTo")}
          value={formatLetterheadDisplayDate(payload.dateTo)}
        />
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">
          {t("hr.leave.print.reason")}
        </p>
        <div className="mt-1 min-h-[4.5rem] space-y-2 border-b border-neutral-300 pb-1 text-sm leading-relaxed">
          <p>{payload.reason?.trim() || "—"}</p>
          <div className="border-b border-neutral-300" />
          <div className="border-b border-neutral-300" />
        </div>
      </div>

      <p className="mt-4 text-[10px] italic text-neutral-600">{t("hr.leave.print.instruction")}</p>

      <div className="mt-auto pt-8">
        <table className="w-full border-collapse border border-neutral-800 text-center text-[9px]">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="border border-neutral-800 px-1 py-2 font-bold uppercase">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {columns.map((col) => (
                <td key={col.key} className="h-24 border border-neutral-800 align-middle">
                  <SignatureStamp done={done(col.key)} signature={actors[col.key]} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <E3DocumentFooter />
      </div>
    </article>
  );
}

export function LeaveRequestPrintDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: LeaveRequestPrintPayload | null;
}) {
  const { t } = useTranslation();
  if (!payload) return null;

  return (
    <HrLetterheadPrintDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("hr.leave.print.dialogTitle")}
      hint={t("hr.leave.print.dialogHint")}
      requestNumber={payload.requestNumber}
      cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
      printLabel={t("hr.leave.print.printButton")}
    >
      <LeaveRequestSheet payload={payload} />
    </HrLetterheadPrintDialog>
  );
}
