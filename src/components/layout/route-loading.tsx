import { Skeleton } from "@/components/ui/skeleton";

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
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className={`h-4 max-w-full ${wideSubtitle ? "w-96" : "w-72"}`} />
      </div>
      <Skeleton className="h-9 w-28 rounded-full" />
    </div>
  );
}

export function RouteLoadingSkeleton({ variant = "dashboard" }: RouteLoadingSkeletonProps) {
  switch (variant) {
    case "occ":
      return (
        <div className="space-y-6">
          <PageHeaderSkeleton />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        </div>
      );
    case "e3":
    case "dailyOps":
      return (
        <div className="space-y-4">
          <PageHeaderSkeleton wideSubtitle />
          <Skeleton className="h-10 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      );
    case "table":
      return (
        <div className="space-y-4">
          <PageHeaderSkeleton />
          <Skeleton className="h-10 w-full max-w-md rounded-full" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      );
    case "grid":
      return (
        <div className="space-y-4">
          <PageHeaderSkeleton />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
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
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-56 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
        </div>
      );
  }
}
