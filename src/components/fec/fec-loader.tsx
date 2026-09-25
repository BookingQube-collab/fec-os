import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FecLoaderProps {
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
} as const;

/** Inline spinner (Loader2). Pair with FecSkeleton for page placeholders. */
export function FecLoader({ className, label, size = "md" }: FecLoaderProps) {
  return (
    <div
      className={cn("inline-flex items-center justify-center gap-2 text-muted-foreground", className)}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      <Loader2 className={cn("animate-spin", SIZE[size])} aria-hidden />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}
