import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface NeumorphicCardProps {
  children: ReactNode;
  className?: string;
  accent?: "blue" | "cyan" | "purple" | "green" | "amber" | "red" | "none";
  glass?: boolean;
}

const accentColors = {
  blue: "bg-[#3B82F6]",
  cyan: "bg-[#06B6D4]",
  purple: "bg-[#8B5CF6]",
  green: "bg-[#22C55E]",
  amber: "bg-[#F59E0B]",
  red: "bg-[#EF4444]",
  none: "",
};

export function NeumorphicCard({ children, className, accent = "none", glass }: NeumorphicCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/80 bg-[#F8FAFF]",
        "shadow-[0_8px_32px_rgba(99,102,241,0.08),0_2px_8px_rgba(15,23,42,0.04)]",
        glass && "bg-white",
        className,
      )}
    >
      {accent !== "none" && (
        <div className={cn("absolute inset-y-4 end-0 w-1.5 rounded-full", accentColors[accent])} />
      )}
      {children}
    </div>
  );
}
