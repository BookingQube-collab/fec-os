"use client";

import { AsciiSkeleton } from "ascii-reveal";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export type FecLoaderDensity = "chip" | "page";

export interface FecLoaderProps {
  className?: string;
  /** Visible label. Defaults to the `common.loading` translation. */
  label?: string;
  /**
   * sm → chip. md and lg → page.
   * Prefer `density` at new call sites.
   */
  size?: "sm" | "md" | "lg";
  /** chip: inline refresh. page: route and full-section waits. */
  density?: FecLoaderDensity;
}

/**
 * ASCII glyph loader (ascii-reveal). Chip for inline refreshes; page for section waits.
 */
export function FecLoader({ className, label, size = "md", density }: FecLoaderProps) {
  const { t } = useTranslation();
  const resolved: FecLoaderDensity = density ?? (size === "sm" ? "chip" : "page");
  const text = label ?? t("common.loading");

  if (resolved === "page") {
    return (
      <div
        className={cn(
          "flex w-fit max-w-full flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4 text-muted-foreground shadow-elevated-sm",
          className,
        )}
        role="status"
        aria-live="polite"
        aria-label={text}
      >
        <AsciiSkeleton variant="scan" lines={3} widths={["12rem", "10rem", "8rem"]} seed={3} />
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{text}</span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1.5 text-muted-foreground shadow-elevated-xs",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <AsciiSkeleton variant="scan" lines={1} widths={["5.5rem"]} seed={7} className="min-w-[5.5rem]" />
      <span className="text-[11px] font-medium tracking-wide">{text}</span>
    </span>
  );
}
