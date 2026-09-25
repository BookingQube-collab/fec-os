import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface FecFormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Grouped form fields with a light title — not a card by default. */
export function FecFormSection({ title, description, children, className }: FecFormSectionProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {title || description ? (
        <div className="space-y-1">
          {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      <div className="space-y-3">{children}</div>
    </div>
  );
}
