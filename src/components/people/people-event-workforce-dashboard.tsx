"use client";

/* Hallmark · redesign · app dashboard · mockup-faithful Event Attendance
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7C3AED)
 * design-system: FEC People/HR · designed-as-app
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileBarChart2,
  PartyPopper,
  UserPlus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { TileSkeleton } from "@/components/loading/tile-skeleton";
import { EVENT_WORKFORCE_DEMO_MAX_DAYS } from "@/lib/events/event-workforce-demo";
import {
  activeCrewHeadcount,
  buildAttendanceByEvent,
  buildAttendanceTrend,
  buildEventWiseSummary,
  buildOverviewKpis,
  eventsInRange,
  previousEqualRange,
  rangeCoveringAttendanceRows,
} from "@/lib/people-event-attendance-overview";
import { peopleEventHref } from "@/lib/people-event-selection";
import {
  listPeopleEventAttendance,
  listPeopleEventCrew,
  type PeopleEventOption,
} from "@/lib/people-event-workforce.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const PeopleEventWorkforceCharts = dynamic(
  () =>
    import("@/components/people/people-event-workforce-charts").then(
      (m) => m.PeopleEventWorkforceCharts,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 xl:grid-cols-12" role="status" aria-busy="true">
        <TileSkeleton className="h-72 rounded-2xl xl:col-span-5" />
        <TileSkeleton className="h-72 rounded-2xl xl:col-span-4" />
        <TileSkeleton className="h-72 rounded-2xl xl:col-span-3" />
      </div>
    ),
  },
);

function formatDelta(delta: number | null): string | null {
  if (delta == null || Number.isNaN(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}%`;
}

function KpiCard({
  title,
  value,
  meta,
  metaTone,
  icon: Icon,
  iconClass,
  valueClass,
}: {
  title: string;
  value: string | number;
  meta?: string;
  metaTone?: "up" | "blue" | "orange" | "red" | "muted";
  icon: LucideIcon;
  iconClass: string;
  valueClass?: string;
}) {
  return (
    <article className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn("mt-1.5 text-2xl font-bold tracking-tight text-foreground", valueClass)}>
            {value}
          </p>
          {meta ? (
            <p
              className={cn(
                "mt-2 inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                metaTone === "up" && "bg-emerald-50 text-emerald-700",
                metaTone === "blue" && "bg-sky-50 text-sky-700",
                metaTone === "orange" && "bg-orange-50 text-orange-700",
                metaTone === "red" && "bg-red-50 text-red-700",
                (!metaTone || metaTone === "muted") && "bg-muted text-muted-foreground",
              )}
            >
              {meta}
            </p>
          ) : null}
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", iconClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
    </article>
  );
}

function attendancePillClass(pct: number): string {
  if (pct >= 90) return "bg-emerald-50 text-emerald-700";
  if (pct >= 75) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export function PeopleEventWorkforceDashboard({
  canCrew,
  canAttendance,
  canPayroll,
  dateFrom,
  dateTo,
  eventId = null,
  events: eventsProp,
  eventsLoading = false,
  onSuggestDateRange,
}: {
  canCrew: boolean;
  canAttendance: boolean;
  canPayroll: boolean;
  dateFrom: string;
  dateTo: string;
  /** When set, KPIs/charts scope to this event (shared People Events selection). */
  eventId?: string | null;
  /** Shared event options from the hub shell — avoids a duplicate fetch. */
  events?: PeopleEventOption[];
  eventsLoading?: boolean;
  /** When Overview window misses seeded attendance, suggest covering From–To. */
  onSuggestDateRange?: (next: { from: string; to: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
  const prevRange = useMemo(() => previousEqualRange(dateFrom, dateTo), [dateFrom, dateTo]);
  const selectedEventId = eventId || null;
  // Omit null so All-events queries are unscoped (do not send eventId: null).
  const eventScope = selectedEventId ? { eventId: selectedEventId } : {};
  const suggestedForEventRef = useRef<string | null>(null);

  const crewQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-crew",
      "hub-overview",
      selectedEventId,
    ],
    queryFn: () =>
      listPeopleEventCrew({
        status: "all",
        limit: selectedEventId ? 800 : 2000,
        ...eventScope,
      }),
    staleTime: STALE.people,
    enabled: canCrew,
  });

  const attendanceQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-attendance",
      "hub-overview",
      dateFrom,
      dateTo,
      selectedEventId,
      "lean",
    ],
    queryFn: () =>
      listPeopleEventAttendance({
        limit: selectedEventId ? 1200 : 2000,
        dateFrom,
        dateTo,
        includeRoles: false,
        ...eventScope,
      }),
    staleTime: STALE.people,
    enabled: canAttendance,
  });

  // Prior-period deltas are non-blocking — KPIs render from current window first.
  const prevAttendanceQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-attendance",
      "hub-overview-prev",
      prevRange.from,
      prevRange.to,
      selectedEventId,
      "lean",
    ],
    queryFn: () =>
      listPeopleEventAttendance({
        limit: selectedEventId ? 800 : 1200,
        dateFrom: prevRange.from,
        dateTo: prevRange.to,
        includeRoles: false,
        ...eventScope,
      }),
    staleTime: STALE.people,
    enabled: canAttendance && attendanceQ.isSuccess,
  });

  // When the selected event has attendance outside the Overview window (common after
  // seeding today±2 while the event open window is later), discover those rows and
  // ask the shell to realign From–To so KPIs/charts populate.
  const probeQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-attendance",
      "hub-range-probe",
      selectedEventId,
      "lean",
    ],
    queryFn: () =>
      listPeopleEventAttendance({
        eventId: selectedEventId!,
        limit: 400,
        includeRoles: false,
      }),
    staleTime: STALE.people,
    enabled:
      canAttendance &&
      Boolean(selectedEventId) &&
      attendanceQ.isSuccess &&
      (attendanceQ.data?.rows.length ?? 0) === 0,
  });

  useEffect(() => {
    if (!onSuggestDateRange || !selectedEventId) return;
    if (!probeQ.isSuccess) return;
    const probeRows = probeQ.data?.rows ?? [];
    if (!probeRows.length) return;
    if (suggestedForEventRef.current === selectedEventId) return;
    const next = rangeCoveringAttendanceRows(
      probeRows,
      { from: dateFrom, to: dateTo },
      EVENT_WORKFORCE_DEMO_MAX_DAYS,
    );
    if (next.from === dateFrom && next.to === dateTo) return;
    suggestedForEventRef.current = selectedEventId;
    onSuggestDateRange(next);
  }, [
    onSuggestDateRange,
    selectedEventId,
    probeQ.isSuccess,
    probeQ.data?.rows,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    if (suggestedForEventRef.current && suggestedForEventRef.current !== selectedEventId) {
      suggestedForEventRef.current = null;
    }
  }, [selectedEventId]);

  const allEvents = eventsProp ?? [];
  const events = useMemo(() => {
    const scoped = selectedEventId
      ? allEvents.filter((ev) => ev.id === selectedEventId)
      : allEvents;
    return eventsInRange(scoped, dateFrom, dateTo);
  }, [allEvents, selectedEventId, dateFrom, dateTo]);
  const crewRows = crewQ.data?.rows ?? [];
  const attendanceRows = attendanceQ.data?.rows ?? [];
  const previousAttendanceRows = prevAttendanceQ.data?.rows ?? [];

  const kpis = useMemo(
    () =>
      buildOverviewKpis({
        events,
        attendanceRows,
        previousAttendanceRows,
        previousEvents: events,
        dateFrom,
        dateTo,
      }),
    [events, attendanceRows, previousAttendanceRows, dateFrom, dateTo],
  );

  const crewAssignedFallback = useMemo(() => {
    const inWindow = activeCrewHeadcount(crewRows, dateFrom, dateTo);
    if (inWindow > 0) return inWindow;
    // Selected event: show active crew even when assignment dates sit outside the
    // Overview window (seed/date mismatch) so Assigned is not stuck at 0.
    if (selectedEventId) return activeCrewHeadcount(crewRows, dateFrom, dateTo, true);
    return 0;
  }, [crewRows, dateFrom, dateTo, selectedEventId]);

  // Prefer attendance-day headcount; fall back to active crew when All events
  // has assignments but no attendance rows in the window yet.
  const assignedDisplay =
    kpis.assignedCrew > 0
      ? kpis.assignedCrew
      : canCrew
        ? crewAssignedFallback
        : kpis.assignedCrew;

  const byEvent = useMemo(() => buildAttendanceByEvent(attendanceRows, 5), [attendanceRows]);
  const trend = useMemo(
    () => buildAttendanceTrend(attendanceRows, dateFrom, dateTo, locale),
    [attendanceRows, dateFrom, dateTo, locale],
  );
  const summaryRows = useMemo(
    () => buildEventWiseSummary(attendanceRows, events, locale, 8),
    [attendanceRows, events, locale],
  );

  // Do not block the shell on previous-period or probe — only current window + crew.
  const loading =
    (canCrew && (eventsLoading || crewQ.isLoading)) ||
    (canAttendance && attendanceQ.isLoading);

  const eventsDelta = formatDelta(kpis.eventsDeltaPct);
  const assignedDelta = formatDelta(
    kpis.assignedCrew > 0 || !canCrew ? kpis.assignedDeltaPct : null,
  );

  const quickActions: Array<{
    id: string;
    href: string;
    titleKey: string;
    subtitleKey: string;
    icon: LucideIcon;
    iconWrap: string;
    visible: boolean;
  }> = [
    {
      id: "create",
      href: "/events",
      titleKey: "peopleEvent.dashboard.actionCreateEvent",
      subtitleKey: "peopleEvent.dashboard.actionCreateEventHint",
      icon: CalendarPlus,
      iconWrap: "bg-violet-100 text-[#7c3aed]",
      visible: canCrew || canAttendance || canPayroll,
    },
    {
      id: "assign",
      href: peopleEventHref("/people/event-crew", selectedEventId),
      titleKey: "peopleEvent.dashboard.actionAssignCrew",
      subtitleKey: "peopleEvent.dashboard.actionAssignCrewHint",
      icon: UserPlus,
      iconWrap: "bg-sky-100 text-sky-700",
      visible: canCrew,
    },
    {
      id: "mark",
      href: peopleEventHref("/people/event-attendance", selectedEventId),
      titleKey: "peopleEvent.dashboard.actionMarkAttendance",
      subtitleKey: "peopleEvent.dashboard.actionMarkAttendanceHint",
      icon: ClipboardCheck,
      iconWrap: "bg-emerald-100 text-emerald-700",
      visible: canAttendance,
    },
    {
      id: "coverage",
      href: peopleEventHref("/people/event-shifts", selectedEventId),
      titleKey: "peopleEvent.dashboard.actionShiftCoverage",
      subtitleKey: "peopleEvent.dashboard.actionShiftCoverageHint",
      icon: Clock3,
      iconWrap: "bg-orange-100 text-orange-700",
      visible: canCrew,
    },
    {
      id: "report",
      href: peopleEventHref("/people/event-reports", selectedEventId),
      titleKey: "peopleEvent.dashboard.actionAttendanceReport",
      subtitleKey: "peopleEvent.dashboard.actionAttendanceReportHint",
      icon: FileBarChart2,
      iconWrap: "bg-violet-100 text-[#7c3aed]",
      visible: canAttendance,
    },
  ];

  const visibleActions = quickActions.filter((a) => a.visible);

  return (
    <div className="space-y-5">
      {loading ? (
        <KpiSkeletonStrip count={5} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            title={t("peopleEvent.dashboard.kpiTotalEvents")}
            value={eventsLoading ? "—" : kpis.totalEvents}
            meta={
              eventsDelta
                ? t("peopleEvent.dashboard.kpiVsPrevious", { delta: eventsDelta })
                : undefined
            }
            metaTone="up"
            icon={CalendarDays}
            iconClass="bg-violet-100 text-[#7c3aed]"
          />
          <KpiCard
            title={t("peopleEvent.dashboard.kpiAssignedCrew")}
            value={assignedDisplay}
            meta={
              assignedDelta
                ? t("peopleEvent.dashboard.kpiDeltaShort", { delta: assignedDelta })
                : undefined
            }
            metaTone="up"
            icon={Users}
            iconClass="bg-emerald-100 text-emerald-700"
          />
          <KpiCard
            title={t("peopleEvent.dashboard.kpiPresent")}
            value={canAttendance ? kpis.present : "—"}
            meta={canAttendance ? `${kpis.presentPct}%` : undefined}
            metaTone="blue"
            icon={CheckCircle2}
            iconClass="bg-sky-100 text-sky-700"
            valueClass="text-sky-700"
          />
          <KpiCard
            title={t("peopleEvent.dashboard.kpiLate")}
            value={canAttendance ? kpis.late : "—"}
            meta={canAttendance ? `${kpis.latePct}%` : undefined}
            metaTone="orange"
            icon={Clock3}
            iconClass="bg-orange-100 text-orange-700"
            valueClass="text-orange-600"
          />
          <KpiCard
            title={t("peopleEvent.dashboard.kpiAbsent")}
            value={canAttendance ? kpis.absent : "—"}
            meta={canAttendance ? `${kpis.absentPct}%` : undefined}
            metaTone="red"
            icon={XCircle}
            iconClass="bg-red-100 text-red-600"
            valueClass="text-red-600"
          />
        </div>
      )}

      {canAttendance ? (
        attendanceQ.isLoading ? (
          <div className="grid gap-4 xl:grid-cols-12" role="status" aria-busy="true">
            <TileSkeleton className="h-72 rounded-2xl xl:col-span-5" />
            <TileSkeleton className="h-72 rounded-2xl xl:col-span-4" />
            <TileSkeleton className="h-72 rounded-2xl xl:col-span-3" />
          </div>
        ) : (
          <PeopleEventWorkforceCharts
            attendanceByEvent={byEvent}
            attendanceTrend={trend}
            status={{
              present: kpis.present,
              late: kpis.late,
              absent: kpis.absent,
              assigned: kpis.assignedCrew || assignedDisplay,
            }}
            avgAttendancePct={kpis.avgAttendancePct}
          />
        )
      ) : null}

      {canAttendance ? (
        <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
              {t("peopleEvent.dashboard.eventWiseTitle")}
            </h3>
            <Link
              href={peopleEventHref("/people/event-attendance", selectedEventId)}
              className="text-sm font-medium text-[#7c3aed] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
            >
              {t("peopleEvent.dashboard.viewAllEvents")}
            </Link>
          </div>
          {summaryRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("peopleEvent.dashboard.chartsEmpty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.columns.event")}</th>
                    <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.columns.date")}</th>
                    <th className="pb-3 pe-3 font-semibold">{t("peopleEvent.dashboard.colLocation")}</th>
                    <th className="pb-3 pe-3 text-end font-semibold">{t("peopleEvent.dashboard.colAssigned")}</th>
                    <th className="pb-3 pe-3 text-end font-semibold">{t("peopleEvent.dashboard.colPresent")}</th>
                    <th className="pb-3 pe-3 text-end font-semibold">{t("peopleEvent.dashboard.colLate")}</th>
                    <th className="pb-3 pe-3 text-end font-semibold">{t("peopleEvent.dashboard.colAbsent")}</th>
                    <th className="pb-3 text-end font-semibold">{t("peopleEvent.dashboard.colAttendance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.eventId} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pe-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-[#7c3aed]">
                            <PartyPopper className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="truncate font-medium text-foreground">{row.eventName}</span>
                        </div>
                      </td>
                      <td className="py-3 pe-3 whitespace-nowrap text-muted-foreground">{row.dateLabel}</td>
                      <td className="py-3 pe-3 text-muted-foreground">{row.location}</td>
                      <td className="py-3 pe-3 text-end tabular-nums text-foreground">{row.assigned}</td>
                      <td className="py-3 pe-3 text-end tabular-nums text-sky-700">{row.present}</td>
                      <td className="py-3 pe-3 text-end tabular-nums text-orange-600">{row.late}</td>
                      <td className="py-3 pe-3 text-end tabular-nums text-red-600">{row.absent}</td>
                      <td className="py-3 text-end">
                        <span
                          className={cn(
                            "inline-flex min-w-[3.25rem] justify-center rounded-full px-2.5 py-1 text-xs font-semibold",
                            attendancePillClass(row.attendancePct),
                          )}
                        >
                          {row.attendancePct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {visibleActions.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.id}
                href={action.href}
                className="group flex min-h-[9.5rem] flex-col rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
              >
                <span
                  className={cn(
                    "mb-4 grid h-11 w-11 place-items-center rounded-xl",
                    action.iconWrap,
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-[15px] font-semibold tracking-tight text-foreground">
                  {t(action.titleKey)}
                </span>
                <span className="mt-1 text-sm text-muted-foreground">{t(action.subtitleKey)}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
