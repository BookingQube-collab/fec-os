"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

const FadeContent = dynamic(() => import("@/components/react-bits/fade-content"), {
  ssr: false,
});

export interface FecSectionProps {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  kicker?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Soft entrance on phone only; respects reduced-motion via FadeContent. */
  fade?: boolean;
}

/** One-job content section with optional kicker/title row. */
export function FecSection({
  children,
  className,
  title,
  kicker,
  icon: Icon,
  actions,
  fade = false,
}: FecSectionProps) {
  const head =
    title || kicker || actions ? (
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {kicker ? (
            <p className="section-kicker mb-1">
              {Icon ? <Icon strokeWidth={1.5} /> : null}
              <span>{kicker}</span>
            </p>
          ) : Icon ? (
            <p className="section-kicker mb-1">
              <Icon strokeWidth={1.5} />
            </p>
          ) : null}
          {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null;

  const body = (
    <section className={cn("min-w-0 space-y-3", className)}>
      {head}
      {children}
    </section>
  );

  if (!fade) return body;
  return (
    <FadeContent duration={0.35} threshold={0.05}>
      {body}
    </FadeContent>
  );
}
