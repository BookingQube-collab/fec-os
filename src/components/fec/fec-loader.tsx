"use client";

import { useTranslation } from "react-i18next";

import { PageSkeleton } from "@/components/loading/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
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
  /**
   * chip: tiny inline ASCII fill (no floating loader chrome).
   * page: section tile-grid ASCII placeholders (mirrors card layouts).
   */
  density?: FecLoaderDensity;
}

/**
 * ASCII loading placeholder. Page density paints tile-shaped surfaces;
 * chip density is a compact inline fill — never a detached loader card.
 */
export function FecLoader({ className, label, size = "md", density }: FecLoaderProps) {
  const { t } = useTranslation();
  const resolved: FecLoaderDensity = density ?? (size === "sm" ? "chip" : "page");
  const text = label ?? t("common.loading");

  if (resolved === "page") {
    return (
      <div
        className={cn("w-full min-w-0", className)}
        role="status"
        aria-live="polite"
        aria-label={text}
      >
        <span className="sr-only">{text}</span>
        <PageSkeleton rows={6} />
      </div>
    );
  }

  return (
    <span
      className={cn("inline-flex max-w-full items-center", className)}
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <Skeleton className="h-5 w-[5.5rem] overflow-hidden rounded-md" />
      <span className="sr-only">{text}</span>
    </span>
  );
}
