import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface-card p-5", className)}>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {subtitle ? <p className="mt-1 text-label">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function ChartEmpty({ label, className }: { label: string; className?: string }) {
  return (
    <p className={cn("flex h-56 items-center justify-center text-sm text-muted-foreground", className)}>
      {label}
    </p>
  );
}
