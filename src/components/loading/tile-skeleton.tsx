"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Card/panel-shaped ASCII surface — loading lives on the tile, not in a
 * detached loader chrome. Prefer this (or grids below) over FecLoader page blocks.
 */
export function TileSkeleton({
  className,
  animate = true,
  "aria-hidden": ariaHidden,
}: {
  className?: string;
  animate?: boolean;
  "aria-hidden"?: boolean | "true" | "false";
}) {
  return (
    <Skeleton
      aria-hidden={ariaHidden}
      animate={animate}
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elevated-xs",
        className,
      )}
    />
  );
}

/** KPI / metric card grid — N tiles matching the real card layout. */
export function KpiTileSkeletonGrid({
  count = 4,
  className,
  tileClassName = "h-[5.5rem]",
  columnsClassName = "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
}: {
  count?: number;
  className?: string;
  tileClassName?: string;
  /** Override grid columns to mirror the destination KPI layout. */
  columnsClassName?: string;
}) {
  return (
    <div className={cn(columnsClassName, className)} role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <TileSkeleton key={i} className={tileClassName} animate={i < 8} />
      ))}
    </div>
  );
}

/** List/table row tiles inside an existing panel (e.g. Team today). */
export function ListRowTileSkeleton({
  count = 5,
  className,
  rowClassName = "h-10",
}: {
  count?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <ul
      className={cn("divide-y divide-border/30", className)}
      role="status"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="px-3 py-2.5 sm:px-4">
          <Skeleton
            animate={i < 6}
            className={cn(
              "w-full overflow-hidden rounded-lg border border-border/40 bg-card/70",
              rowClassName,
            )}
          />
        </li>
      ))}
    </ul>
  );
}

/** Generic card-grid section placeholder (charts, panels, feature cards). */
export function PanelTileSkeletonGrid({
  count = 4,
  className,
  tileClassName = "h-52",
  columnsClassName = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
}: {
  count?: number;
  className?: string;
  tileClassName?: string;
  columnsClassName?: string;
}) {
  return (
    <div className={cn(columnsClassName, className)} role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <TileSkeleton key={i} className={tileClassName} animate={i < 6} />
      ))}
    </div>
  );
}
