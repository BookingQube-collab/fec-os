"use client";

import LatticeLoader from "@/components/react-bits/lattice-loader";
import { cn } from "@/lib/utils";

export interface FecLoaderProps {
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}

const CELL = { sm: 4, md: 6, lg: 8 } as const;
const FONT = { sm: 12, md: 14, lg: 16 } as const;

/** React Bits Micro Lattice Loader. */
export function FecLoader({ className, label, size = "md" }: FecLoaderProps) {
  return (
    <LatticeLoader
      label={label ?? "Loading"}
      showTimer={false}
      cellSize={CELL[size]}
      fontSize={FONT[size]}
      color="currentColor"
      className={cn("text-muted-foreground", className)}
    />
  );
}
