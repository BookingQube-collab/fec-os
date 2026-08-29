import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

interface HrSectionProps {
  icon?: LucideIcon;
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Standard HR page chrome: refined header + stacked content. */
export function HrSection({ icon, kicker, title, subtitle, actions, children, className }: HrSectionProps) {
  return (
    <div className={cn("hr-section space-y-6", className)}>
      <div className="hr-header hr-enter">
        <PageHeader icon={icon} kicker={kicker} title={title} subtitle={subtitle} actions={actions} />
      </div>
      {children}
    </div>
  );
}
