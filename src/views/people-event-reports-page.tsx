"use client";

/* Hallmark · redesign · HR Event Reports · sibling to Event Attendance
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7c3aed)
 * design-system: FEC People/HR · designed-as-app
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Download,
  ExternalLink,
  FileBarChart,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { EventAttendanceKpiStrip } from "@/components/people/event-attendance-kpi-strip";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventDateRangeControl } from "@/components/people/people-event-date-range-control";
import { PeopleEventSharedEventSelect } from "@/components/people/people-event-shared-event-select";
import { PeopleEventWorkforceDemoTools } from "@/components/people/people-event-workforce-demo-tools";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { DownloadReportButton } from "@/components/reports/download-report-button";
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
import { useEventRoles } from "@/hooks/queries/useEvents";
import { usePeopleEventSelection } from "@/hooks/use-people-event-selection";
import { useReportExport } from "@/hooks/use-report-export";
import { buildAttendanceCsv } from "@/lib/attendance-display";
import { toCsv } from "@/lib/csv-parse";
import { EVENT_WORKFORCE_DEMO_MAX_DAYS } from "@/lib/events/event-workforce-demo";
import {
  buildEventAttendancePageKpis,
  buildEventAttendanceStatusCounts,
  buildEventAttendanceTrendForRange,
  filterEventAttendanceRowsByRole,
  previousEqualRange,
  toEventAttendanceSummaryRow,
} from "@/lib/people-event-attendance-display";
import {
  defaultOverviewRange,
  rangeForSelectedEvent,
} from "@/lib/people-event-attendance-overview";
import {
  buildEventReportsByRole,
  buildEventReportsDailySummary,
} from "@/lib/people-event-reports-display";
import { peopleEventHref } from "@/lib/people-event-selection";
import { eventSiteOptionsFromEvents } from "@/lib/people-event-site-options";
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

export default function PeopleEventReportsPage() {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();
  const { eventId, setEventId } = usePeopleEventSelection();

  const initialRange = useMemo(() => defaultOverviewRange(), []);
  const urlHadRange = Boolean(
    ymdOrEmpty(searchParams.get("from")) && ymdOrEmpty(searchParams.get("to")),
  );
  const [locationId, setLocationId] = useState(() => uuidOrEmpty(searchParams.get("locationId")));
  const [dateFrom, setDateFrom] = useState(
    () => ymdOrEmpty(searchParams.get("from")) || initialRange.from,
  );
  const [dateTo, setDateTo] = useState(
    () => ymdOrEmpty(searchParams.get("to")) || initialRange.to,
  );
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [roleId, setRoleId] = useState(() => uuidOrEmpty(searchParams.get("roleId")));
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
      "reports",
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
      "reports-prev",
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
  const selectedEvent = eventId ? allEvents.find((e) => e.id === eventId) : null;

  useEffect(() => {
    if (!locationId || !eventsQ.isSuccess) return;
    if (eventSites.some((site) => site.id === locationId)) return;
    setLocationId("");
  }, [locationId, eventSites, eventsQ.isSuccess]);

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
  const byRole = useMemo(
    () => buildEventReportsByRole(rows, roleOptions),
    [rows, roleOptions],
  );
  const daily = useMemo(
    () => buildEventReportsDailySummary(rows, dateFrom, dateTo),
    [rows, dateFrom, dateTo],
  );

  const venueLabel = selectedEvent
    ? [selectedEvent.eventNumber, selectedEvent.name].filter(Boolean).join(" · ") ||
      selectedEvent.name
    : t("peopleEvent.filters.allEvents");

  const exportTableRows = useMemo(
    () =>
      byRole.map((r) => ({
        role: r.roleLabel,
        staff: r.staffCount,
        records: r.records,
        present: r.present,
        late: r.late,
        absent: r.absent,
        complete: r.complete,
        missingPunch: r.missingPunch,
        overtimeHours: r.overtimeHours,
        attendancePct: r.attendancePct,
      })),
    [byRole],
  );

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "HR_Event_Reports",
    title: t("peopleEvent.reports.title"),
    venueLabel,
    filters: {
      from: dateFrom || null,
      to: dateTo || null,
      site: locationId
        ? eventSites.find((s) => s.id === locationId)?.label ?? locationId
        : null,
      role: roleId
        ? roleOptions.find((r) => r.id === roleId)?.name ?? roleId
        : null,
      search: search.trim() || null,
    },
    kpis: [
      { label: t("peopleEvent.attendance.kpiTotalRecords"), value: kpis.totalRecords },
      { label: t("peopleEvent.attendance.kpiStaff"), value: kpis.staffWithAttendance },
      { label: t("peopleEvent.attendance.kpiComplete"), value: kpis.complete },
      { label: t("peopleEvent.attendance.kpiMissing"), value: kpis.missingPunch },
      { label: t("peopleEvent.attendance.kpiOvertime"), value: `${kpis.overtimeHours} h` },
      { label: t("peopleEvent.attendance.kpiLate"), value: kpis.lateEarlyLeave },
    ],
    columns: [
      { key: "role", header: t("peopleEvent.reports.colRole") },
      { key: "staff", header: t("peopleEvent.reports.colStaff") },
      { key: "records", header: t("peopleEvent.reports.colRecords") },
      { key: "present", header: t("peopleEvent.dashboard.colPresent") },
      { key: "late", header: t("peopleEvent.dashboard.colLate") },
      { key: "absent", header: t("peopleEvent.dashboard.colAbsent") },
      { key: "complete", header: t("peopleEvent.attendance.statusComplete") },
      { key: "missingPunch", header: t("peopleEvent.attendance.statusMissing") },
      { key: "overtimeHours", header: t("peopleEvent.attendance.kpiOvertime") },
      { key: "attendancePct", header: t("peopleEvent.dashboard.colAttendance"), format: "pct" },
    ],
    rows: exportTableRows,
  });

  const exportCsvPack = () => {
    const roleCsv = toCsv(
      [
        t("peopleEvent.reports.colRole"),
        t("peopleEvent.reports.colStaff"),
        t("peopleEvent.reports.colRecords"),
        t("peopleEvent.dashboard.colPresent"),
        t("peopleEvent.dashboard.colLate"),
        t("peopleEvent.dashboard.colAbsent"),
        t("peopleEvent.attendance.statusComplete"),
        t("peopleEvent.attendance.statusMissing"),
        t("peopleEvent.attendance.kpiOvertime"),
        t("peopleEvent.dashboard.colAttendance"),
      ],
      byRole.map((r) => [
        r.roleLabel,
        r.staffCount,
        r.records,
        r.present,
        r.late,
        r.absent,
        r.complete,
        r.missingPunch,
        r.overtimeHours,
        r.attendancePct,
      ]),
    );
    const dayCsv = toCsv(
      [
        t("peopleEvent.columns.date"),
        t("peopleEvent.reports.colRecords"),
        t("peopleEvent.dashboard.colPresent"),
        t("peopleEvent.dashboard.colLate"),
        t("peopleEvent.dashboard.colAbsent"),
        t("peopleEvent.attendance.statusMissing"),
        t("peopleEvent.attendance.kpiOvertime"),
        t("peopleEvent.dashboard.colAttendance"),
      ],
      daily.map((d) => [
        d.date,
        d.records,
        d.present,
        d.late,
        d.absent,
        d.missingPunch,
        d.overtimeHours,
        d.attendancePct,
      ]),
    );
    const attendanceCsv = rows.length
      ? buildAttendanceCsv(rows.map(toEventAttendanceSummaryRow))
      : "";
    const chunks = [
      `# ${t("peopleEvent.reports.byRoleTitle")}`,
      roleCsv,
      "",
      `# ${t("peopleEvent.reports.byDayTitle")}`,
      dayCsv,
    ];
    if (attendanceCsv) {
      chunks.push("", `# ${t("peopleEvent.attendance.tableTitle", { n: rows.length })}`, attendanceCsv);
    }
    downloadCsvContent(
      chunks.join("\n"),
      `hr-event-reports-${dateFrom || "all"}-${dateTo || "all"}.csv`,
    );
  };

  const attendanceHref = peopleEventHref("/people/event-attendance", eventId);

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
        <div className="ea-event-reports space-y-5">
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
                  <FileBarChart className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    <Link
                      href={peopleEventHref("/people/events", eventId)}
                      className="hover:text-[#7c3aed] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
                    >
                      {t("peopleEvent.kicker")}
                    </Link>
                    <span aria-hidden> › </span>
                    <span>{t("peopleEvent.reports.title")}</span>
                  </p>
                  <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                    {t("peopleEvent.reports.title")}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {t("peopleEvent.reports.subtitle")}
                  </p>
                </div>
              </div>

              <div className="relative flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto lg:justify-end">
                <PeopleEventSharedEventSelect
                  eventId={eventId}
                  events={allEvents}
                  onEventIdChange={setEventId}
                  className="w-full sm:w-auto"
                  triggerClassName="border-border/80 bg-white"
                />
                <DownloadReportButton
                  onCsv={exportCsvPack}
                  onPdf={() => void exportPdf()}
                  onExcel={() => void exportExcel()}
                  disabled={!rows.length && !byRole.length}
                  label={t("peopleEvent.reports.download")}
                  csvLabel={t("peopleEvent.bulk.exportCsv")}
                  pdfLabel={t("peopleEvent.reports.exportPdf")}
                  excelLabel={t("peopleEvent.reports.exportExcel")}
                />
                <Button
                  asChild
                  size="sm"
                  className="h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9] focus-visible:ring-[#7c3aed]/40"
                >
                  <Link href={attendanceHref}>
                    <ExternalLink className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    {t("peopleEvent.links.openAttendance")}
                  </Link>
                </Button>
              </div>
            </div>
          </header>

          <PeopleEventWorkforceTabs active="reports" variant="pills" eventId={eventId} />

          <EventAttendanceKpiStrip kpis={kpis} isLoading={attendanceQ.isLoading} />

          <section className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                    onValueChange={(v) => setRoleId(v === "all" ? "" : v)}
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

              <div className="min-w-0 sm:col-span-2 xl:col-span-1 xl:min-w-[18rem]">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("peopleEvent.filters.dateRange")}
                </label>
                <PeopleEventDateRangeControl
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateFrom={setDateFrom}
                  onDateTo={setDateTo}
                  fromId="event-reports-date-from"
                  toId="event-reports-date-to"
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
                    onChange={(e) => setSearch(e.target.value)}
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
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
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

          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                {t("peopleEvent.reports.byRoleTitle")}
              </h2>
              <Button
                size="sm"
                variant="outline"
                disabled={!byRole.length}
                onClick={exportCsvPack}
                className="h-9 rounded-xl border-border/80 bg-white"
              >
                <Download className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("peopleEvent.bulk.exportCsv")}
              </Button>
            </div>
            {attendanceQ.isLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : byRole.length === 0 ? (
              <HrEmptyState
                message={t("peopleEvent.reports.empty")}
                hint={t("peopleEvent.reports.emptyHint")}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2 text-start">{t("peopleEvent.reports.colRole")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.reports.colStaff")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.reports.colRecords")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.dashboard.colPresent")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.dashboard.colLate")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.dashboard.colAbsent")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.attendance.statusMissing")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.attendance.kpiOvertime")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.dashboard.colAttendance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byRole.map((r) => (
                      <tr key={r.roleKey} className="border-b border-border/40 last:border-0">
                        <td className="px-2 py-2.5 font-medium text-foreground">{r.roleLabel}</td>
                        <td className="px-2 py-2.5 text-end tabular-nums">{r.staffCount}</td>
                        <td className="px-2 py-2.5 text-end tabular-nums">{r.records}</td>
                        <td className="px-2 py-2.5 text-end tabular-nums text-emerald-700">{r.present}</td>
                        <td className="px-2 py-2.5 text-end tabular-nums text-amber-700">{r.late}</td>
                        <td className="px-2 py-2.5 text-end tabular-nums text-rose-700">{r.absent}</td>
                        <td className="px-2 py-2.5 text-end tabular-nums text-orange-700">
                          {r.missingPunch}
                        </td>
                        <td className="px-2 py-2.5 text-end tabular-nums">{r.overtimeHours} h</td>
                        <td className="px-2 py-2.5 text-end tabular-nums font-semibold text-[#7c3aed]">
                          {r.attendancePct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-5">
            <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-foreground">
              {t("peopleEvent.reports.byDayTitle")}
            </h2>
            {attendanceQ.isLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : daily.every((d) => d.records === 0) ? (
              <HrEmptyState message={t("peopleEvent.reports.empty")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2 text-start">{t("peopleEvent.columns.date")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.reports.colRecords")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.dashboard.colPresent")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.dashboard.colLate")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.dashboard.colAbsent")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.attendance.statusMissing")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.attendance.kpiOvertime")}</th>
                      <th className="px-2 py-2 text-end">{t("peopleEvent.dashboard.colAttendance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily
                      .filter((d) => d.records > 0)
                      .map((d) => (
                        <tr key={d.date} className="border-b border-border/40 last:border-0">
                          <td className="px-2 py-2.5 font-medium tabular-nums">{d.date}</td>
                          <td className="px-2 py-2.5 text-end tabular-nums">{d.records}</td>
                          <td className="px-2 py-2.5 text-end tabular-nums text-emerald-700">{d.present}</td>
                          <td className="px-2 py-2.5 text-end tabular-nums text-amber-700">{d.late}</td>
                          <td className="px-2 py-2.5 text-end tabular-nums text-rose-700">{d.absent}</td>
                          <td className="px-2 py-2.5 text-end tabular-nums text-orange-700">
                            {d.missingPunch}
                          </td>
                          <td className="px-2 py-2.5 text-end tabular-nums">{d.overtimeHours} h</td>
                          <td className="px-2 py-2.5 text-end tabular-nums font-semibold text-[#7c3aed]">
                            {d.attendancePct}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </HrShell>
    </CapabilityGate>
  );
}
