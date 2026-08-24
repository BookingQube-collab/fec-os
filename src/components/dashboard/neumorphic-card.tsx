import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface NeumorphicCardProps {
  children: ReactNode;
  className?: string;
  accent?: "blue" | "cyan" | "purple" | "green" | "amber" | "red" | "none";
  glass?: boolean;
}

const accentColors = {
  blue: "bg-[var(--electric)]",
  cyan: "bg-[var(--info)]",
  purple: "bg-primary", /* legacy accent key → charcoal */
  green: "bg-[var(--success)]",
  amber: "bg-[var(--warning)]",
  red: "bg-[var(--danger)]",
  none: "",
};

export function NeumorphicCard({ children, className, accent = "none", glass }: NeumorphicCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] border border-border/45 bg-card",
        "shadow-elevated-xs",
        glass && "bg-card",
        className,
      )}
    >
      {accent !== "none" && (
        <div className={cn("absolute inset-y-3 end-0 w-1 rounded-full", accentColors[accent])} />
      )}
      {children}
    </div>
  );
}
