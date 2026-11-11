"use client";

import {
  KpiTileSkeletonGrid,
  PanelTileSkeletonGrid,
  TileSkeleton,
} from "@/components/loading/tile-skeleton";

export type RouteLoadingVariant =
  | "dashboard"
  | "table"
  | "grid"
  | "e3"
  | "dailyOps"
  | "occ";

interface RouteLoadingSkeletonProps {
  variant?: RouteLoadingVariant;
}

/**
 * Route Suspense fallback: destination-shaped tile grids with ASCII fill.
 * No separate page loader chip/card — loading lives on the tiles themselves.
 */
function RouteLoadingBody({ variant = "dashboard" }: RouteLoadingSkeletonProps) {
  switch (variant) {
    case "occ":
      return (
        <div className="space-y-4">
          <KpiTileSkeletonGrid
            count={3}
            tileClassName="h-10 w-24"
            columnsClassName="flex flex-wrap gap-3 [&>*]:w-auto [&>*]:max-w-[7rem]"
          />
          <PanelTileSkeletonGrid
            count={6}
            tileClassName="h-40"
            columnsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          />
        </div>
      );
    case "e3":
    case "dailyOps":
      return (
        <div className="space-y-4">
          <KpiTileSkeletonGrid
            count={4}
            tileClassName="h-20"
            columnsClassName="grid grid-cols-2 gap-3 sm:grid-cols-4"
          />
          <TileSkeleton className="h-64 w-full" />
        </div>
      );
    case "table":
      return (
        <div className="space-y-4">
          <KpiTileSkeletonGrid
            count={3}
            tileClassName="h-16"
            columnsClassName="grid gap-3 sm:grid-cols-3"
          />
          <TileSkeleton className="h-[24rem] w-full" />
        </div>
      );
    case "grid":
      return (
        <PanelTileSkeletonGrid
          count={6}
          tileClassName="h-36"
          columnsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        />
      );
    case "dashboard":
    default:
      return (
        <div className="space-y-4 p-1">
          <KpiTileSkeletonGrid
            count={4}
            tileClassName="h-28"
            columnsClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          />
          <TileSkeleton className="h-56 w-full" />
          <PanelTileSkeletonGrid
            count={2}
            tileClassName="h-52"
            columnsClassName="grid gap-4 lg:grid-cols-2"
          />
        </div>
      );
  }
}

export function RouteLoadingSkeleton({ variant = "dashboard" }: RouteLoadingSkeletonProps) {
  return (
    <div
      className="grid gap-4"
      role="status"
      aria-busy="true"
      data-route-loading=""
    >
      <RouteLoadingBody variant={variant} />
    </div>
  );
}
