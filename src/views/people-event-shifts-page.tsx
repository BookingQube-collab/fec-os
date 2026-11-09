"use client";

/* Hallmark · redesign · Event Shifts page · mockup-faithful
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7c3aed)
 * design-system: FEC People/HR · designed-as-app · sibling: Event Crew / Attendance
 * previous: HrSection + filters panel · this: KPI strip + device banner + two-column schedule
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, Download, MapPin, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EventScheduleWorkspace } from "@/components/events/event-schedule-workspace";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { EventShiftsKpiStrip } from "@/components/people/event-shifts-kpi-strip";
import { PeopleEventWorkforceDemoTools } from "@/components/people/people-event-workforce-demo-tools";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { canActorPerform } from "@/lib/arcade/access";
import { toCsv } from "@/lib/csv-parse";
import { getEventSchedule } from "@/lib/event-schedule.functions";
import { buildShiftKpis, groupScheduleShifts } from "@/lib/people-event-shifts-display";
import {
  eventSiteOptionsFromEvents,
  filterPeopleEventsByLocation,
} from "@/lib/people-event-site-options";
import { listPeopleEventOptions } from "@/lib/people-event-workforce.functions";
import type { Capability } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";

function uuidOrEmpty(v: string | null): string {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
}

export default function PeopleEventShiftsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const canEdit = usePermission("events.edit");
  const roles = useUserRoles();
  const { profile } = useAuth();
  const actorOpts = {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  };
  const canView = (["people.view_roster", "events.view", "attendance.view"] as Capability[]).some(
    (cap) => canActorPerform(roles, cap, actorOpts),
  );
  const [eventId, setEventId] = useState(() => uuidOrEmpty(searchParams.get("eventId")));
  const [locationId, setLocationId] = useState(() => uuidOrEmpty(searchParams.get("locationId")));

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options"],
    queryFn: () => listPeopleEventOptions({ locationId: null }),
    staleTime: STALE.events,
    enabled: canView,
  });

  const scheduleQ = useQuery({
    queryKey: [...queryKeys.events.staffing(eventId), "schedule"],
    queryFn: () => getEventSchedule({ eventId }),
    enabled: Boolean(eventId) && canView,
    staleTime: STALE.events,
  });

  const slots = scheduleQ.data?.slots ?? [];
  const attendance = scheduleQ.data?.attendance ?? [];
  const groups = useMemo(
    () => groupScheduleShifts(slots, attendance),
    [slots, attendance],
  );
  const kpis = useMemo(
    () => buildShiftKpis(slots, attendance, groups),
    [slots, attendance, groups],
  );

  function focusAddShift() {
    const el = document.getElementById("event-shift-add");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportCsv() {
    if (!groups.length) return;
    const csv = toCsv(
      ["date", "role", "start", "end", "crew", "status", "staff"],
      groups.map((g) => [
        g.workDate,
        g.roleLabel,
        g.isLabour ? "" : g.scheduledIn,
        g.isLabour ? "" : g.scheduledOut,
        String(g.crewCount),
        g.covered ? "covered" : "uncovered",
        g.slots.map((s) => s.staff_name ?? s.staff_id).join("; "),
      ]),
    );
    downloadCsvContent(csv, "event-shifts.csv");
  }

  if (!canView) {
    return (
      <HrShell>
        <HrPanel>
          <HrEmptyState message={t("peopleEvent.noAccess")} />
        </HrPanel>
      </HrShell>
    );
  }

  const allEvents = eventsQ.data?.events ?? [];
  const eventSites = useMemo(
    () => eventSiteOptionsFromEvents(allEvents, eventId || null),
    [allEvents, eventId],
  );
  const events = useMemo(
    () => filterPeopleEventsByLocation(allEvents, locationId || null),
    [allEvents, locationId],
  );

  useEffect(() => {
    if (!locationId || !eventsQ.isSuccess) return;
    if (eventSites.some((site) => site.id === locationId)) return;
    setLocationId("");
  }, [locationId, eventSites, eventsQ.isSuccess]);

  return (
    <HrShell>
      <div className="ea-event-shifts space-y-5">
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
                <CalendarClock className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  <Link
                    href="/people/events"
                    className="hover:text-[#7c3aed] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
                  >
                    {t("peopleEvent.kicker")} &gt;
                  </Link>
                </p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                  {t("peopleEvent.shifts.title")}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {t("peopleEvent.shifts.subtitle")}
                </p>
              </div>
            </div>

            <div className="relative flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              {canEdit ? (
                <Button
                  size="sm"
                  disabled={!eventId}
                  onClick={focusAddShift}
                  className="h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9] focus-visible:ring-[#7c3aed]/40"
                >
                  <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden />
                  {t("peopleEvent.shifts.addShift")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={!groups.length}
                onClick={exportCsv}
                className="h-10 rounded-xl border-border/80 bg-white"
              >
                <Download className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("peopleEvent.shifts.export")}
              </Button>
            </div>
          </div>
        </header>

        <PeopleEventWorkforceTabs active="shifts" variant="pills" />

        <EventShiftsKpiStrip
          kpis={kpis}
          isLoading={Boolean(eventId) && scheduleQ.isLoading}
          hasEvent={Boolean(eventId)}
        />

        <PeopleEventWorkforceDemoTools eventId={eventId || null} />

        <section className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("peopleEvent.filters.event")}
              </label>
              <div className="relative">
                <CalendarDays
                  className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Select
                  value={eventId || "all"}
                  onValueChange={(v) => setEventId(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="h-10 rounded-xl ps-9">
                    <SelectValue placeholder={t("peopleEvent.filters.allEvents")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("peopleEvent.filters.allEvents")}</SelectItem>
                    {events.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {ev.eventNumber ? `${ev.eventNumber} · ` : ""}
                        {ev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="min-w-0">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("peopleEvent.shifts.filterSite")}
              </label>
              <div className="relative">
                <MapPin
                  className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Select
                  value={locationId || "all"}
                  onValueChange={(v) => setLocationId(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="h-10 rounded-xl ps-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.allBranches")}</SelectItem>
                    {eventSites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        {!eventId ? (
          <section className="rounded-2xl border border-black/5 bg-white p-8 shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
            <HrEmptyState message={t("peopleEvent.shifts.pickEvent")} icon={CalendarClock} />
          </section>
        ) : (
          <EventScheduleWorkspace eventId={eventId} />
        )}
      </div>
    </HrShell>
  );
}
