"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Clock, Building2, Upload, FileBarChart, Users, ClipboardCheck, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/people/attendance", key: "dashboard", icon: Clock },
  { href: "/people/attendance/import", key: "import", icon: Upload },
  { href: "/people/attendance/reports", key: "reports", icon: FileBarChart },
  { href: "/people/attendance/mapping", key: "mapping", icon: Users },
  { href: "/people/attendance/corrections", key: "corrections", icon: ClipboardCheck },
  { href: "/people/attendance/settings", key: "settings", icon: Settings },
] as const;

export function AttendanceHrNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  return (
    <nav className="flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-full border border-border/70 bg-secondary/40 p-1">
      {TABS.map((tab) => {
        const active = tab.href === "/people/attendance" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tracking-wide",
              active ? "bg-primary text-primary-foreground shadow-elevated-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t(`attendanceHr.nav.${tab.key}`, tab.key)}
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
