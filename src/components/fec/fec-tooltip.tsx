"use client";

import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface FecTooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Delay before open (ms). */
  delayDuration?: number;
  contentClassName?: string;
  asChild?: boolean;
}

/** Light shadcn tooltip — keep TooltipProvider local so callers stay simple. */
export function FecTooltip({
  content,
  children,
  side = "top",
  delayDuration = 200,
  contentClassName,
  asChild = true,
}: FecTooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
        <TooltipContent side={side} className={contentClassName}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
