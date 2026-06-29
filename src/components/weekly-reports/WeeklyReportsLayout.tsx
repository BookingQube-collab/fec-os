"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { Button } from "@/components/ui/button";
import { WEEKLY_REPORTS_NAV_ITEMS } from "@/lib/weekly-reports/constants";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

export function WeeklyReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const canSubmit = usePermission("weekly_reports.submit");
  const canReview = usePermission("weekly_reports.review");
  const canExecutive = usePermission("weekly_reports.executive");
  const showLayoutNewButton =
    canSubmit &&
    pathname !== "/operations/weekly-reports" &&
    pathname !== "/operations/weekly-reports/new";

  const navItems = WEEKLY_REPORTS_NAV_ITEMS.filter((item) => {
    if ("capability" in item && item.capability === "weekly_reports.review") return canReview;
    if ("capability" in item && item.capability === "weekly_reports.executive") return canExecutive;
    return true;
  });

  return (
    <CapabilityGate
      capability="weekly_reports.view"
      fallback={
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("weeklyReports.noAccess")}
        </div>
      }
    >
      <div className="space-y-5 font-sans">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0B1F3A]">{t("weeklyReports.title")}</h1>
          <p className="mt-1 text-sm text-[#475569]">{t("weeklyReports.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const active =
                item.href === "/operations/weekly-reports"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-[#0B1F3A] text-white" : "text-[#0B1F3A] hover:bg-[#F2F4F7] hover:text-[#E8821E]",
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
          {showLayoutNewButton && (
            <Button asChild size="sm">
              <Link href="/operations/weekly-reports/new">
                <Plus className="me-1 h-4 w-4" />
                {t("weeklyReports.list.newReport")}
              </Link>
            </Button>
          )}
        </div>
        {children}
      </div>
    </CapabilityGate>
  );
}
