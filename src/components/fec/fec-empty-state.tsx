"use client";

import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import FadeContent from "@/components/react-bits/fade-content";
import StarBorder from "@/components/react-bits/star-border";
import { cn } from "@/lib/utils";

export interface FecEmptyStateProps {
  message: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}

/** Empty state with a one-time React Bits FadeContent blur. */
export function FecEmptyState({
  message,
  hint,
  icon: Icon = Inbox,
  className,
}: FecEmptyStateProps) {
  return (
    <FadeContent blur duration={0.7} threshold={0.05} className={cn("hr-empty", className)}>
      <StarBorder color="#6d4aff" speed="7s" thickness={3} aria-hidden>
        <span className="hr-empty__icon">
          <Icon strokeWidth={1.4} />
        </span>
      </StarBorder>
      <p className="hr-empty__message">{message}</p>
      {hint ? <p className="hr-empty__hint">{hint}</p> : null}
    </FadeContent>
  );
}
