"use client";

import { useTranslation } from "react-i18next";

import { E3DocumentFooter, E3DocumentLetterhead } from "@/components/hr/e3-document-letterhead";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  otPrintSignatureDone,
  sumSupervisorOtDayHours,
  type HrOtRateType,
  type HrOtStatus,
  type OtPrintSignature,
} from "@/lib/hr-ot";
import { cn } from "@/lib/utils";

export type SupervisorOtPrintDay = {
  workDate: string;
  /** Extra OT hours for this date only. */
  hours: number;
};

export type SupervisorOtPrintStaff = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  /** Per-date OT hours (never a single combined total). */
  days: SupervisorOtPrintDay[];
  purpose: string;
  rateType: HrOtRateType;
  /** OT request number shown on the printable slip (e.g. OT-20261021-0010). */
  requestNumber?: string | null;
};

export type SupervisorOtPrintPayload = {
  staff: SupervisorOtPrintStaff[];
  /** Form “DATE” field — request day (YYYY-MM-DD). */
  requestDate: string;
  /** Optional workflow status for progressive signature boxes. */
  status?: HrOtStatus | null;
  /**
   * Fallback request number when staff sheets do not carry their own
   * (e.g. single-request preview from the approval queue).
   */
  requestNumber?: string | null;
  siteSignature?: OtPrintSignature | null;
  hooSignature?: OtPrintSignature | null;
  gmSignature?: OtPrintSignature | null;
  hrSignature?: OtPrintSignature | null;
};

function formatDisplayDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function formatSignatureWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return formatDisplayDate(day);
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

function formatHoursLabel(hours: number): string {
  const n = Number.isInteger(hours) ? String(hours) : String(hours);
  return `${n} hrs`;
}

function FormField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">{label}</p>
      <p className="mt-0.5 min-h-[1.25rem] border-b border-neutral-400 pb-0.5 text-sm text-neutral-900">
        {value || "\u00a0"}
      </p>
    </div>
  );
}

function SignatureStamp({
  done,
  signature,
}: {
  done: boolean;
  signature?: OtPrintSignature | null;
}) {
  if (!done) return null;
  // Opt-in digital image only — without it the box stays blank for wet-ink.
  const imageUrl = signature?.imageUrl?.trim() || null;
  if (!imageUrl) return null;
  const name = signature?.name?.trim() || null;
  const when = formatSignatureWhen(signature?.at);
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-1 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL for print */}
      <img
        src={imageUrl}
        alt={name ? `${name} signature` : "Signature"}
        className="mx-auto max-h-14 max-w-[92%] object-contain"
      />
      {name ? (
        <span className="max-w-full truncate text-[10px] leading-tight text-neutral-800">{name}</span>
      ) : null}
      {when ? <span className="text-[9px] text-neutral-600">{when}</span> : null}
    </div>
  );
}

