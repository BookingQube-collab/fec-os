"use client";

import { AsciiSkeleton } from "ascii-reveal";

import { FecLoader } from "@/components/fec/fec-loader";

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

function PageHeaderSkeleton({ wideSubtitle = false }: { wideSubtitle?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-2">
        <AsciiSkeleton variant="scan" lines={1} widths={["4rem"]} seed={11} />
        <AsciiSkeleton variant="scan" lines={1} widths={["13rem"]} seed={12} />
        <AsciiSkeleton
          variant="scan"
          lines={1}
          widths={[wideSubtitle ? "24rem" : "18rem"]}
          seed={13}
        />
      </div>
      <AsciiSkeleton variant="braille" rows={2} width="7rem" height="2.25rem" seed={14} />
    </div>
  );
}

function Block({
  height,
  seed,
  className,
}: {
  height: string;
  seed: number;
  className?: string;
}) {
  return (
    <AsciiSkeleton
      variant="dither"
      rows={Math.max(3, Math.round(parseFloat(height) / 12) || 6)}
      width="100%"
      height={height}
      seed={seed}
      className={className}
    />
  );
}

function RouteLoadingBody({ variant = "dashboard" }: RouteLoadingSkeletonProps) {
  switch (variant) {
    case "occ":
      return (
        <div className="space-y-6">
          <PageHeaderSkeleton />
          <div className="flex flex-wrap gap-3">
            <AsciiSkeleton variant="braille" rows={2} width="6rem" height="2rem" seed={21} />
            <AsciiSkeleton variant="braille" rows={2} width="6rem" height="2rem" seed={22} />
            <AsciiSkeleton variant="braille" rows={2} width="6rem" height="2rem" seed={23} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Block key={i} height="10rem" seed={30 + i} className="rounded-2xl" />
            ))}
          </div>
        </div>
      );
    case "e3":
    case "dailyOps":
      return (
        <div className="space-y-4">
          <PageHeaderSkeleton wideSubtitle />
          <Block height="2.5rem" seed={41} className="rounded-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Block key={i} height="5rem" seed={50 + i} className="rounded-2xl" />
            ))}
          </div>
          <Block height="16rem" seed={60} className="rounded-2xl" />
        </div>
      );
    case "table":
      return (
        <div className="space-y-4">
          <PageHeaderSkeleton />
          <AsciiSkeleton variant="scan" lines={1} widths={["20rem"]} seed={71} />
          <Block height="24rem" seed={72} className="rounded-2xl" />
        </div>
      );
    case "grid":
      return (
        <div className="space-y-4">
          <PageHeaderSkeleton />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Block key={i} height="9rem" seed={80 + i} className="rounded-2xl" />
            ))}
          </div>
        </div>
      );
    case "dashboard":
    default:
      return (
        <div className="space-y-4 p-1">
          <PageHeaderSkeleton wideSubtitle />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Block key={i} height="7rem" seed={90 + i} className="rounded-2xl" />
            ))}
          </div>
          <Block height="14rem" seed={100} className="rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Block height="13rem" seed={101} className="rounded-2xl" />
            <Block height="13rem" seed={102} className="rounded-2xl" />
          </div>
        </div>
      );
  }
}

export function RouteLoadingSkeleton({ variant = "dashboard" }: RouteLoadingSkeletonProps) {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-busy="true"
      data-route-loading=""
    >
      <div className="flex justify-center pt-1">
        <FecLoader density="page" />
      </div>
      <RouteLoadingBody variant={variant} />
    </div>
  );
}
