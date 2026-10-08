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
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { useUserRoles } from "@/hooks/use-auth";
import { visibleAttendanceNavHrefs } from "@/lib/attendance-listing-access";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/people/attendance": LayoutDashboard,
  "/people/attendance/import": Upload,
  "/people/attendance/reports": List,
  "/people/attendance/mapping": MapPinned,
  "/people/attendance/device-logs": FingerprintPattern,
  "/people/attendance/corrections": Wrench,
  "/people/attendance/settings": Settings,
};

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
  const roles = useUserRoles();
  const { hasDirectReports } = useHasDirectReports();
  const visible = new Set(visibleAttendanceNavHrefs(roles, hasDirectReports));
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
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </PillTabScroller>
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
