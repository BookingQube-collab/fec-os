"use client";

import {
  KpiTileSkeletonGrid,
  PanelTileSkeletonGrid,
  TileSkeleton,
} from "@/components/loading/tile-skeleton";

/**
 * In-page / deferred-section loading: tile grids that mirror card layouts,
 * not a detached full-width loader chrome.
 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  const panelCount = Math.max(2, Math.min(6, Math.ceil(rows / 2)));
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <KpiTileSkeletonGrid count={4} tileClassName="h-28" />
      <PanelTileSkeletonGrid
        count={panelCount}
        tileClassName="h-36"
        columnsClassName="grid gap-3 sm:grid-cols-2"
      />
      {rows > 4 ? <TileSkeleton className="h-48 w-full" animate={false} /> : null}
    </div>
  );
}

/** KPI strip as N card-shaped ASCII tiles (matches TintedKpiCard / dashboard KPIs). */
export function KpiSkeletonStrip({
  count = 4,
  columnsClassName,
  tileClassName = "h-[5.5rem]",
}: {
  count?: number;
  columnsClassName?: string;
  tileClassName?: string;
}) {
  const cols =
    columnsClassName ??
    (count >= 6
      ? "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      : count === 5
        ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4");

  return (
    <KpiTileSkeletonGrid
      count={count}
      columnsClassName={cols}
      tileClassName={tileClassName}
    />
  );
}
