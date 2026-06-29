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
        "rounded-[32px] border border-white/60 bg-white shadow-sm",
        !noPadding && "p-5 md:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
