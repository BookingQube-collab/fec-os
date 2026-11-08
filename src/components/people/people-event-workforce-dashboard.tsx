"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CalendarDays,
  ExternalLink,
  FolderKanban,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { HrPanel } from "@/components/hr/hr-panel";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENT_STATUSES } from "@/lib/events/constants";
import { assignmentTypeLabel } from "@/lib/events/staff-assignments";
import { listPayrollPeriods } from "@/lib/hr-payroll.functions";
import {
  listPeopleEventAttendance,
  listPeopleEventCrew,
  listPeopleEventOptions,
} from "@/lib/people-event-workforce.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

import type { DayCount, NamedCount } from "./people-event-workforce-charts";

const PeopleEventWorkforceCharts = dynamic(
  () =>
    import("@/components/people/people-event-workforce-charts").then(
      (m) => m.PeopleEventWorkforceCharts,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    ),
  },
);

function countBy<T>(
  rows: T[],
  keyFn: (row: T) => string,
  labelFn: (key: string) => string,
  limit?: number,
): NamedCount[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const list = [...map.entries()]
    .map(([key, count]) => ({ key, label: labelFn(key), count }))
    .sort((a, b) => b.count - a.count);
  return limit ? list.slice(0, limit) : list;
}

function formatDayLabel(ymd: string): string {
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}`;
}

export function PeopleEventWorkforceDashboard({
  canCrew,
  canAttendance,
  canPayroll,
}: {
  canCrew: boolean;
  canAttendance: boolean;
  canPayroll: boolean;
}) {
  const { t } = useTranslation();

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options", "hub"],
    queryFn: () => listPeopleEventOptions({ limit: 200 }),
    staleTime: STALE.events,
    enabled: canCrew || canAttendance || canPayroll,
  });

  const crewQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-crew", "hub-overview"],
    queryFn: () => listPeopleEventCrew({ status: "all", limit: 2000 }),
    staleTime: STALE.people,
    enabled: canCrew,
  });

  const attendanceQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-attendance", "hub-overview"],
    queryFn: () => listPeopleEventAttendance({ limit: 2000 }),
    staleTime: STALE.people,
    enabled: canAttendance,
  });

  const periodsQ = useQuery({
    queryKey: queryKeys.people.hrPayrollPeriods({ periodKind: "event", hub: true }),
    queryFn: () => listPayrollPeriods({ status: "all", periodKind: "event" }),
    staleTime: STALE.people,
    enabled: canPayroll,
  });

  const events = eventsQ.data?.events ?? [];
  const crewRows = crewQ.data?.rows ?? [];
  const attendanceRows = attendanceQ.data?.rows ?? [];
  const periods = (periodsQ.data ?? []).filter((p) => {
    const kind = (p as { periodKind?: string }).periodKind;
    return !kind || kind === "event";
  });

  const activeCrew = useMemo(
    () => crewRows.filter((r) => r.status === "active").length,
    [crewRows],
  );
  const closedCrew = useMemo(
    () => crewRows.filter((r) => r.status === "closed").length,
    [crewRows],
  );
  const uniqueCrewPeople = useMemo(
    () => new Set(crewRows.filter((r) => r.status === "active").map((r) => r.staffId)).size,
    [crewRows],
  );
  const missedPunches = useMemo(
    () => attendanceRows.filter((r) => r.missedPunch).length,
    [attendanceRows],
  );
  const openEvents = useMemo(() => {
    const closed = new Set(["cancelled", "closed"]);
    return events.filter((e) => {
      const s = (e.status ?? "").toLowerCase();
      if (!s) return true;
      if ((EVENT_STATUSES as readonly string[]).includes(s)) return !closed.has(s);
      return !closed.has(s);
    }).length;
  }, [events]);

  const crewByType = useMemo(
    () =>
      countBy(
        crewRows.filter((r) => r.status === "active"),
        (r) => r.assignmentType || "unknown",
        (key) => assignmentTypeLabel(key),
      ),
    [crewRows],
  );

  const crewByEvent = useMemo(
    () =>
      countBy(
        crewRows.filter((r) => r.status === "active"),
        (r) => r.eventId,
        (key) => {
          const row = crewRows.find((r) => r.eventId === key);
          return row?.eventName ?? key.slice(0, 8);
        },
        8,
      ),
    [crewRows],
  );

  const attendanceByStatus = useMemo(
    () =>
      countBy(
        attendanceRows,
        (r) => (r.status || "unknown").toLowerCase(),
        (key) => key.replace(/_/g, " "),
      ),
    [attendanceRows],
  );

  const attendanceByDay: DayCount[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of attendanceRows) {
      map.set(row.workDate, (map.get(row.workDate) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-21)
      .map(([date, count]) => ({ date, label: formatDayLabel(date), count }));
  }, [attendanceRows]);

  const payrollByStatus = useMemo(
    () =>
      countBy(
        periods,
        (p) => p.status || "unknown",
        (key) => t(`hr.payrollRuns.status.${key}`, { defaultValue: key }),
      ),
    [periods, t],
  );

  const loading =
    (canCrew && (eventsQ.isLoading || crewQ.isLoading)) ||
    (canAttendance && attendanceQ.isLoading) ||
    (canPayroll && periodsQ.isLoading);

  const kpis: Array<{
    key: string;
    title: string;
    value: string | number;
    hint?: string;
    tint: KpiTint;
    icon: typeof Users;
    href?: string;
    visible: boolean;
  }> = [
    {
      key: "events",
      title: t("peopleEvent.dashboard.kpiOpenEvents"),
      value: eventsQ.isLoading ? "—" : openEvents,
      hint: t("peopleEvent.dashboard.kpiOpenEventsHint", { total: events.length }),
      tint: "orange",
      icon: CalendarDays,
      href: canCrew ? "/people/event-crew" : undefined,
      visible: canCrew || canAttendance || canPayroll,
    },
    {
      key: "crew-active",
      title: t("peopleEvent.dashboard.kpiActiveCrew"),
      value: crewQ.isLoading ? "—" : activeCrew,
      hint: t("peopleEvent.dashboard.kpiActiveCrewHint", {
        people: uniqueCrewPeople,
        closed: closedCrew,
      }),
      tint: "sky",
      icon: FolderKanban,
      href: "/people/event-crew",
      visible: canCrew,
    },
    {
      key: "attendance",
      title: t("peopleEvent.dashboard.kpiAttendanceDays"),
      value: attendanceQ.isLoading ? "—" : attendanceRows.length,
      hint: t("peopleEvent.dashboard.kpiAttendanceDaysHint", { missed: missedPunches }),
      tint: missedPunches > 0 ? "amber" : "green",
      icon: Users,
      href: "/people/event-attendance",
      visible: canAttendance,
    },
    {
      key: "payroll",
      title: t("peopleEvent.dashboard.kpiPayrollPeriods"),
      value: periodsQ.isLoading ? "—" : periods.length,
      hint: t("peopleEvent.dashboard.kpiPayrollPeriodsHint"),
      tint: "slate",
      icon: Banknote,
      href: "/people/event-payroll",
      visible: canPayroll,
    },
  ];

  const visibleKpis = kpis.filter((k) => k.visible);

  const modules: Array<{
    id: string;
    href: string;
    titleKey: string;
    subtitleKey: string;
    icon: typeof FolderKanban;
    visible: boolean;
  }> = [
    {
      id: "crew",
      href: "/people/event-crew",
      titleKey: "peopleEvent.crew.title",
      subtitleKey: "peopleEvent.crew.subtitle",
      icon: FolderKanban,
      visible: canCrew,
    },
    {
      id: "shifts",
      href: "/people/event-shifts",
      titleKey: "peopleEvent.shifts.title",
      subtitleKey: "peopleEvent.shifts.subtitle",
      icon: CalendarClock,
      visible: canCrew,
    },
    {
      id: "attendance",
      href: "/people/event-attendance",
      titleKey: "peopleEvent.attendance.title",
      subtitleKey: "peopleEvent.attendance.subtitle",
      icon: CalendarDays,
      visible: canAttendance,
    },
    {
      id: "payroll",
      href: "/people/event-payroll",
      titleKey: "peopleEvent.payroll.title",
      subtitleKey: "peopleEvent.payroll.subtitle",
      icon: Banknote,
      visible: canPayroll,
    },
  ];

  return (
    <div className="space-y-6">
      {loading && visibleKpis.length > 0 ? (
        <KpiSkeletonStrip count={Math.min(4, visibleKpis.length)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleKpis.map((kpi) => (
            <TintedKpiCard
              key={kpi.key}
              title={kpi.title}
              value={kpi.value}
              hint={kpi.hint}
              tint={kpi.tint}
              icon={kpi.icon}
              compact
              href={kpi.href}
              viewLabel={t("peopleEvent.hub.openModule")}
            />
          ))}
        </div>
      )}

      {(canCrew || canAttendance || canPayroll) && (
        <PeopleEventWorkforceCharts
          crewByType={crewByType}
          attendanceByStatus={attendanceByStatus}
          attendanceByDay={attendanceByDay}
          crewByEvent={crewByEvent}
          payrollByStatus={payrollByStatus}
          showCrew={canCrew}
          showAttendance={canAttendance}
          showPayroll={canPayroll}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules
          .filter((m) => m.visible)
          .map((mod, index) => {
            const Icon = mod.icon;
            return (
              <HrPanel key={mod.id} delay={index} className="h-full">
                <Link
                  href={mod.href}
                  className="group flex h-full flex-col gap-3 rounded-2xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      {canAttendance ? (
        <HrPanel delay={modules.filter((m) => m.visible).length || 1}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {t("peopleEvent.dashboard.correctionsTitle")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("peopleEvent.hub.correctionsHint")}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href="/people/event-attendance">
                {t("peopleEvent.links.openAttendance")}
              </Link>
            </Button>
          </div>
        </HrPanel>
      ) : null}
    </div>
  );
}
