"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { BitsShine } from "@/components/layout/bits-shine";
import FadeContent from "@/components/react-bits/fade-content";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon?: LucideIcon;
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** When set with overflow, phone shows primary + overflow instead of the full actions row. */
  primaryAction?: ReactNode;
  /** Secondary actions for phone (typically a More menu). Desktop still uses `actions`. */
  overflow?: ReactNode;
}

export function PageHeader({
  icon: Icon,
  kicker,
  title,
  subtitle,
  actions,
  className,
  primaryAction,
  overflow,
}: PageHeaderProps) {
  const useMobileSplit = Boolean(primaryAction || overflow);

  return (
    <header
      className={cn(
        // Always stack below md: a shared row lets wide action buttons starve the
        // title flex child (basis 0 / min-content) into ~1ch letter columns.
        "flex w-full min-w-0 max-w-full flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4",
        className,
      )}
    >
      <div className="flex w-full min-w-0 items-start gap-3 md:max-w-[min(100%,36rem)] md:flex-1">
        {Icon ? (
          <span className="icon-well icon-well-lg mt-0.5 shrink-0" aria-hidden>
            <Icon strokeWidth={1.5} />
          </span>
        ) : null}
        <div className="min-w-0 w-full flex-1">
          {kicker ? (
            <p className="section-kicker mb-1.5">
              <BitsShine text={kicker} color="#6b6560" shineColor="#1a1a1a" speed={6} />
            </p>
          ) : null}
          {typeof title === "string" ? (
            <h1 className="page-title min-w-0 max-w-full">
              <BitsShine text={title} className="w-full" />
            </h1>
          ) : (
            <FadeContent blur duration={1.15} threshold={0.01}>
              <h1 className="page-title min-w-0 max-w-full">{title}</h1>
            </FadeContent>
          )}
          {subtitle ? (
            <p className="page-subtitle min-w-0 max-w-full line-clamp-2 md:line-clamp-none">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {useMobileSplit ? (
        <>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:hidden">
            {primaryAction}
            {overflow}
          </div>
          {actions ? (
            <div className="hidden min-w-0 shrink-0 flex-wrap items-center gap-3 pt-0.5 md:flex">
              {actions}
            </div>
          ) : null}
        </>
      ) : actions ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3 pt-0.5 md:w-auto md:shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
