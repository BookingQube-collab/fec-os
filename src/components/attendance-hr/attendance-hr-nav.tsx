"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Same destinations as sidebar `hr-attendance` group — path routes, not query tabs. */
const TABS = [
  { href: "/people/attendance", labelKey: "nav.attendanceDashboard" },
  { href: "/people/attendance/import", labelKey: "nav.attendanceImport" },
  { href: "/people/attendance/reports", labelKey: "nav.attendanceListing" },
  { href: "/people/attendance/mapping", labelKey: "nav.attendanceMapping" },
  { href: "/people/attendance/device-logs", labelKey: "nav.attendanceDeviceLogs" },
  { href: "/people/attendance/corrections", labelKey: "nav.attendanceCorrections" },
  { href: "/people/attendance/settings", labelKey: "nav.attendanceDevices" },
] as const;

export function AttendanceHrNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  return (
    <nav
      className="flex h-11 min-h-11 w-full max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto overflow-y-hidden rounded-full border-0 bg-secondary p-1 text-foreground sm:w-fit"
      aria-label={t("attendanceHr.title")}
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/people/attendance" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-full shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-transparent hover:text-foreground",
            )}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

export function AttendanceHrSitesHint() {
  return (
    <p className="text-xs text-muted-foreground">
      <Building2 className="mr-1 inline h-3.5 w-3.5" />
      InflataPark City Center · Kids Driving School City Center · Urban Arena Doha Mall · Kids Mini Doha Mall ·
      Carousel Aspire Park · Crayons &amp; Bricks Vendome · Crayons &amp; Bricks Dar Al Salam · Winter Mirage Vendome
    </p>
  );
}
