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
  Voicemail,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PillTabScroller } from "@/components/react-bits/pill-tab-scroller";
import { cn } from "@/lib/utils";

const LINKS: { href: string; key: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/call-center", key: "dialer", icon: Phone, exact: true },
  { href: "/call-center/live", key: "live", icon: Radio },
  { href: "/call-center/calls", key: "calls", icon: PhoneCall },
  { href: "/call-center/numbers", key: "numbers", icon: Hash },
  { href: "/call-center/ivr", key: "ivr", icon: Workflow },
  { href: "/call-center/voicemail", key: "voicemail", icon: Voicemail },
  { href: "/call-center/queues", key: "queues", icon: ListOrdered },
  { href: "/call-center/campaigns", key: "campaigns", icon: Activity },
  { href: "/call-center/analytics", key: "analytics", icon: BarChart3 },
  { href: "/call-center/settings", key: "settings", icon: Settings },
  { href: "/call-center/ai", key: "ai", icon: Bot },
  { href: "/call-center/whatsapp", key: "whatsapp", icon: MessageCircle },
];

function navItemClass(active: boolean) {
  return cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fec-star)] focus-visible:ring-offset-2",
    active
      ? "border-foreground/15 bg-foreground text-background shadow-sm"
      : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );
}

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
            className={navItemClass(active)}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{t(`callCenterNav.${item.key}`)}</span>
          </Link>
        );
      })}
    </PillTabScroller>
  );
}

export function CallCenterShell({
  titleKey,
  subtitleKey,
  dense = false,
  children,
}: {
  titleKey?: string;
  subtitleKey?: string;
  dense?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("space-y-4", dense && "space-y-3")}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/40 pb-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("callCenter.kicker")}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            <Headphones className="h-5 w-5 text-foreground/80 sm:h-6 sm:w-6" aria-hidden />
            {t(titleKey ?? "callCenter.title")}
          </h1>
          {!dense ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(subtitleKey ?? "callCenter.subtitle")}
            </p>
          ) : (
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
              {t(subtitleKey ?? "callCenter.subtitle")}
            </p>
          )}
        </div>
      </div>
      <CallCenterSectionNav />
      {children}
    </div>
  );
}
