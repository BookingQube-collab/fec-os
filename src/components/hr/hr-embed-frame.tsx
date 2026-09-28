import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";

/** Full HR page chrome, or just the working panels when mounted inside a staff profile tab. */
export function HrEmbedFrame({
  embedded = false,
  icon,
  kicker,
  title,
  subtitle,
  children,
}: {
  embedded?: boolean;
  icon?: LucideIcon;
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  if (embedded) return <div className="space-y-3">{children}</div>;
  return (
    <HrShell>
      <HrSection icon={icon} kicker={kicker} title={title} subtitle={subtitle}>
        {children}
      </HrSection>
    </HrShell>
  );
}
