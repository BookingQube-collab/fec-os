import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { CircularProgressBadge } from "./circular-progress-badge";
import { NeumorphicCard } from "./neumorphic-card";
import { cn } from "@/lib/utils";

export interface KPIWidgetProps {
  title: string;
  value: string | number;
  secondary?: string;
  icon: LucideIcon;
  progress?: number;
  progressPositive?: boolean;
  accent?: "blue" | "cyan" | "purple" | "green" | "amber" | "red";
  href?: string;
  subtitle?: string;
}

export function KPIWidget({
  title,
  value,
  secondary,
  icon: Icon,
  progress,
  progressPositive,
  accent = "blue",
  href,
  subtitle,
}: KPIWidgetProps) {
  const inner = (
    <NeumorphicCard accent={accent} className="h-full p-5 transition-transform hover:scale-[1.01]">
      <div className="flex items-start justify-between gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]">
          <Icon className="h-5 w-5 text-[#6B7280]" />
        </div>
        {progress != null && <CircularProgressBadge value={progress} positive={progressPositive} />}
      </div>
      <div className="mt-4">
        <p className="text-xs font-medium text-[#6B7280]">{title}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-[#111827]">{value}</span>
          {secondary && <span className="text-sm text-[#9CA3AF]">{secondary}</span>}
        </div>
        {subtitle && <p className="mt-1 text-[11px] text-[#9CA3AF]">{subtitle}</p>}
      </div>
    </NeumorphicCard>
  );

  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}
