"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { DIGITAL_SIGNATURE_PRINT_CSS } from "@/components/hr/digital-signature-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function formatLetterheadDisplayDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export function LetterheadFormField({
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

export function LetterheadRequestNumber({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const sheetNumber = value?.trim() || null;
  if (!sheetNumber) return null;
  return (
    <p className="mt-2 text-center text-sm font-semibold tracking-wide text-neutral-900">
      <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-700">{label}</span>
      <span className="mx-2 text-neutral-400" aria-hidden>
        ·
      </span>
      <span className="font-mono text-[15px] font-bold tracking-tight">{sheetNumber}</span>
    </p>
  );
}

const PRINT_STYLE = `
  ${DIGITAL_SIGNATURE_PRINT_CSS}
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
    .hr-letterhead-print-dialog,
    .hr-letterhead-print-dialog * { visibility: visible !important; }
    .hr-letterhead-print-dialog {
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
    .hr-letterhead-print-dialog .print\\:hidden,
    .hr-letterhead-print-dialog > button {
      display: none !important;
      visibility: hidden !important;
    }
    .hr-letterhead-print-sheet {
      break-after: page;
      page-break-after: always;
      box-shadow: none !important;
    }
    .hr-letterhead-print-sheet:last-child {
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
`;

export function HrLetterheadPrintDialog({
  open,
  onOpenChange,
  title,
  hint,
  requestNumber,
  cancelLabel,
  printLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hint: string;
  requestNumber?: string | null;
  cancelLabel?: string;
  printLabel?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hr-letterhead-print-dialog max-h-[92vh] max-w-3xl overflow-y-auto print:fixed print:inset-0 print:max-h-none print:max-w-none print:translate-x-0 print:translate-y-0 print:border-0 print:bg-white print:p-0 print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {hint}
            {requestNumber?.trim() ? (
              <>
                {" "}
                <span className="font-mono font-semibold text-foreground">{requestNumber.trim()}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 bg-neutral-100 p-2 print:space-y-0 print:bg-white print:p-0">
          {children}
        </div>

        <DialogFooter className="print:hidden">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {cancelLabel ?? t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button type="button" onClick={() => window.print()}>
            {printLabel ?? t("common.print", { defaultValue: "Print" })}
          </Button>
        </DialogFooter>

        <style>{PRINT_STYLE}</style>
      </DialogContent>
    </Dialog>
  );
}
