"use client";

import { CalendarDays, Home, Target, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { useEvent } from "@/hooks/queries/useEvents";
import { missingRequiredDocs } from "@/lib/events/documents";
import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { cn } from "@/lib/utils";

const TABS = [
  { suffix: "", key: "home", icon: Home },
  { suffix: "/scope", key: "scope", icon: Target },
  { suffix: "/plan", key: "schedule", icon: CalendarDays },
  { suffix: "/budget", key: "budget", icon: Wallet },
] as const;

export function EventWorkspaceNav({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const eventQ = useEvent(eventId);
  const missingDocs = missingRequiredDocs(eventQ.data?.documents).length;
  const base = `/events/${eventId}`;

  return (
    <PillTabScroller label={t("nav.events")}>
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = tab.suffix === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(pillTabItemClass(active), "text-xs font-semibold tracking-wide")}
          >
            <tab.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            {t(`events.workspace.${tab.key}`)}
            {tab.key === "scope" && missingDocs > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rag-amber/90 px-1 text-[10px] text-primary-foreground">
                {missingDocs}
              </span>
            ) : null}
          </Link>
        );
      })}
    </PillTabScroller>
  );
}
