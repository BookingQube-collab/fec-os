import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface DashboardPanelProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function DashboardPanel({ children, className, noPadding }: DashboardPanelProps) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] border border-border/50 bg-card shadow-elevated-sm",
        !noPadding && "p-5 md:p-7",
        className,
      )}
    >
      {children}
    </div>
  );
}
