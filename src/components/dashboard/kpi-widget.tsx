import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { CircularProgressBadge } from "./circular-progress-badge";
import { KPI_ICON_CLASS, KPI_TINT_CLASS, widgetAccentToTint } from "@/lib/ui/command-surface";
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
  const tint = widgetAccentToTint(accent);
  const inner = (
    <div
      className={cn(
        "h-full rounded-2xl border px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-elevated-sm",
        KPI_TINT_CLASS[tint],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-label min-w-0 pt-0.5">{title}</p>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", KPI_ICON_CLASS[tint])}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-kpi text-foreground">{value}</span>
            {secondary && <span className="text-xs text-muted-foreground">{secondary}</span>}
          </div>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {progress != null && <CircularProgressBadge value={progress} positive={progressPositive} />}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className={cn("block h-full")}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
