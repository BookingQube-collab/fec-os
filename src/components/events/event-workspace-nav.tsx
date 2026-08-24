"use client";

import { CalendarDays, Home, Target, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { useEvent } from "@/hooks/queries/useEvents";
import { missingRequiredDocs } from "@/lib/events/documents";
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
    <nav className="flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-full border border-border/70 bg-secondary/40 p-1">
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = tab.suffix === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tracking-wide",
              active ? "bg-primary text-primary-foreground shadow-elevated-xs" : "text-muted-foreground hover:text-foreground",
            )}
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
    </nav>
  );
}
