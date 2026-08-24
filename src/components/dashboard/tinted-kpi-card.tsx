import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

import {
  KPI_ICON_CLASS,
  KPI_TINT_CLASS,
  type KpiTint,
} from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

export type { KpiTint };

export function TintedKpiCard({
  title,
  value,
  hint,
  icon: Icon,
  tint,
  empty,
  compact,
  className,
  href,
  viewLabel,
  ariaLabel,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tint: KpiTint;
  empty?: boolean;
  compact?: boolean;
  className?: string;
  href?: string;
  viewLabel?: string;
  ariaLabel?: string;
}) {
  const card = (
    <div
      className={cn(
        "rounded-2xl border shadow-[0_4px_20px_rgba(0,0,0,0.05)]",
        compact ? "px-4 py-3" : "px-5 py-4",
        KPI_TINT_CLASS[tint],
        empty && "opacity-80",
        href && "transition-all hover:-translate-y-0.5 hover:shadow-elevated-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p
            className={cn(
              "mt-1.5 font-bold tracking-tight text-foreground tabular-nums",
              compact ? "text-xl" : "text-2xl",
            )}
          >
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          {href ? (
            <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {viewLabel}
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
            </p>
          ) : null}
        </div>
        {Icon ? (
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", KPI_ICON_CLASS[tint])}>
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? viewLabel ?? title}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      {card}
    </Link>
  );
}
