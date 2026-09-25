"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

import { PAGE_STACK } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

const FadeContent = dynamic(() => import("@/components/react-bits/fade-content"), {
  ssr: false,
});

export interface FecPageProps {
  children: ReactNode;
  className?: string;
  /** Soft once-on-view fade (React Bits FadeContent). Off by default. */
  fade?: boolean;
}

/** Page stack spacing. Optional FadeContent — keep React Bits here, not in every view. */
export function FecPage({ children, className, fade = false }: FecPageProps) {
  const stack = cn(PAGE_STACK, "min-w-0", className);
  if (!fade) return <div className={stack}>{children}</div>;
  return (
    <FadeContent duration={0.25} threshold={0.02} className={stack}>
      {children}
    </FadeContent>
  );
}
