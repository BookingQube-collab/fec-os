"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MobileListCard({
  href,
  title,
  subtitle,
  meta,
  trailing,
  onClick,
  className,
  children,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{title}</div>
          {subtitle ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div> : null}
          {meta ? <div className="mt-1.5 flex flex-wrap gap-1.5">{meta}</div> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      {children ? <div className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">{children}</div> : null}
    </>
  );

  const classes = cn(
    "block w-full rounded-xl border border-border/80 bg-card p-3 text-start shadow-none transition-[color,background-color,transform] duration-100 md:shadow-elevated-xs",
    (href || onClick) &&
      "touch-manipulation hover:bg-secondary/40 active:scale-[0.985] active:bg-secondary/60",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {body}
      </button>
    );
  }

  return <div className={classes}>{body}</div>;
}
