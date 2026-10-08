"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";

/**
 * Standalone HR pages keep their header. Embedded in a tabbed shell, only the tool shows.
 */
export function HrModuleFrame({
  embedded = false,
  icon,
  kicker,
  title,
  subtitle,
  children,
}: {
  embedded?: boolean;
  icon: LucideIcon;
  kicker: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  if (embedded) {
    return <div className="min-w-0 space-y-6">{children}</div>;
  }
  return (
    <HrShell>
      <HrSection icon={icon} kicker={kicker} title={title} subtitle={subtitle}>
        {children}
      </HrSection>
    </HrShell>
  );
}
