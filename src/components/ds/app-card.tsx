import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AppCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card text-card-foreground shadow-elevated-xs",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Quiet hover scale. No spotlight tracking. */
export function InteractiveCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("ds-hover rounded-[var(--radius)]", className)}>{children}</div>;
}
