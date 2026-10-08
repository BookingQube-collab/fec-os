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
}

export function PageHeader({
  icon: Icon,
  kicker,
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-w-0 max-w-full flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="flex w-full min-w-0 flex-1 basis-full items-start gap-3 sm:w-auto sm:basis-0">
        {Icon ? (
          <span className="icon-well icon-well-lg mt-0.5" aria-hidden>
            <Icon strokeWidth={1.5} />
          </span>
        ) : null}
        <div className="min-w-0">
          {kicker ? (
            <p className="section-kicker mb-1.5">
              <BitsShine text={kicker} color="#6b6560" shineColor="#1a1a1a" speed={6} />
            </p>
          ) : null}
          {typeof title === "string" ? (
            <h1 className="page-title break-words">
              <BitsShine text={title} />
            </h1>
          ) : (
            <FadeContent blur duration={1.15} threshold={0.01}>
              <h1 className="page-title break-words">{title}</h1>
            </FadeContent>
          )}
          {subtitle ? <p className="page-subtitle break-words">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3 pt-0.5 sm:w-auto">{actions}</div>
      ) : null}
    </header>
  );
}
