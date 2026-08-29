import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

interface HrEmptyStateProps {
  message: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}

export function HrEmptyState({ message, hint, icon: Icon = Inbox, className }: HrEmptyStateProps) {
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
