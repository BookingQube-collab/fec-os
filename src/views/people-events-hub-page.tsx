"use client";

/* Hallmark · redesign · app dashboard · mockup-faithful Event Attendance
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7C3AED)
 * design-system: FEC People/HR · designed-as-app
 * previous: sparse workforce hub · this: Event Attendance overview matching attached mockup
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventWorkforceDashboard } from "@/components/people/people-event-workforce-dashboard";
import { PeopleEventWorkforceDemoTools } from "@/components/people/people-event-workforce-demo-tools";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { canActorPerform } from "@/lib/arcade/access";
import { mayManageEventWorkforceDemo } from "@/lib/events/event-workforce-demo";
import {
  defaultOverviewRange,
  formatRangeLabel,
} from "@/lib/people-event-attendance-overview";
import { listPeopleEventOptions } from "@/lib/people-event-workforce.functions";
import type { Capability } from "@/lib/rbac";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export default function PeopleEventsHubPage() {
  const { t, i18n } = useTranslation();
  const roles = useUserRoles();
  const { profile } = useAuth();
  const actorOpts = {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  };

  const initialRange = useMemo(() => defaultOverviewRange(), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [demoEventId, setDemoEventId] = useState("");

  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
  const rangeLabel = formatRangeLabel(dateFrom, dateTo, locale);

  const can = (caps: readonly Capability[]) =>
    caps.some((cap) => canActorPerform(roles, cap, actorOpts));

  const canCrew = can(["people.view_roster", "events.view", "attendance.view"]);
  const canAttendance = can(["attendance.view"]);
  const canPayroll = can(["payroll.view"]);
  const canOpenEventsSetup = can(["events.view"]);
  const hasAnyModule = canCrew || canAttendance || canPayroll;
  const canHooDemo = mayManageEventWorkforceDemo({
    roles,
    jobTitle: profile?.job_title,
  });

  const demoEventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options", "demo-tools"],
    queryFn: () => listPeopleEventOptions({ limit: 120 }),
    staleTime: STALE.events,
    enabled: canHooDemo && hasAnyModule,
  });
  const demoEvents = demoEventsQ.data?.events ?? [];

  return (
    <HrShell>
      <div className="ea-attendance-overview space-y-5">
        <header className="relative overflow-hidden rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 100% 0%, rgba(124,58,237,0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(167,139,250,0.10), transparent 50%)",
            }}
          />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-[#7c3aed]">
                <CalendarDays className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("peopleEvent.hub.breadcrumb")}
                </p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                  {t("peopleEvent.hub.title")}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {t("peopleEvent.hub.subtitleDashboard")}
                </p>
              </div>
            </div>

            <div className="relative flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
              <div
                className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-white/90 px-2.5 py-1.5 shadow-sm"
                title={rangeLabel}
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden />
                <label className="sr-only" htmlFor="ea-date-from">
                  {t("peopleEvent.filters.from")}
                </label>
                <Input
                  id="ea-date-from"
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-[9.75rem] border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-1 focus-visible:ring-[#7c3aed]/40"
                />
                <span className="text-muted-foreground" aria-hidden>
                  –
                </span>
                <label className="sr-only" htmlFor="ea-date-to">
                  {t("peopleEvent.filters.to")}
                </label>
                <Input
                  id="ea-date-to"
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-[9.75rem] border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-1 focus-visible:ring-[#7c3aed]/40"
                />
              </div>

              {canOpenEventsSetup ? (
                <Button
                  asChild
                  size="sm"
                  className="h-10 shrink-0 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9] focus-visible:ring-[#7c3aed]/40"
                >
                  <Link href="/events">
                    {t("peopleEvent.hub.openEventsSetup")}
                    <ExternalLink className="ms-1.5 h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        {!hasAnyModule ? (
          <HrPanel>
            <HrEmptyState message={t("peopleEvent.noAccess")} icon={CalendarDays} />
          </HrPanel>
        ) : (
          <>
            <PeopleEventWorkforceTabs active="overview" variant="pills" />
            {canHooDemo ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-4">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("peopleEvent.demo.eventForSeed")}
                  </label>
                  <Select
                    value={demoEventId || "none"}
                    onValueChange={(v) => setDemoEventId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="h-10 max-w-xl rounded-xl">
                      <SelectValue placeholder={t("peopleEvent.filters.event")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("peopleEvent.demo.pickEvent")}</SelectItem>
                      {demoEvents.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                          {ev.eventNumber ? `${ev.eventNumber} · ` : ""}
                          {ev.name}
                          {ev.locationName ? ` · ${ev.locationName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <PeopleEventWorkforceDemoTools
                  eventId={demoEventId || null}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateFromChange={setDateFrom}
                  onDateToChange={setDateTo}
                />
              </div>
            ) : null}
            <PeopleEventWorkforceDashboard
              canCrew={canCrew}
              canAttendance={canAttendance}
              canPayroll={canPayroll}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          </>
        )}
      </div>
    </HrShell>
  );
}
