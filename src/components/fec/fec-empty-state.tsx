import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FecEmptyStateProps {
  message: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}

/** Normalized empty state (hr-empty tokens) — app-wide alias of HrEmptyState pattern. */
export function FecEmptyState({
  message,
  hint,
  icon: Icon = Inbox,
  className,
}: FecEmptyStateProps) {
  return (
    <div className={cn("hr-empty", className)}>
      <span className="hr-empty__icon" aria-hidden>
        <Icon strokeWidth={1.4} />
      </span>
      <p className="hr-empty__message">{message}</p>
      {hint ? <p className="hr-empty__hint">{hint}</p> : null}
    </div>
  );
}
