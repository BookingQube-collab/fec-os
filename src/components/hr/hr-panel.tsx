import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface HrPanelProps {
  children: ReactNode;
  className?: string;
  /** Skip outer bezel — use for nested / table shells */
  flat?: boolean;
  /** Stagger index for entry animation (0-based) */
  delay?: number;
}

/** Shared surface panel for HR content blocks (aligned with surface-card). */
export function HrPanel({ children, className, flat, delay }: HrPanelProps) {
  const style: CSSProperties | undefined =
    delay != null ? ({ ["--hr-delay" as string]: `${delay * 40}ms` } as CSSProperties) : undefined;

  return (
    <div
      className={cn("hr-panel hr-enter", flat && "hr-panel--flat", className)}
      style={style}
    >
      {children}
    </div>
  );
}
