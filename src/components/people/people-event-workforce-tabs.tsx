"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  CalendarClock,
  CalendarDays,
  FileBarChart,
  FolderKanban,
  LayoutDashboard,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { PeopleEventSharedEventSelect } from "@/components/people/people-event-shared-event-select";
import { canActorPerform } from "@/lib/arcade/access";
import { peopleEventHref } from "@/lib/people-event-selection";
import type { PeopleEventOption } from "@/lib/people-event-workforce.functions";
import type { Capability } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { useAuth, useUserRoles } from "@/hooks/use-auth";

export type PeopleEventWorkforceTabId =
  | "overview"
  | "crew"
  | "roles"
  | "shifts"
  | "attendance"
  | "reports"
  | "payroll";

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
    id: "roles",
    href: "/people/event-roles",
    labelKey: "peopleEvent.tabs.roles",
    icon: Settings2,
    capabilities: ["people.view_roster", "events.view", "attendance.view"],
  },
  {
    id: "shifts",
    href: "/people/event-shifts",
    labelKey: "peopleEvent.tabs.shifts",
    icon: CalendarClock,
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
    id: "reports",
    href: "/people/event-reports",
    labelKey: "peopleEvent.tabs.reports",
    icon: FileBarChart,
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

/** Shared module tabs across Event workforce hub + crew / roles / shifts / attendance / payroll. */
export function PeopleEventWorkforceTabs({
  className,
  active,
  variant = "segment",
  eventId,
  events,
  onEventIdChange,
  showEventSelect = false,
}: {
  className?: string;
  /** Override active tab when pathname alone is ambiguous. */
  active?: PeopleEventWorkforceTabId;
  /** `pills` matches the Event Attendance mockup (solid purple active). */
  variant?: "segment" | "pills";
  /** When set, tab links keep `?eventId=` so selection survives navigation. */
  eventId?: string;
  /** Events for the shared chrome Event control (when `showEventSelect`). */
  events?: PeopleEventOption[];
  onEventIdChange?: (eventId: string) => void;
  /** Render one shared Event selector beside the tabs. */
  showEventSelect?: boolean;
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

  const tabLink = (href: string) => peopleEventHref(href, eventId);

  const nav =
    variant === "pills" ? (
      <nav
        className={cn("flex flex-wrap gap-2", className)}
        aria-label={t("peopleEvent.tabs.aria")}
      >
        {visible.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === current;
          return (
            <Link
              key={tab.id}
              href={tabLink(tab.href)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40",
                isActive
                  ? "bg-[#7c3aed] text-white shadow-sm"
                  : "border border-border/80 bg-white text-muted-foreground hover:border-[#7c3aed]/30 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    ) : (
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
              href={tabLink(tab.href)}
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

  if (!showEventSelect || !onEventIdChange) return nav;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 flex-1">{nav}</div>
      <PeopleEventSharedEventSelect
        eventId={eventId ?? ""}
        events={events ?? []}
        onEventIdChange={onEventIdChange}
        className="w-full lg:w-auto lg:max-w-md"
        triggerClassName="border-border/80 bg-white"
      />
    </div>
  );
}
