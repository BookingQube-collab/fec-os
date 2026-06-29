"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
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
    <div className="space-y-5 font-sans">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#0B1F3A]">
          {t("dailyOps.title")}
        </h1>
        <p className="mt-1 text-sm text-[#475569]">{t("dailyOps.subtitle")}</p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-[#E2E8F0] pb-3">
        {DAILY_OPS_NAV_ITEMS.map((item) => {
          const active =
            item.href === "/daily-ops"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[#0B1F3A] text-white"
                  : "text-[#0B1F3A] hover:bg-[#F2F4F7] hover:text-[#E8821E]",
              )}
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-[#64748B]">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
