"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bug,
  CalendarRange,
  Cctv,
  ChefHat,
  FileX,
  Flame,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Award,
  Stamp,
  Store,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { FecPageHeader } from "@/components/fec";
import { E3_NAV_ITEMS } from "@/lib/compliance-tracker/constants";
import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/compliance/e3-tracker": LayoutDashboard,
  "/compliance/e3-tracker/master-register": Table2,
  "/compliance/e3-tracker/amc-dashboard": ScrollText,
  "/compliance/e3-tracker/amc-tracker": CalendarRange,
  "/compliance/e3-tracker/vendor-register": Store,
  "/compliance/e3-tracker/monthly-scheduler": CalendarRange,
  "/compliance/e3-tracker/missing-documents": FileX,
  "/compliance/e3-tracker/license-documents": Stamp,
  "/compliance/e3-tracker/qcdd": ShieldCheck,
  "/compliance/e3-tracker/fire-alarm": Flame,
  "/compliance/e3-tracker/pest-control": Bug,
  "/compliance/e3-tracker/cctv": Cctv,
  "/compliance/e3-tracker/kitchen-compliance": ChefHat,
  "/compliance/e3-tracker/third-party-certification": Award,
};

export function E3TrackerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <FecPageHeader
        icon={ShieldCheck}
        kicker={t("e3Tracker.layout.kicker")}
        title={t("e3Tracker.layout.title")}
        subtitle={t("e3Tracker.layout.subtitle")}
      />
      <PillTabScroller label={t("e3Tracker.layout.title")}>
        {E3_NAV_ITEMS.map((item) => {
          const active =
            item.href === "/compliance/e3-tracker"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = NAV_ICONS[item.href] ?? ShieldCheck;
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={pillTabItemClass(active)}>
              <Icon aria-hidden />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </PillTabScroller>
      {children}
    </div>
  );
}

export function E3TrackerPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="page-title text-[1.35rem]">{title}</h2>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
