"use client";

import Link from "next/link";
import { Banknote, Calendar, CalendarDays, ExternalLink, FolderKanban } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { canActorPerform } from "@/lib/arcade/access";
import type { Capability } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type HubModule = {
  id: string;
  href: string;
  titleKey: string;
  subtitleKey: string;
  icon: typeof CalendarDays;
  capabilities: readonly Capability[];
};

/** Same capability gates as People & HR Events nav rows — hub only shows what the user can open. */
const HUB_MODULES: readonly HubModule[] = [
  {
    id: "crew",
    href: "/people/event-crew",
    titleKey: "peopleEvent.crew.title",
    subtitleKey: "peopleEvent.crew.subtitle",
    icon: FolderKanban,
    capabilities: ["people.view_roster", "events.view", "attendance.view"],
  },
  {
    id: "attendance",
    href: "/people/event-attendance",
    titleKey: "peopleEvent.attendance.title",
    subtitleKey: "peopleEvent.attendance.subtitle",
    icon: CalendarDays,
    capabilities: ["attendance.view"],
  },
  {
    id: "payroll",
    href: "/people/event-payroll",
    titleKey: "peopleEvent.payroll.title",
    subtitleKey: "peopleEvent.payroll.subtitle",
    icon: Banknote,
    capabilities: ["payroll.view"],
  },
];

export default function PeopleEventsHubPage() {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const { profile } = useAuth();
  const actorOpts = {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  };

  const can = (caps: readonly Capability[]) =>
    caps.some((cap) => canActorPerform(roles, cap, actorOpts));

  const modules = HUB_MODULES.filter((mod) => can(mod.capabilities));
  const canOpenEventsSetup = can(["events.view"]);

  return (
    <HrShell>
      <HrSection
        icon={Calendar}
        kicker={t("peopleEvent.kicker")}
        title={t("peopleEvent.hub.title")}
        subtitle={t("peopleEvent.hub.subtitle")}
        actions={
          canOpenEventsSetup ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/events">
                <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                {t("peopleEvent.hub.openEventsSetup")}
              </Link>
            </Button>
          ) : null
        }
      >
        {modules.length === 0 ? (
          <HrPanel>
            <HrEmptyState message={t("peopleEvent.noAccess")} icon={Calendar} />
          </HrPanel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((mod, index) => {
              const Icon = mod.icon;
              return (
                <HrPanel key={mod.id} delay={index} className="h-full">
                  <Link
                    href={mod.href}
                    className={cn(
                      "group flex h-full flex-col gap-3 rounded-2xl p-1 outline-none",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-foreground">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <ExternalLink
                        className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden
                      />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-base font-semibold tracking-tight">{t(mod.titleKey)}</h2>
                      <p className="text-sm text-muted-foreground">{t(mod.subtitleKey)}</p>
                    </div>
                    <span className="mt-auto text-sm font-medium text-primary underline-offset-4 group-hover:underline">
                      {t("peopleEvent.hub.openModule")}
                    </span>
                  </Link>
                </HrPanel>
              );
            })}
          </div>
        )}

        <HrPanel delay={modules.length || 1}>
          <p className="text-sm text-muted-foreground">{t("peopleEvent.hub.correctionsHint")}</p>
        </HrPanel>
      </HrSection>
    </HrShell>
  );
}
