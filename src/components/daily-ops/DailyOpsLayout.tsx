"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ClipboardList } from "lucide-react";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecPageHeader, FecSection } from "@/components/fec";
import { DAILY_OPS_NAV_ITEMS } from "@/lib/daily-ops/constants";
import { cn } from "@/lib/utils";

export function DailyOpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <CapabilityGate capability="daily_ops.view" fallback={
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("dailyOps.loading")}
      </div>
    }>
    <div className="space-y-5">
      <FecPageHeader
        icon={ClipboardList}
        title={t("dailyOps.title")}
        subtitle={t("dailyOps.subtitle")}
      />
      <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
        {DAILY_OPS_NAV_ITEMS.map((item) => {
          const active =
            item.href === "/daily-ops"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("filter-chip", active && "filter-chip-active")}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
    </CapabilityGate>
  );
}

export function DailyOpsPageShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <FecSection title={title} actions={actions}>
      {subtitle ? <p className="page-subtitle -mt-1">{subtitle}</p> : null}
      {children}
    </FecSection>
  );
}
