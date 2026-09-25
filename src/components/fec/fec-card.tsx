import type { HTMLAttributes } from "react";

import { SURFACE_CARD } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

export interface FecCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Extra padding (default true → p-5). Set false when the section owns its own chrome. */
  padded?: boolean;
}

/** surface-card token wrapper — cream/white elevated panel. */
export function FecCard({ className, padded = true, ...props }: FecCardProps) {
  return (
    <div className={cn(SURFACE_CARD, padded && "p-5", className)} {...props} />
  );
}
