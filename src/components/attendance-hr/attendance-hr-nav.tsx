"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  Building2,
  ClipboardList,
  FingerprintPattern,
  LayoutDashboard,
  List,
  MapPinned,
  Settings,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { visibleAttendanceNavHrefs } from "@/lib/attendance-listing-access";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/people/attendance": LayoutDashboard,
  "/people/attendance/import": Upload,
  "/people/attendance/reports": List,
  "/people/attendance/mapping": MapPinned,
  "/people/attendance/device-logs": FingerprintPattern,
  "/people/attendance/settings": Settings,
};

/** Same destinations as sidebar `hr-attendance` group — path routes, not query tabs. */
const TABS = [
  { href: "/people/attendance", labelKey: "nav.attendanceDashboard", shortKey: "nav.attendanceDashboard" },
  { href: "/people/attendance/import", labelKey: "nav.attendanceImport", shortKey: "nav.attendanceImport" },
  { href: "/people/attendance/reports", labelKey: "nav.attendanceListing", shortKey: "nav.attendanceListingShort" },
  { href: "/people/attendance/mapping", labelKey: "nav.attendanceMapping", shortKey: "nav.attendanceMapping" },
  { href: "/people/attendance/device-logs", labelKey: "nav.attendanceDeviceLogs", shortKey: "nav.attendanceDeviceLogsShort" },
  { href: "/people/attendance/settings", labelKey: "nav.attendanceDevices", shortKey: "nav.attendanceDevicesShort" },
] as const;

export function AttendanceHrNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const roles = useUserRoles();
  const { profile } = useAuth();
  const { hasDirectReports } = useHasDirectReports();
  const visible = new Set(
    visibleAttendanceNavHrefs(
      roles,
      hasDirectReports,
      profile?.job_title,
      profile?.department,
      profile?.staff_role,
    ),
  );
  const tabs = TABS.filter((tab) => visible.has(tab.href));
  return (
    <PillTabScroller label={t("attendanceHr.title")}>
      {tabs.map((tab) => {
        const active =
          tab.href === "/people/attendance" ? pathname === tab.href : pathname.startsWith(tab.href);
        const Icon = NAV_ICONS[tab.href] ?? ClipboardList;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={pillTabItemClass(active)}
          >
            <Icon aria-hidden />
            <span className="sm:hidden">{t(tab.shortKey)}</span>
            <span className="hidden sm:inline">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </PillTabScroller>
  );
}

export function AttendanceHrSitesHint() {
  return (
    <p className="hidden text-xs text-muted-foreground md:block">
      <Building2 className="mr-1 inline h-3.5 w-3.5" />
      InflataPark City Center · Kids Driving School City Center · Urban Arena Doha Mall · Kids Mini Doha Mall ·
      Carousel Aspire Park · Crayons &amp; Bricks Vendome · Crayons &amp; Bricks Dar Al Salam · Winter Mirage Vendome
    </p>
  );
}
