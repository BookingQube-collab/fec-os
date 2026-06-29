"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useComplianceExpiryNotifications } from "@/hooks/queries/useComplianceExpiryNotifications";
import { canViewComplianceExpiryAlerts } from "@/lib/compliance/compliance-expiry-access";
import { useUserRoles } from "@/hooks/use-auth";
import type { AppRole } from "@/lib/rbac";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

type ComplianceExpiryBannerProps = {
  className?: string;
  pathname?: string;
};

export function ComplianceExpiryBanner({ className }: ComplianceExpiryBannerProps) {
  const { t } = useTranslation();
  const roles = useUserRoles() as AppRole[];
  const locationId = useAppStore((s) => s.currentLocationId);

  const eligible = canViewComplianceExpiryAlerts(roles);

  const { data, isLoading } = useComplianceExpiryNotifications(
    { locationId, summaryOnly: true },
    { enabled: eligible },
  );

  if (!eligible || isLoading || !data?.eligible || data.summary.total === 0) {
    return null;
  }

  const { summary } = data;
  const isCritical = summary.expired > 0 || summary.critical > 0;

  let message = t("complianceExpiry.banner.warning", { count: summary.total });
  if (summary.expired > 0 && summary.critical > 0) {
    message = t("complianceExpiry.banner.expiredAndCritical", {
      expired: summary.expired,
      critical: summary.critical,
    });
  } else if (summary.expired > 0) {
    message = t("complianceExpiry.banner.expired", { count: summary.expired });
  } else if (summary.critical > 0) {
    message = t("complianceExpiry.banner.critical", { count: summary.critical });
  }

  return (
    <div
      role="alert"
      className={cn(
        "mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm",
        isCritical
          ? "border-red-200/80 bg-gradient-to-r from-red-50 to-white text-red-900"
          : "border-amber-200/80 bg-gradient-to-r from-amber-50 to-white text-amber-950",
        className,
      )}
    >
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
          isCritical ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700",
        )}
      >
        {isCritical ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t("complianceExpiry.banner.title")}</p>
        <p className="text-xs opacity-90">{message}</p>
      </div>
      <Link
        href="/compliance/expiry-alerts"
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          isCritical
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-amber-500 text-white hover:bg-amber-600",
        )}
      >
        {t("complianceExpiry.banner.viewAll")}
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
