import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { InteractiveCard } from "@/components/ds/app-card";
import { KPI_ICON_CLASS, KPI_TINT_CLASS, type KpiTint } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

export type MetricTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_TINT: Record<MetricTone, KpiTint> = {
  neutral: "slate",
  success: "green",
  warning: "amber",
  danger: "red",
  info: "sky",
};

export function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
  empty,
  pulse,
  className,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: MetricTone;
  href?: string;
  empty?: boolean;
  /** Critical status only. The number stays visible without the pulse. */
  pulse?: boolean;
  className?: string;
}) {
  const tint = TONE_TINT[tone];
  const body = (
    <div
      className={cn(
        "rounded-[var(--radius)] border px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)]",
        KPI_TINT_CLASS[tint],
        empty && "opacity-80",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <span
            className={cn(
              "relative grid h-10 w-10 shrink-0 place-items-center rounded-full",
              KPI_ICON_CLASS[tint],
            )}
          >
            {pulse ? (
              <span
                className="ds-pulse absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--status-critical)]"
                aria-hidden
              />
            ) : null}
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!href) return body;

  return (
    <InteractiveCard>
      <Link
        href={href}
        className="block rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {body}
      </Link>
    </InteractiveCard>
  );
}
