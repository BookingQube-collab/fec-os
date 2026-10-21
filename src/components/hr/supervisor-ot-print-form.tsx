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
import type { HrOtRateType, HrOtStatus } from "@/lib/hr-ot";
import { cn } from "@/lib/utils";

export type SupervisorOtPrintStaff = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  /** OT dates for this employee only. */
  workDates: string[];
  requiredHours: number;
  purpose: string;
  rateType: HrOtRateType;
};

export type SupervisorOtPrintPayload = {
  staff: SupervisorOtPrintStaff[];
  /** Form “DATE” field — request day (YYYY-MM-DD). */
  requestDate: string;
  /** Optional workflow status for preview checkmarks. */
  status?: HrOtStatus | null;
};

function formatDisplayDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
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

function OtRequestSheet({
  staff,
  requestDate,
  staffRequired,
  status,
}: {
  staff: SupervisorOtPrintStaff;
  requestDate: string;
  staffRequired: number;
  status?: HrOtStatus | null;
}) {
  const { t } = useTranslation();
  const workDates = staff.workDates;
  const datesLabel = workDates.map(formatDisplayDate).join(" and ");
  const perDay = formatHoursLabel(staff.requiredHours);
  const totalHours = formatHoursLabel(
    Math.round(staff.requiredHours * workDates.length * 100) / 100,
  );
  const siteDone =
    status === "manager_verified" ||
    status === "ops_approved" ||
    status === "hr_approved" ||
    status === "payroll_posted";
  const hooDone =
    status === "ops_approved" || status === "hr_approved" || status === "payroll_posted";
  const hrDone = status === "hr_approved" || status === "payroll_posted";

  return (
    <article className="ot-print-sheet mx-auto flex min-h-[260mm] max-w-[210mm] flex-col bg-white px-6 pb-6 pt-4 text-neutral-900 shadow-sm print:min-h-0 print:max-w-none print:shadow-none">
      <E3DocumentLetterhead tag={staff.department} />

      <h1 className="mt-6 text-center text-lg font-bold uppercase tracking-wide text-[#7b2d8e]">
        {t("hr.ot.print.title")}
      </h1>

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
        <FormField label={t("hr.ot.print.requiredHours")} value={perDay} />
        <FormField
          label={t("hr.ot.print.rateType")}
          value={t(`hr.ot.rateTypes.${staff.rateType}`)}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-8 text-sm">
        <label className="inline-flex items-center gap-2">
          <span className="inline-flex h-4 w-4 items-center justify-center border border-neutral-800 text-[10px] font-bold">
            ✓
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
        <table className="w-full border-collapse border border-neutral-800 text-center text-[11px]">
          <thead>
            <tr>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.ot.print.sigSite")}
              </th>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.ot.print.sigHoo")}
              </th>
              <th className="border border-neutral-800 px-2 py-2 font-bold uppercase">
                {t("hr.ot.print.sigHr")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="h-20 border border-neutral-800 align-middle text-lg">
                {siteDone ? "✓" : ""}
              </td>
              <td className="h-20 border border-neutral-800 align-middle text-lg">
                {hooDone ? "✓" : ""}
              </td>
              <td className="h-20 border border-neutral-800 align-middle text-lg">
                {hrDone ? "✓" : ""}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ot-print-dialog max-h-[92vh] max-w-3xl overflow-y-auto print:fixed print:inset-0 print:max-h-none print:max-w-none print:translate-x-0 print:translate-y-0 print:border-0 print:bg-white print:p-0 print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>{t("hr.ot.print.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("hr.ot.print.dialogHint", { count: payload.staff.length })}
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
