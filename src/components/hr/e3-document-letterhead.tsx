"use client";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** Official E3 letterhead header raster (from corporate Word template). */
export const E3_LETTERHEAD_HEADER_SRC = "/brand/e3-letterhead-header.jpg";

/** Official E3 letterhead footer raster (contact strip from corporate Word template). */
export const E3_LETTERHEAD_FOOTER_SRC = "/brand/e3-letterhead-footer.jpg";

/** @deprecated Prefer full letterhead header; kept for any residual mark-only use. */
export const E3_BRAND_MARK_SRC = "/brand/e3-mark.svg";

/**
 * Official E3 letterhead for OT print/preview and other HR docs that share it.
 * Renders the exact corporate header artwork from the letterhead source document.
 *
 * `tag` / `tagKey` are retained for call-site compatibility; department text is not
 * drawn on the official header (the form body carries department fields).
 */
export function E3DocumentLetterhead({
  className,
}: {
  /** i18n key under the company name (default: Operations). Ignored with official header art. */
  tagKey?: string;
  /** Optional department/label. Ignored with official header art. */
  tag?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <header className={cn("e3-letterhead w-full", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset; img prints more reliably than next/image */}
      <img
        src={E3_LETTERHEAD_HEADER_SRC}
        alt={t("hr.ot.print.company")}
        width={1595}
        height={268}
        className="e3-letterhead-header h-auto w-full object-contain object-left"
      />
    </header>
  );
}

export function E3DocumentFooter({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <footer className={cn("e3-letterhead-footer mt-6 w-full", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset; img prints more reliably than next/image */}
      <img
        src={E3_LETTERHEAD_FOOTER_SRC}
        alt={t("hr.ot.print.footer")}
        width={1600}
        height={174}
        className="h-auto w-full object-contain object-left"
      />
    </footer>
  );
}
