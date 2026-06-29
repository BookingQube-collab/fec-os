"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className,
  onOpenChange,
}: CollapsibleSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} onOpenChange={onOpenChange} className={className}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-2xl px-1 py-2 text-left">
        <h2 className="text-base font-semibold text-[#111827]">{title}</h2>
        <ChevronDown className="h-5 w-5 text-[#9CA3AF] transition-transform duration-150 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("pt-4")}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
