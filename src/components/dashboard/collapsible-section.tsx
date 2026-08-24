"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  kicker?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export function CollapsibleSection({
  title,
  kicker,
  children,
  defaultOpen = true,
  className,
  onOpenChange,
}: CollapsibleSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} onOpenChange={onOpenChange} className={className}>
      <CollapsibleTrigger className="group flex w-full flex-col items-start gap-2 rounded-full px-0.5 py-2 text-left">
        {kicker ? <span className="section-kicker mt-0.5 uppercase tracking-wide">{kicker}</span> : null}
        <span className="inline-flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <ChevronDown className="h-5 w-5 shrink-0 stroke-[1.5] text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("pt-3")}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
