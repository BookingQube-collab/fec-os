"use client";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * Official E3 letterhead for OT print/preview and other HR docs that share it.
 * Extracted from the supervisor OT form so payroll / letters can reuse one header.
 */
export function E3DocumentLetterhead({
  tagKey = "hr.ot.print.companyTag",
  className,
}: {
  /** i18n key under the company name (default: Operations). */
  tagKey?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 border-b-2 border-[#7b2d8e] pb-3",
        className,
      )}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b2d8e]">
          {t("hr.ot.print.company")}
        </p>
        <p className="mt-1 text-[10px] text-neutral-500">{t(tagKey)}</p>
      </div>
      <div
        className="h-12 w-16 shrink-0 rounded-sm bg-gradient-to-br from-[#f4a7c2] via-[#c465d8] to-[#7b2d8e]"
        aria-hidden
      />
    </header>
  );
}

export function E3DocumentFooter({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={cn("mt-4 text-center text-[9px] text-neutral-500", className)}>
      {t("hr.ot.print.footer")}
    </p>
  );
}
