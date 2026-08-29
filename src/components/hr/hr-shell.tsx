"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface HrShellProps {
  children: ReactNode;
  className?: string;
  /** Tighter spacing for dense admin tables */
  dense?: boolean;
}

/**
 * Light HR page scope — same cream / mustard / charcoal tokens as the rest of FEC-OS.
 * No atmosphere mesh or divergent “product skin”; keeps spacing helpers only.
 */
export function HrShell({ children, className, dense }: HrShellProps) {
  return (
    <div className={cn("hr-shell", dense && "hr-shell--dense", className)}>
      <div className="hr-shell__content">{children}</div>
    </div>
  );
}
