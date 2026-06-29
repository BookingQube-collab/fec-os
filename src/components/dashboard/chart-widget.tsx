"use client";

import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { NeumorphicCard } from "./neumorphic-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChartWidgetProps {
  title: string;
  children: ReactNode;
  menuItems?: { label: string; onClick?: () => void }[];
  className?: string;
}

export function ChartWidget({ title, children, menuItems, className }: ChartWidgetProps) {
  return (
    <NeumorphicCard className={className}>
      <div className="flex items-center justify-between border-b border-[#EEF0FF] px-5 py-4">
        <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
        {menuItems && menuItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-full p-1.5 text-[#9CA3AF] hover:bg-[#EEF0FF]">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-white/60 bg-white">
              {menuItems.map((item) => (
                <DropdownMenuItem key={item.label} onClick={item.onClick}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="p-4">{children}</div>
    </NeumorphicCard>
  );
}
