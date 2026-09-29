"use client";

import LatticeLoader from "@/components/react-bits/lattice-loader";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

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

const METRICS = {
  chip: { cell: 4, gap: 1.5, font: 12 },
  page: { cell: 7, gap: 2, font: 15 },
} as const;

/**
 * React Bits lattice, in the app's cream card chrome.
 * One component: a small pill for inline updates, a larger card for page loads.
 */
export function FecLoader({ className, label, size = "md", density }: FecLoaderProps) {
  const { t } = useTranslation();
  const resolved: FecLoaderDensity = density ?? (size === "sm" ? "chip" : "page");
  const metrics = METRICS[resolved];
  const text = label ?? t("common.loading");

  const lattice = (
    <LatticeLoader
      label={text}
      showTimer={false}
      pattern="orbit"
      shape="round"
      cellSize={metrics.cell}
      gap={metrics.gap}
      fontSize={metrics.font}
      color="currentColor"
      idleOpacity={0.28}
    />
  );

  if (resolved === "page") {
    return (
      <div
        className={cn(
          "flex w-fit max-w-full items-center rounded-2xl border border-border bg-card px-5 py-4 text-foreground shadow-elevated-sm",
          className,
        )}
      >
        {lattice}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center rounded-full border border-border/80 bg-card px-3 py-1 text-muted-foreground shadow-elevated-xs",
        className,
      )}
    >
      {lattice}
    </span>
  );
}
