"use client";

import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useDeferredQuery } from "@/hooks/use-deferred-query";
import { useDeferredVisible } from "@/hooks/use-deferred-visible";

type DeferredSectionProps = {
  children: ReactNode;
  /** When false, section never mounts children. */
  enabled?: boolean;
  /** Defer until viewport (default) or idle delay. */
  mode?: "viewport" | "idle";
  delayMs?: number;
  fallback?: ReactNode;
  className?: string;
};

export function DeferredSection({
  children,
  enabled = true,
  mode = "viewport",
  delayMs = 2000,
  fallback,
  className,
}: DeferredSectionProps) {
  const { ref, visible } = useDeferredVisible("200px");
  const idleReady = useDeferredQuery(enabled && mode === "idle", delayMs);
  const show = enabled && (mode === "idle" ? idleReady : visible);

  const placeholder = fallback ?? <Skeleton className="h-48 w-full rounded-2xl" />;

  if (mode === "viewport") {
    return (
      <div ref={ref} className={className}>
        {show ? children : placeholder}
      </div>
    );
  }

  return <div className={className}>{show ? children : placeholder}</div>;
}
