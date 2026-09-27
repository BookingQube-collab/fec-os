import type { ReactNode } from "react";

import { PAGE_STACK } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

export interface FecPageProps {
  children: ReactNode;
  className?: string;
}

/** Page stack spacing. Motion lives on the header and stat cards, not the whole page. */
export function FecPage({ children, className }: FecPageProps) {
  return <div className={cn(PAGE_STACK, "min-w-0", className)}>{children}</div>;
}
