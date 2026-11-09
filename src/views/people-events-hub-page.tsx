"use client";

/* Hallmark · redesign · app dashboard · mockup-faithful Event Attendance
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7C3AED)
 * design-system: FEC People/HR · designed-as-app
 * previous: sparse workforce hub · this: Event Attendance overview matching attached mockup
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventDateRangeControl } from "@/components/people/people-event-date-range-control";
import { PeopleEventSharedEventSelect } from "@/components/people/people-event-shared-event-select";
import { PeopleEventWorkforceDashboard } from "@/components/people/people-event-workforce-dashboard";
import { PeopleEventWorkforceDemoTools } from "@/components/people/people-event-workforce-demo-tools";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Button } from "@/components/ui/button";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePeopleEventSelection } from "@/hooks/use-people-event-selection";
import { canActorPerform } from "@/lib/arcade/access";
import {
  EVENT_WORKFORCE_DEMO_MAX_DAYS,
  mayManageEventWorkforceDemo,
} from "@/lib/events/event-workforce-demo";
import {
  defaultOverviewRange,
  rangeForSelectedEvent,
} from "@/lib/people-event-attendance-overview";
import { listPeopleEventOptions } from "@/lib/people-event-workforce.functions";
import type { Capability } from "@/lib/rbac";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export default function PeopleEventsHubPage() {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const { profile } = useAuth();
  const { eventId, setEventId } = usePeopleEventSelection();
  const actorOpts = {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  };

  const initialRange = useMemo(() => defaultOverviewRange(), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const prevEventIdRef = useRef<string | undefined>(undefined);

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

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options", "hub"],
    queryFn: () => listPeopleEventOptions({ limit: 200 }),
    staleTime: STALE.events,
    enabled: hasAnyModule,
  });
  const events = eventsQ.data?.events ?? [];

  // Align From–To to the selected event so seeded attendance appears on Overview.
  useEffect(() => {
    const listed = eventsQ.data?.events;
    if (!eventsQ.isSuccess || !listed) return;
    const prev = prevEventIdRef.current;
    if (prev === eventId) return;
    if (!eventId) {
      prevEventIdRef.current = eventId;
      return;
    }
    const ev = listed.find((e) => e.id === eventId);
    if (!ev) return;
    prevEventIdRef.current = eventId;
    const next = rangeForSelectedEvent(ev, initialRange, EVENT_WORKFORCE_DEMO_MAX_DAYS);
    setDateFrom(next.from);
    setDateTo(next.to);
  }, [eventId, eventsQ.isSuccess, eventsQ.data?.events, initialRange]);

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

            <div className="relative flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto lg:justify-end">
              <PeopleEventSharedEventSelect
                eventId={eventId}
                events={events}
                onEventIdChange={setEventId}
                disabled={eventsQ.isLoading}
                className="w-full sm:w-auto"
                triggerClassName="border-border/70 bg-white/90"
              />
              <div className="min-w-0">
                <label
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  htmlFor="ea-date-from"
                >
                  {t("peopleEvent.filters.dateRange")}
                </label>
                <PeopleEventDateRangeControl
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateFrom={setDateFrom}
                  onDateTo={setDateTo}
                  fromId="ea-date-from"
                  toId="ea-date-to"
                  className="w-full min-w-[16rem] border-border/70 bg-white/90 sm:w-auto sm:min-w-[18rem]"
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
            <PeopleEventWorkforceTabs
              active="overview"
              variant="pills"
              eventId={eventId}
            />
            {canHooDemo ? (
              <PeopleEventWorkforceDemoTools
                eventId={eventId || null}
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
              />
            ) : null}
            <PeopleEventWorkforceDashboard
              canCrew={canCrew}
              canAttendance={canAttendance}
              canPayroll={canPayroll}
              dateFrom={dateFrom}
              dateTo={dateTo}
              eventId={eventId || null}
            />
          </>
        )}
      </div>
    </HrShell>
  );
}
