import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FecSectionProps {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  kicker?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
}

/** One-job content section with optional kicker/title row. */
export function FecSection({ children, className, title, kicker, icon: Icon, actions }: FecSectionProps) {
  return (
    <section className={cn("min-w-0 space-y-3", className)}>
      {title || kicker || actions ? (
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
      ) : null}
      {children}
    </section>
  );
}
