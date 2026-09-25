"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Phone shows `mobile`; tablet+ shows `desktop` (or from `from` breakpoint).
 * Defaults: mobile < md, desktop md+.
 */
export function ResponsiveDataView({
  mobile,
  desktop,
  from = "md",
  className,
}: {
  mobile: ReactNode;
  desktop: ReactNode;
  from?: "md" | "lg";
  className?: string;
}) {
  const hideMobile = from === "lg" ? "lg:hidden" : "md:hidden";
  const showDesktop = from === "lg" ? "hidden lg:block" : "hidden md:block";
  return (
    <div className={className}>
      <div className={cn(hideMobile)}>{mobile}</div>
      <div className={cn(showDesktop)}>{desktop}</div>
    </div>
  );
}
