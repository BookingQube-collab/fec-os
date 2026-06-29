"use client";

import { CheckCircle2, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface WeeklyReportFormSectionProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complete?: boolean;
  accent?: "blue" | "cyan" | "purple" | "green" | "amber" | "red" | "none";
  children: ReactNode;
  className?: string;
}

export function WeeklyReportFormSection({
  title,
  subtitle,
  open,
  onOpenChange,
  complete,
  accent = "blue",
  children,
  className,
}: WeeklyReportFormSectionProps) {
  return (
    <NeumorphicCard accent={accent} className={cn("p-4 md:p-5", className)}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="group flex w-full items-start justify-between gap-3 text-left">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold text-[#0B1F3A]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-[#64748B]">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {complete && <CheckCircle2 className="h-5 w-5 text-[#22C55E]" aria-hidden />}
            <ChevronDown
              className={cn(
                "h-5 w-5 text-[#94A3B8] transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
      </Collapsible>
    </NeumorphicCard>
  );
}