function OtRequestSheet({
  staff,
  requestDate,
  staffRequired,
  status,
  requestNumber,
  siteSignature,
  hooSignature,
  gmSignature,
  hrSignature,
}: {
  staff: SupervisorOtPrintStaff;
  requestDate: string;
  staffRequired: number;
  status?: HrOtStatus | null;
  requestNumber?: string | null;
  siteSignature?: OtPrintSignature | null;
  hooSignature?: OtPrintSignature | null;
  gmSignature?: OtPrintSignature | null;
  hrSignature?: OtPrintSignature | null;
}) {
  const { t } = useTranslation();
  const days = [...staff.days].sort((a, b) => a.workDate.localeCompare(b.workDate));
  const datesLabel = days.map((day) => formatDisplayDate(day.workDate)).join(" and ");
  const perDayLabel = days
    .map((day) => `${formatDisplayDate(day.workDate)}: ${formatHoursLabel(day.hours)}`)
    .join("; ");
  const totalHours = formatHoursLabel(sumSupervisorOtDayHours(days));
  const sheetNumber = (staff.requestNumber ?? requestNumber)?.trim() || null;
  const siteDone = otPrintSignatureDone(status, "site");
  const hooDone = otPrintSignatureDone(status, "hoo");
  const gmDone = otPrintSignatureDone(status, "gm");
  const hrDone = otPrintSignatureDone(status, "hr");
  const authorized = siteDone || hooDone || gmDone || hrDone;

  return (
    <article className="ot-print-sheet mx-auto flex min-h-[260mm] max-w-[210mm] flex-col bg-white px-6 pb-6 pt-4 text-neutral-900 shadow-sm print:min-h-0 print:max-w-none print:shadow-none">
      <E3DocumentLetterhead tag={staff.department} />

      <h1 className="mt-6 text-center text-lg font-bold uppercase tracking-wide text-[#7b2d8e]">
        {t("hr.ot.print.title")}
      </h1>
      {sheetNumber ? (
        <p className="mt-2 text-center text-sm font-semibold tracking-wide text-neutral-900">
          <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-700">
            {t("hr.ot.print.requestNumber")}
          </span>
          <span className="mx-2 text-neutral-400" aria-hidden>
            ·
          </span>
          <span className="font-mono text-[15px] font-bold tracking-tight">{sheetNumber}</span>
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
        <FormField label={t("hr.ot.print.employeeName")} value={staff.fullName} />
        <FormField label={t("hr.ot.print.employeeId")} value={staff.employeeCode ?? "—"} />
        <FormField label={t("hr.ot.print.department")} value={staff.department ?? "—"} />
        <FormField label={t("hr.ot.print.jobTitle")} value={staff.jobTitle ?? "—"} />
        <FormField label={t("hr.ot.print.formDate")} value={formatDisplayDate(requestDate)} />
        <FormField label={t("hr.ot.print.phone")} value={staff.phone ?? "—"} />
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">
          {t("hr.ot.print.purpose")}
        </p>
        <div className="mt-1 min-h-[4.5rem] space-y-2 border-b border-neutral-300 pb-1 text-sm leading-relaxed">
          <p>{staff.purpose}</p>
          <div className="border-b border-neutral-300" />
          <div className="border-b border-neutral-300" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
        <FormField label={t("hr.ot.print.staffRequired")} value={String(staffRequired)} />
        <FormField label={t("hr.ot.print.otDates")} value={datesLabel} />
        <FormField label={t("hr.ot.print.otTime")} value={totalHours} />
        <FormField label={t("hr.ot.print.requiredHours")} value={perDayLabel} />
        <FormField
          label={t("hr.ot.print.rateType")}
          value={t(`hr.ot.rateTypes.${staff.rateType}`)}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-8 text-sm">
        <label className="inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center border text-[10px] font-bold",
              authorized ? "border-neutral-800" : "border-neutral-400 text-transparent",
            )}
          >
            {authorized ? "✓" : ""}
          </span>
          <span className="font-semibold uppercase tracking-wide">{t("hr.ot.print.authorized")}</span>
        </label>
        <label className="inline-flex items-center gap-2 text-neutral-500">
          <span className="inline-flex h-4 w-4 border border-neutral-400" />
          <span className="font-semibold uppercase tracking-wide">{t("hr.ot.print.notAuthorized")}</span>
        </label>
      </div>

      <p className="mt-4 text-[10px] italic text-neutral-600">{t("hr.ot.print.instruction")}</p>

      <div className="mt-auto pt-8">
        <table className="w-full border-collapse border border-neutral-800 text-center text-[10px]">
          <thead>
            <tr>
              <th className="border border-neutral-800 px-1.5 py-2 font-bold uppercase">
                {t("hr.ot.print.sigSite")}
              </th>
              <th className="border border-neutral-800 px-1.5 py-2 font-bold uppercase">
                {t("hr.ot.print.sigHoo")}
              </th>
              <th className="border border-neutral-800 px-1.5 py-2 font-bold uppercase">
                {t("hr.ot.print.sigHr")}
              </th>
              <th className="border border-neutral-800 px-1.5 py-2 font-bold uppercase">
                {t("hr.ot.print.sigGm")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={siteDone} signature={siteSignature} />
              </td>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={hooDone} signature={hooSignature} />
              </td>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={hrDone} signature={hrSignature} />
              </td>
              <td className="h-24 border border-neutral-800 align-middle">
                <SignatureStamp done={gmDone} signature={gmSignature} />
              </td>
            </tr>
          </tbody>
        </table>
        <E3DocumentFooter />
      </div>
    </article>
  );
}

export function SupervisorOtPrintDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: SupervisorOtPrintPayload | null;
}) {
  const { t } = useTranslation();
  if (!payload || payload.staff.length === 0) return null;

  const dialogNumbers = [
    ...new Set(
      [
        payload.requestNumber,
        ...payload.staff.map((person) => person.requestNumber),
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ot-print-dialog max-h-[92vh] max-w-3xl overflow-y-auto print:fixed print:inset-0 print:max-h-none print:max-w-none print:translate-x-0 print:translate-y-0 print:border-0 print:bg-white print:p-0 print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>{t("hr.ot.print.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("hr.ot.print.dialogHint", { count: payload.staff.length })}
            {dialogNumbers.length > 0 ? (
              <>
                {" "}
                <span className="font-mono font-semibold text-foreground">
                  {dialogNumbers.join(", ")}
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="ot-print-root space-y-6 bg-neutral-100 p-2 print:space-y-0 print:bg-white print:p-0">
          {payload.staff.map((person) => (
            <OtRequestSheet
              key={person.id}
              staff={person}
              requestDate={payload.requestDate}
              staffRequired={payload.staff.length}
              status={payload.status}
              requestNumber={payload.requestNumber}
              siteSignature={payload.siteSignature}
              hooSignature={payload.hooSignature}
              gmSignature={payload.gmSignature}
              hrSignature={payload.hrSignature}
            />
          ))}
        </div>

        <DialogFooter className="print:hidden">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("hr.ot.cancel")}
          </Button>
          <Button type="button" onClick={() => window.print()}>
            {t("hr.ot.print.printButton")}
          </Button>
        </DialogFooter>

        <style>{`
          .e3-letterhead,
          .e3-letterhead-header,
          .e3-letterhead-footer,
          .e3-letterhead-footer img {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body * { visibility: hidden !important; }
            .ot-print-dialog,
            .ot-print-dialog * { visibility: visible !important; }
            .ot-print-dialog {
              position: absolute !important;
              inset: 0 !important;
              width: 100% !important;
              max-width: none !important;
              transform: none !important;
              border: 0 !important;
              box-shadow: none !important;
              background: #fff !important;
              overflow: visible !important;
              padding: 0 !important;
            }
            .ot-print-dialog .print\\:hidden,
            .ot-print-dialog > button {
              display: none !important;
              visibility: hidden !important;
            }
            .ot-print-sheet {
              break-after: page;
              page-break-after: always;
              box-shadow: none !important;
            }
            .ot-print-sheet:last-child {
              break-after: auto;
              page-break-after: auto;
            }
            .e3-letterhead,
            .e3-letterhead-header,
            .e3-letterhead-footer,
            .e3-letterhead-footer img {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
