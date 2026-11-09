"use client";

/* Hallmark · redesign · Event Attendance records · mockup-faithful
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7c3aed)
 * design-system: FEC People/HR · designed-as-app · sibling: Overview / Crew
 * previous: HrSection + AttendanceKpiStrip + AttendanceRecordsTable
 * this: 6 KPIs · status donut + trend · records table with Modify Punch toolbar
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CalendarClock,
  CalendarDays,
  Download,
  ExternalLink,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { EventAttendanceKpiStrip } from "@/components/people/event-attendance-kpi-strip";
import { EventAttendanceRecordsPanel } from "@/components/people/event-attendance-records-panel";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventDateRangeControl } from "@/components/people/people-event-date-range-control";
import { PeopleEventWorkforceDemoTools } from "@/components/people/people-event-workforce-demo-tools";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useEventRoles } from "@/hooks/queries/useEvents";
import { buildAttendanceCsv } from "@/lib/attendance-display";
import { EVENT_WORKFORCE_DEMO_MAX_DAYS } from "@/lib/events/event-workforce-demo";
import {
  buildEventAttendancePageKpis,
  buildEventAttendanceStatusCounts,
  buildEventAttendanceTrendForRange,
  filterEventAttendanceRowsByRole,
  mayModifyEventMissedPunch,
  previousEqualRange,
  toEventAttendanceSummaryRow,
} from "@/lib/people-event-attendance-display";
import {
  defaultOverviewRange,
  rangeForSelectedEvent,
} from "@/lib/people-event-attendance-overview";
import {
  eventSiteOptionsFromEvents,
  filterPeopleEventsByLocation,
} from "@/lib/people-event-site-options";
import {
  listPeopleEventAttendance,
  listPeopleEventOptions,
} from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";
import { cn } from "@/lib/utils";

const EventAttendanceCharts = dynamic(
  () =>
    import("@/components/people/event-attendance-charts").then((m) => m.EventAttendanceCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    ),
  },
);

function uuidOrEmpty(v: string | null): string {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
}

function ymdOrEmpty(v: string | null): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

export default function PeopleEventAttendancePage() {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const roles = useUserRoles();
  const canModifyMissed = mayModifyEventMissedPunch({
    roles,
    jobTitle: profile?.job_title,
  });

  const initialRange = useMemo(() => defaultOverviewRange(), []);
  const urlHadRange = Boolean(
    ymdOrEmpty(searchParams.get("from")) && ymdOrEmpty(searchParams.get("to")),
  );
  const [eventId, setEventId] = useState(() => uuidOrEmpty(searchParams.get("eventId")));
  const [locationId, setLocationId] = useState(() => uuidOrEmpty(searchParams.get("locationId")));
  const [dateFrom, setDateFrom] = useState(
    () => ymdOrEmpty(searchParams.get("from")) || initialRange.from,
  );
  const [dateTo, setDateTo] = useState(
    () => ymdOrEmpty(searchParams.get("to")) || initialRange.to,
  );
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [roleId, setRoleId] = useState(() => uuidOrEmpty(searchParams.get("roleId")));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const prevEventIdRef = useRef<string | undefined>(undefined);

  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
  const prevRange = useMemo(() => previousEqualRange(dateFrom, dateTo), [dateFrom, dateTo]);

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options"],
    queryFn: () => listPeopleEventOptions({ locationId: null }),
    staleTime: STALE.events,
  });

  const attendanceQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-attendance",
      "records",
      eventId || null,
      locationId || null,
      dateFrom || null,
      dateTo || null,
      search.trim() || null,
    ],
    queryFn: () =>
      listPeopleEventAttendance({
        eventId: eventId || null,
        locationId: locationId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        search: search.trim() || null,
        limit: 2000,
      }),
    staleTime: STALE.people,
  });

  const previousQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-attendance",
      "records-prev",
      eventId || null,
      locationId || null,
      prevRange.from,
      prevRange.to,
    ],
    queryFn: () =>
      listPeopleEventAttendance({
        eventId: eventId || null,
        locationId: locationId || null,
        dateFrom: prevRange.from,
        dateTo: prevRange.to,
        limit: 2000,
      }),
    staleTime: STALE.people,
    enabled: Boolean(dateFrom && dateTo),
  });

  const rolesQ = useEventRoles(eventId || null);
  const roleOptions = useMemo(
    () =>
      (rolesQ.data?.roles ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
      })),
    [rolesQ.data?.roles],
  );

  const rawRows = attendanceQ.data?.rows ?? [];
  const rawPreviousRows = previousQ.data?.rows ?? [];
  // Wait for event roles before applying label fallback matching (eventRoleId still works earlier).
  const roleFilterReady = !roleId || rolesQ.isSuccess;
  const rows = useMemo(
    () =>
      roleFilterReady
        ? filterEventAttendanceRowsByRole(rawRows, roleId || null, roleOptions)
        : rawRows,
    [rawRows, roleId, roleOptions, roleFilterReady],
  );
  const previousRows = useMemo(
    () =>
      roleFilterReady
        ? filterEventAttendanceRowsByRole(rawPreviousRows, roleId || null, roleOptions)
        : rawPreviousRows,
    [rawPreviousRows, roleId, roleOptions, roleFilterReady],
  );
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

  // Align From–To to the selected event so seeded punches land inside the filter.
  useEffect(() => {
    const listed = eventsQ.data?.events;
    if (!eventsQ.isSuccess || !listed) return;
    const prev = prevEventIdRef.current;
    if (prev === eventId) return;
    const isFirst = prev === undefined;
    if (!eventId) {
      prevEventIdRef.current = eventId;
      setRoleId("");
      return;
    }
    const ev = listed.find((e) => e.id === eventId);
    if (!ev) return;
    prevEventIdRef.current = eventId;
    // Role options are event-scoped — clear when the event changes.
    if (!isFirst) setRoleId("");
    if (isFirst && urlHadRange) return;
    const next = rangeForSelectedEvent(ev, initialRange, EVENT_WORKFORCE_DEMO_MAX_DAYS);
    setDateFrom(next.from);
    setDateTo(next.to);
  }, [eventId, eventsQ.isSuccess, eventsQ.data?.events, urlHadRange, initialRange]);

  useEffect(() => {
    if (!roleId || !rolesQ.isSuccess) return;
    if (roleOptions.some((r) => r.id === roleId)) return;
    setRoleId("");
  }, [roleId, roleOptions, rolesQ.isSuccess]);

  const kpis = useMemo(
    () =>
      buildEventAttendancePageKpis({
        rows,
        previousRows,
      }),
    [rows, previousRows],
  );

  const statusCounts = useMemo(() => buildEventAttendanceStatusCounts(rows), [rows]);
  const trend = useMemo(
    () => buildEventAttendanceTrendForRange(rows, dateFrom, dateTo, locale),
    [rows, dateFrom, dateTo, locale],
  );

  const exportCsv = (onlySelected = false) => {
    const source = onlySelected ? rows.filter((r) => selected.has(r.id)) : rows;
    if (!source.length) return;
    const csv = buildAttendanceCsv(source.map(toEventAttendanceSummaryRow));
    downloadCsvContent(
      csv,
      `event-attendance-${dateFrom || "all"}-${dateTo || "all"}.csv`,
    );
  };

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(rows.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const shiftsHref = eventId
    ? `/people/event-shifts?eventId=${encodeURIComponent(eventId)}`
    : "/people/event-shifts";

  return (
    <CapabilityGate
      capability="attendance.view"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("peopleEvent.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <div className="ea-event-attendance space-y-5">
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
                      {t("peopleEvent.kicker")}
                    </Link>
                    <span aria-hidden> › </span>
                    <span>{t("peopleEvent.attendance.title")}</span>
                  </p>
                  <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                    {t("peopleEvent.attendance.title")}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {t("peopleEvent.attendance.subtitle")}
                  </p>
                </div>
              </div>

              <div className="relative flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!rows.length}
                  onClick={() => exportCsv(false)}
                  className="h-10 rounded-xl border-border/80 bg-white"
                >
                  <Download className="me-1.5 h-3.5 w-3.5" aria-hidden />
                  {t("peopleEvent.bulk.exportCsv")}
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9] focus-visible:ring-[#7c3aed]/40"
                >
                  <Link href={shiftsHref}>
                    <ExternalLink className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    {t("peopleEvent.links.openShifts")}
                  </Link>
                </Button>
              </div>
            </div>
          </header>

          <PeopleEventWorkforceTabs active="attendance" variant="pills" />

          <EventAttendanceKpiStrip
            kpis={kpis}
            isLoading={attendanceQ.isLoading}
          />

          <section className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
                    onValueChange={(v) => {
                      const next = v === "all" ? "" : v;
                      setEventId(next);
                      setSelected(new Set());
                    }}
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
                  {t("peopleEvent.filters.siteBranch")}
                </label>
                <div className="relative">
                  <MapPin
                    className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Select
                    value={locationId || "all"}
                    onValueChange={(v) => {
                      setLocationId(v === "all" ? "" : v);
                      setSelected(new Set());
                    }}
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

              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("peopleEvent.filters.role")}
                </label>
                <div className="relative">
                  <Briefcase
                    className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Select
                    value={roleId || "all"}
                    onValueChange={(v) => {
                      setRoleId(v === "all" ? "" : v);
                      setSelected(new Set());
                    }}
                    disabled={!eventId}
                  >
                    <SelectTrigger className="h-10 rounded-xl ps-9">
                      <SelectValue
                        placeholder={
                          eventId
                            ? t("peopleEvent.filters.allRoles")
                            : t("peopleEvent.filters.rolePickEvent")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("peopleEvent.filters.allRoles")}</SelectItem>
                      {roleOptions.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("peopleEvent.filters.dateRange")}
                </label>
                <PeopleEventDateRangeControl
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateFrom={(v) => {
                    setDateFrom(v);
                    setSelected(new Set());
                  }}
                  onDateTo={(v) => {
                    setDateTo(v);
                    setSelected(new Set());
                  }}
                  fromId="event-attendance-date-from"
                  toId="event-attendance-date-to"
                />
              </div>

              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("peopleEvent.filters.search")}
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelected(new Set());
                    }}
                    placeholder={t("peopleEvent.filters.searchPlaceholder")}
                    className={cn("h-10 rounded-xl ps-9 pe-9")}
                  />
                  <SlidersHorizontal
                    className="pointer-events-none absolute end-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </section>

          <PeopleEventWorkforceDemoTools
            eventId={eventId || null}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={(v) => {
              setDateFrom(v);
              setSelected(new Set());
            }}
            onDateToChange={(v) => {
              setDateTo(v);
              setSelected(new Set());
            }}
          />

          <EventAttendanceCharts
            status={{
              complete: statusCounts.complete,
              late: statusCounts.late,
              missing: statusCounts.missing,
              total: statusCounts.total,
            }}
            attendanceTrend={trend}
            avgAttendancePct={kpis.avgAttendancePct}
          />

          <EventAttendanceRecordsPanel
            rows={rows}
            isLoading={attendanceQ.isLoading}
            canModifyMissed={canModifyMissed}
            selected={selected}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            onExportSelected={() => exportCsv(true)}
          />
        </div>
      </HrShell>
    </CapabilityGate>
  );
}
