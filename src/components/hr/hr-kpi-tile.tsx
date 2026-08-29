import Link from "next/link";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type HrKpiTone = "charcoal" | "mustard" | "cream" | "alert" | "ok" | "info";

const TONE_CLASS: Record<HrKpiTone, string> = {
  charcoal: "hr-kpi--charcoal",
  mustard: "hr-kpi--mustard",
  cream: "hr-kpi--cream",
  alert: "hr-kpi--alert",
  ok: "hr-kpi--ok",
  info: "hr-kpi--info",
};

interface HrKpiTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  href?: string;
  tone?: HrKpiTone;
  className?: string;
  /** Grid span helpers for asymmetric bento */
  span?: "default" | "wide" | "tall";
  delay?: number;
}

export function HrKpiTile({
  label,
  value,
  icon: Icon,
  href,
  tone = "cream",
  className,
  span = "default",
  delay,
}: HrKpiTileProps) {
  const body = (
    <div
      className={cn(
        "hr-kpi hr-enter",
        TONE_CLASS[tone],
        span === "wide" && "hr-kpi--wide",
        span === "tall" && "hr-kpi--tall",
        className,
      )}
      style={
        delay != null ? ({ ["--hr-delay" as string]: `${delay * 45}ms` } as CSSProperties) : undefined
      }
    >
      <div className="hr-kpi__meta">
        <p className="hr-kpi__label">{label}</p>
        <p className="hr-kpi__value">{value}</p>
      </div>
      {Icon ? (
        <span className="hr-kpi__icon" aria-hidden>
          <Icon strokeWidth={1.5} />
        </span>
      ) : null}
    </div>
  );

  if (!href) return body;

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hr-ring)]",
        span === "wide" && "hr-kpi--wide",
        span === "tall" && "hr-kpi--tall",
      )}
    >
      {body}
    </Link>
  );
}
