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
  /** When set with overflow, phone/tablet shows primary + overflow instead of the full actions row. */
  primaryAction?: ReactNode;
  /** Secondary actions for phone/tablet (typically a More menu). Desktop still uses `actions`. */
  overflow?: ReactNode;
}

/**
 * Page chrome. Stack title then actions below `lg` so the desktop button strip
 * cannot sit beside the title while MobileBottomNav is still visible (`lg:hidden`).
 * `md` is too early: 768–1023 still shows phone chrome and crushes letter-columns.
 */
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
  const useCompactActions = Boolean(primaryAction || overflow);
  const stringTitle = typeof title === "string" ? title : null;

  return (
    <header
      className={cn(
        // Outer shell is always a column under lg — never title|actions side-by-side
        // while the bottom nav phone chrome is still on screen.
        "flex w-full min-w-0 max-w-full flex-col gap-3",
        className,
      )}
    >
      <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
        <div className="flex w-full min-w-0 items-start gap-3 lg:max-w-[min(100%,36rem)] lg:flex-1">
          {Icon ? (
            <span className="icon-well icon-well-lg mt-0.5 shrink-0" aria-hidden>
              <Icon strokeWidth={1.5} />
            </span>
          ) : null}
          <div className="w-full min-w-0 flex-1">
            {kicker ? (
              <p className="section-kicker mb-1.5">
                <span className="lg:hidden">{kicker}</span>
                <span className="hidden lg:inline">
                  <BitsShine text={kicker} color="#6b6560" shineColor="#1a1a1a" speed={6} />
                </span>
              </p>
            ) : null}
            {stringTitle ? (
              <h1 className="page-title w-full min-w-0 max-w-full">
                {/* Plain text under lg — readable beats shiny when width is tight. */}
                <span className="block w-full min-w-0 lg:hidden">{stringTitle}</span>
                <span className="hidden lg:block">
                  <BitsShine text={stringTitle} className="block w-full" />
                </span>
              </h1>
            ) : (
              <FadeContent blur duration={1.15} threshold={0.01}>
                <h1 className="page-title w-full min-w-0 max-w-full">{title}</h1>
              </FadeContent>
            )}
            {subtitle ? (
              <p className="page-subtitle hidden w-full min-w-0 max-w-full sm:line-clamp-2 sm:block lg:line-clamp-none">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {useCompactActions ? (
          actions ? (
            <div className="hidden min-w-0 shrink-0 flex-wrap items-center gap-3 pt-0.5 lg:flex">
              {actions}
            </div>
          ) : null
        ) : actions ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-3 pt-0.5 lg:w-auto lg:shrink-0">
            {actions}
          </div>
        ) : null}
      </div>

      {useCompactActions ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:hidden">
          {primaryAction}
          {overflow}
        </div>
      ) : null}
    </header>
  );
}
