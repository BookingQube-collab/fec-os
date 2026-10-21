"use client";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** Official E3 monogram — print-safe (no white wordmark). */
export const E3_BRAND_MARK_SRC = "/brand/e3-mark.svg";

/**
 * Official E3 letterhead for OT print/preview and other HR docs that share it.
 * Company name + department on the left; real E3 mark on the right.
 */
export function E3DocumentLetterhead({
  tagKey = "hr.ot.print.companyTag",
  tag,
  className,
}: {
  /** i18n key under the company name (default: Operations). Ignored when `tag` is set. */
  tagKey?: string;
  /** Optional plain department/label under the company name (e.g. staff department). */
  tag?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const subtitle = (tag?.trim() || t(tagKey)).trim();

  return (
    <header
      className={cn(
        "e3-letterhead flex items-start justify-between gap-4 border-b-[3px] border-[#7b2d8e] pb-3",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="font-serif text-[13px] font-bold uppercase leading-snug tracking-[0.06em] text-[#7b2d8e]">
          {t("hr.ot.print.company")}
        </p>
        {subtitle ? (
          <p className="mt-1 text-[11px] font-medium text-[#7b2d8e]/80">{subtitle}</p>
        ) : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset; img prints more reliably than next/image */}
      <img
        src={E3_BRAND_MARK_SRC}
        alt={t("hr.ot.print.company")}
        width={64}
        height={76}
        className="e3-letterhead-mark h-14 w-auto shrink-0 object-contain object-right"
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
