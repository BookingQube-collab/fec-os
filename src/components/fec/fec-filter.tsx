import type { ButtonHTMLAttributes, ReactNode } from "react";

import { FILTER_CHIP, FILTER_CHIP_ACTIVE } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

export interface FecFilterProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

/** filter-chip token — pill toggle for toolbar filters. */
export function FecFilter({ active, className, children, type = "button", ...props }: FecFilterProps) {
  return (
    <button
      type={type}
      className={cn(active ? FILTER_CHIP_ACTIVE : FILTER_CHIP, className)}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  );
}

export function FecFilterGroup({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
