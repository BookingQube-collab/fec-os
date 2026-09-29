import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({
  count = 6,
  className,
  label,
}: {
  count?: number;
  className?: string;
  label: string;
}) {
  return (
    <div role="status" aria-label={label} className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-[7.25rem] rounded-[var(--radius)]" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <p className={cn("px-4 py-6 text-sm text-muted-foreground", className)}>{title}</p>
  );
}

export function StatusCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
