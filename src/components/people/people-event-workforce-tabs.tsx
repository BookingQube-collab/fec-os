"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { canActorPerform } from "@/lib/arcade/access";
import type { Capability } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { useAuth, useUserRoles } from "@/hooks/use-auth";

export type PeopleEventWorkforceTabId = "overview" | "crew" | "attendance" | "payroll";

type TabDef = {
  id: PeopleEventWorkforceTabId;
  href: string;
  labelKey: string;
  icon: LucideIcon;
  capabilities: readonly Capability[];
};

const TABS: readonly TabDef[] = [
  {
    id: "overview",
    href: "/people/events",
    labelKey: "peopleEvent.tabs.overview",
    icon: LayoutDashboard,
    capabilities: ["people.view_roster", "events.view", "attendance.view", "payroll.view"],
  },
  {
    id: "crew",
    href: "/people/event-crew",
    labelKey: "peopleEvent.tabs.crew",
    icon: FolderKanban,
    capabilities: ["people.view_roster", "events.view", "attendance.view"],
  },
  {
    id: "attendance",
    href: "/people/event-attendance",
    labelKey: "peopleEvent.tabs.attendance",
    icon: CalendarDays,
    capabilities: ["attendance.view"],
  },
  {
    id: "payroll",
    href: "/people/event-payroll",
    labelKey: "peopleEvent.tabs.payroll",
    icon: Banknote,
    capabilities: ["payroll.view"],
  },
];

function pathMatches(pathname: string, href: string): boolean {
  if (href === "/people/events") {
    return pathname === "/people/events" || pathname.endsWith("/people/events");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Shared module tabs across Event workforce hub + crew / attendance / payroll. */
export function PeopleEventWorkforceTabs({
  className,
  active,
}: {
  className?: string;
  /** Override active tab when pathname alone is ambiguous. */
  active?: PeopleEventWorkforceTabId;
}) {
  const { t } = useTranslation();
  const pathname = usePathname() ?? "";
  const roles = useUserRoles();
  const { profile } = useAuth();
  const actorOpts = {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  };

  const can = (caps: readonly Capability[]) =>
    caps.some((cap) => canActorPerform(roles, cap, actorOpts));

  const visible = TABS.filter((tab) => can(tab.capabilities));
  if (visible.length === 0) return null;

  const current =
    active ??
    (visible.find((tab) => pathMatches(pathname, tab.href))?.id ?? visible[0]?.id);

  return (
    <nav
      className={cn(
        "flex flex-wrap gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1",
        className,
      )}
      aria-label={t("peopleEvent.tabs.aria")}
    >
      {visible.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
