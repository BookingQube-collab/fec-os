"use client";

import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { NeumorphicCard } from "./neumorphic-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ChartWidgetProps {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  menuItems?: { label: string; onClick?: () => void }[];
  className?: string;
}

export function ChartWidget({ title, icon: Icon, children, menuItems, className }: ChartWidgetProps) {
  return (
    <NeumorphicCard className={cn("flex h-full flex-col", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3 px-5 pb-2 pt-5">
        <h3 className="section-kicker min-w-0">
          {Icon ? <Icon strokeWidth={1.5} /> : null}
          <span className="truncate">{title}</span>
        </h3>
        {menuItems && menuItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Chart menu">
                <MoreHorizontal className="stroke-[1.5]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menuItems.map((item) => (
                <DropdownMenuItem key={item.label} onClick={item.onClick}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </NeumorphicCard>
  );
}
