"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { useUserRoles } from "@/hooks/use-auth";
import { canUserDo } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { MAINTENANCE_WEEKLY_REPORTS_NAV_ITEMS } from "@/lib/maintenance-weekly-reports/constants";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

export function MaintenanceWeeklyReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const canSubmitMaintenance = usePermission("maintenance.weekly_report.submit");
  const canSubmitLogistics = usePermission("maintenance.logistics_submit");
  const canSubmit = canSubmitMaintenance || canSubmitLogistics;
  const canReview = usePermission("maintenance.weekly_report.review");
  const canExecutive = usePermission("maintenance.weekly_report.executive");
  const roles = useUserRoles();
  const hasAccess = (
    [
      "maintenance.weekly_report",
      "maintenance.weekly_report.submit",
      "maintenance.logistics_submit",
      "maintenance.weekly_report.review",
      "maintenance.weekly_report.executive",
    ] as const
  ).some((cap) => canUserDo(roles, cap));
  const showLayoutNewButton =
    canSubmit &&
    pathname !== "/maintenance/weekly-report" &&
    !pathname.startsWith("/maintenance/weekly-report/new");

  const navItems = MAINTENANCE_WEEKLY_REPORTS_NAV_ITEMS.filter((item) => {
    if ("capability" in item && item.capability === "maintenance.weekly_report.review") return canReview;
    if ("capability" in item && item.capability === "maintenance.weekly_report.executive") return canExecutive;
    return true;
  });

  if (!hasAccess) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("maintenanceWeeklyReports.noAccess")}
      </div>
    );
  }

  return (
      <div className="space-y-5 font-sans">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0B1F3A]">
            {t("maintenanceWeeklyReports.title")}
          </h1>
          <p className="mt-1 text-sm text-[#475569]">{t("maintenanceWeeklyReports.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const staticRoutes = ["/review", "/executive", "/new", "/kpis"];
              const active =
                item.href === "/maintenance/weekly-report"
                  ? pathname === item.href ||
                    (/^\/maintenance\/weekly-report\/[^/]+$/.test(pathname) &&
                      !staticRoutes.some((s) => pathname === `/maintenance/weekly-report${s}` || pathname.startsWith(`/maintenance/weekly-report${s}/`)))
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
              <Link href="/maintenance/weekly-report/new">
                <Plus className="me-1 h-4 w-4" />
                {t("maintenanceWeeklyReports.list.newReport")}
              </Link>
            </Button>
          )}
        </div>
        {children}
      </div>
  );
}
