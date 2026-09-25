import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";

export interface FecPageHeaderProps {
  icon?: LucideIcon;
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  withMobile?: boolean;
  primaryAction?: ReactNode;
  overflow?: ReactNode;
}

/** Thin wrap of PageHeader — one place to restyle page chrome. */
export function FecPageHeader({
  withMobile: _withMobile,
  primaryAction: _primaryAction,
  overflow: _overflow,
  ...props
}: FecPageHeaderProps) {
  return <PageHeader {...props} />;
}
