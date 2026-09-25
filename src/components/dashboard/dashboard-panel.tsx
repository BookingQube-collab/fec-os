"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

const FadeContent = dynamic(() => import("@/components/react-bits/fade-content"), {
  ssr: false,
});

interface DashboardPanelProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
  /** Soft once-on-view fade for shell page content. On by default. */
  fade?: boolean;
}

export function DashboardPanel({ children, className, noPadding, fade = true }: DashboardPanelProps) {
  const panel = (
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

  if (!fade) return panel;
  return (
    <FadeContent duration={0.25} threshold={0.02}>
      {panel}
    </FadeContent>
  );
}
