"use client";

import {
  Activity,
  BarChart3,
  Bot,
  Hash,
  Headphones,
  ListOrdered,
  MessageCircle,
  Phone,
  PhoneCall,
  Radio,
  Settings,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";

const LINKS: { href: string; key: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/call-center", key: "dialer", icon: Phone, exact: true },
  { href: "/call-center/live", key: "live", icon: Radio },
  { href: "/call-center/calls", key: "calls", icon: PhoneCall },
  { href: "/call-center/numbers", key: "numbers", icon: Hash },
  { href: "/call-center/ivr", key: "ivr", icon: Workflow },
  { href: "/call-center/queues", key: "queues", icon: ListOrdered },
  { href: "/call-center/campaigns", key: "campaigns", icon: Activity },
  { href: "/call-center/analytics", key: "analytics", icon: BarChart3 },
  { href: "/call-center/settings", key: "settings", icon: Settings },
  { href: "/call-center/ai", key: "ai", icon: Bot },
  { href: "/call-center/whatsapp", key: "whatsapp", icon: MessageCircle },
];

export function CallCenterSectionNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <PillTabScroller label={t("callCenterNav.label")}>
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
            {t(`callCenterNav.${item.key}`)}
          </Link>
        );
      })}
    </PillTabScroller>
  );
}

export function CallCenterShell({
  titleKey,
  subtitleKey,
  children,
}: {
  titleKey?: string;
  subtitleKey?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("callCenter.kicker")}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Headphones className="h-6 w-6 text-primary" aria-hidden />
            {t(titleKey ?? "callCenter.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(subtitleKey ?? "callCenter.subtitle")}
          </p>
        </div>
      </div>
      <CallCenterSectionNav />
      {children}
    </div>
  );
}
