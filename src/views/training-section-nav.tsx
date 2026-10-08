"use client";

import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Grid3x3,
  Link2,
  Route,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";

const LINKS: { href: string; key: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/training", key: "courses", icon: BookOpen, exact: true },
  { href: "/training/learning", key: "learning", icon: GraduationCap },
  { href: "/training/calendar", key: "calendar", icon: CalendarDays },
  { href: "/training/certificates", key: "certificates", icon: Award },
  { href: "/training/paths", key: "paths", icon: Route },
  { href: "/training/matrix", key: "matrix", icon: Grid3x3 },
  { href: "/training/links", key: "links", icon: Link2 },
  { href: "/training/reports", key: "reports", icon: BarChart3 },
];

export function TrainingSectionNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <PillTabScroller label={t("trainingNav.label")}>
      {LINKS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={pillTabItemClass(active)}
          >
            <Icon aria-hidden />
            {t(`trainingNav.${item.key}`)}
          </Link>
        );
      })}
    </PillTabScroller>
  );
}
