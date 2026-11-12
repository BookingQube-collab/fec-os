"use client";

import {
  Activity,
  BarChart3,
  Bot,
  Contact,
  Hash,
  Headphones,
  ListOrdered,
  MessageCircle,
  Phone,
  PhoneCall,
  Radio,
  Settings,
  ShieldBan,
  Users,
  Voicemail,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const LINKS: { href: string; key: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/call-center", key: "dialer", icon: Phone, exact: true },
  { href: "/call-center/live", key: "live", icon: Radio },
  { href: "/call-center/calls", key: "calls", icon: PhoneCall },
  { href: "/call-center/contacts", key: "contacts", icon: Contact },
  { href: "/call-center/voicemail", key: "voicemail", icon: Voicemail },
  { href: "/call-center/numbers", key: "numbers", icon: Hash },
  { href: "/call-center/ivr", key: "ivr", icon: Workflow },
  { href: "/call-center/queues", key: "queues", icon: ListOrdered },
  { href: "/call-center/campaigns", key: "campaigns", icon: Activity },
  { href: "/call-center/analytics", key: "analytics", icon: BarChart3 },
  { href: "/call-center/agents", key: "agents", icon: Users },
  { href: "/call-center/blacklist", key: "blacklist", icon: ShieldBan },
  { href: "/call-center/settings", key: "settings", icon: Settings },
  { href: "/call-center/ai", key: "ai", icon: Bot },
  { href: "/call-center/whatsapp", key: "whatsapp", icon: MessageCircle },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navItemClass = (active: boolean) =>
  cn(
    "group flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-center transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fec-star)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active
      ? "bg-[color-mix(in_oklab,var(--fec-star)_16%,var(--card))] text-foreground shadow-sm ring-1 ring-[color-mix(in_oklab,var(--fec-star)_32%,transparent)]"
      : "text-muted-foreground hover:bg-card/90 hover:text-foreground",
  );

export function CallCenterSectionNav({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "cc-rail flex shrink-0 flex-col gap-0.5",
        compact ? "w-14" : "w-[5.75rem] sm:w-[6.25rem]",
      )}
      aria-label={t("callCenterNav.label")}
    >
      {LINKS.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={t(`callCenterNav.${item.key}`)}
            className={navItemClass(active)}
          >
            <Icon
              className={cn(
                "h-4.5 w-4.5 shrink-0 stroke-[1.6]",
                active && "text-[var(--fec-star)]",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "max-w-full text-[0.68rem] font-medium leading-tight tracking-wide",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {t(`callCenterNav.${item.key}`)}
            </span>
          </Link>
        );
      })}
    </nav>
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
    <div className="cc-shell -mx-1 flex min-h-[calc(100dvh-7.5rem)] gap-0 overflow-hidden rounded-2xl border border-border/50 bg-background sm:-mx-0">
      <aside className="cc-shell__rail hidden border-e border-border/40 bg-[var(--surface-2)] px-1.5 py-3 sm:flex">
        <div className="flex w-full flex-col">
          <div className="mb-3 flex flex-col items-center gap-1.5 px-1 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--fec-star)_18%,var(--card))] text-[var(--fec-star)] ring-1 ring-[color-mix(in_oklab,var(--fec-star)_28%,transparent)]">
              <Headphones className="h-4.5 w-4.5" aria-hidden />
            </span>
            <span className="max-w-[5.5rem] text-[0.68rem] font-semibold leading-tight text-foreground">
              {t("callCenter.kicker")}
            </span>
          </div>
          <CallCenterSectionNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "flex flex-wrap items-end justify-between gap-3 border-b border-border/40 bg-card/40 px-4 py-3 sm:px-5",
            dense ? "py-2.5" : "py-3.5",
          )}
        >
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("callCenter.kicker")}
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {t(titleKey ?? "callCenter.title")}
            </h1>
            <p
              className={cn(
                "mt-1 max-w-2xl text-muted-foreground",
                dense ? "text-xs sm:text-sm" : "text-sm",
              )}
            >
              {t(subtitleKey ?? "callCenter.subtitle")}
            </p>
          </div>
        </header>

        <div className="border-b border-border/40 bg-card/30 px-2 py-2 sm:hidden">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CallCenterMobileStrip />
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-5 sm:py-4", dense && "py-2.5")}>
          {children}
        </div>
      </div>
    </div>
  );
}

function CallCenterMobileStrip() {
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
              active
                ? "border-[color-mix(in_oklab,var(--fec-star)_40%,transparent)] bg-[color-mix(in_oklab,var(--fec-star)_14%,var(--card))] text-foreground shadow-sm"
                : "border-border/50 bg-card text-muted-foreground",
            )}
          >
            <Icon
              className={cn("h-3.5 w-3.5", active && "text-[var(--fec-star)]")}
              aria-hidden
            />
            {t(`callCenterNav.${item.key}`)}
          </Link>
        );
      })}
    </>
  );
}
