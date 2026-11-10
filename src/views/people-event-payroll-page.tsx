"use client";

/* Hallmark · redesign · Event Payroll page · mockup-faithful
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7c3aed)
 * design-system: FEC People/HR · designed-as-app · sibling: Crew / Roles / Overview
 * previous: HrSection + dense period table · this: KPI strip + filters + periods table
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Banknote,
  CalendarDays,
  ChevronDown,
  Search,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FecDropdown as DropdownMenu,
  FecDropdownContent as DropdownMenuContent,
  FecDropdownItem as DropdownMenuItem,
  FecDropdownTrigger as DropdownMenuTrigger,
} from "@/components/fec";
import { EventPayrollKpiStrip } from "@/components/people/event-payroll-kpi-strip";
import {
  EventPayrollPeriodsPanel,
  type EventPayrollPeriodRow,
} from "@/components/people/event-payroll-periods-panel";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventDateRangeControl } from "@/components/people/people-event-date-range-control";
import { PeopleEventSharedEventSelect } from "@/components/people/people-event-shared-event-select";
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
import { CapabilityGate } from "@/components/auth/capability-gate";
import { usePeopleEventSelection } from "@/hooks/use-people-event-selection";
import { usePermission } from "@/hooks/use-permission";
import { toCsv } from "@/lib/csv-parse";
import { createEventPayrollPeriod } from "@/lib/event-payroll.functions";
import {
  generatePayrollLines,
  listPayrollPeriodLineStats,
  listPayrollPeriods,
} from "@/lib/hr-payroll.functions";
import {
  aggregateLineStats,
  buildEventPayrollKpis,
  emptyPeriodStats,
  eventPayrollUiStatus,
  formatHours,
} from "@/lib/people-event-payroll-display";
import { peopleEventHref } from "@/lib/people-event-selection";
import { listPeopleEventOptions } from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";

type UiStatusFilter = "all" | "completed" | "open" | "in_review";

export default function PeopleEventPayrollPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { eventId, setEventId } = usePeopleEventSelection();
  const canGenerate = usePermission("payroll.generate");

  const [statusFilter, setStatusFilter] = useState<UiStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options", null],
    queryFn: () => listPeopleEventOptions({ locationId: null }),
    staleTime: STALE.events,
  });

  const periodsQ = useQuery({
    queryKey: queryKeys.people.hrPayrollPeriods({ periodKind: "event" }),
    queryFn: () => listPayrollPeriods({ status: "all", periodKind: "event" }),
    staleTime: STALE.people,
  });

  const events = eventsQ.data?.events ?? [];
  const eventById = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );

  const basePeriods = useMemo(() => {
    const all = periodsQ.data ?? [];
    return all.filter((p) => {
      const kind = (p as { periodKind?: string }).periodKind;
      if (kind && kind !== "event") return false;
      return true;
    });
  }, [periodsQ.data]);

  const periodIds = useMemo(() => basePeriods.map((p) => p.id), [basePeriods]);

  const lineStatsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-payroll-line-stats", periodIds],
    queryFn: () => listPayrollPeriodLineStats({ periodIds }),
    staleTime: STALE.people,
    enabled: periodIds.length > 0,
  });

  const statsByPeriod = useMemo(
    () => aggregateLineStats(lineStatsQ.data ?? []),
    [lineStatsQ.data],
  );

  const filteredPeriods = useMemo(() => {
    const q = search.trim().toLowerCase();
    return basePeriods.filter((p) => {
      const pid = (p as { eventId?: string | null }).eventId ?? null;
      if (eventId && pid !== eventId) return false;

      const ui = eventPayrollUiStatus(p.status);
      if (statusFilter !== "all" && ui !== statusFilter) return false;

      if (dateFrom && p.dateTo < dateFrom) return false;
      if (dateTo && p.dateFrom > dateTo) return false;

      if (q) {
        const ev = pid ? eventById.get(pid) : null;
        const hay = [
          p.displayName ?? "",
          p.month,
          ev?.name ?? "",
          ev?.eventNumber ?? "",
          "event",
          p.status,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [basePeriods, eventId, statusFilter, dateFrom, dateTo, search, eventById]);

  const tableRows: EventPayrollPeriodRow[] = useMemo(
    () =>
      filteredPeriods.map((p) => {
        const pid = (p as { eventId?: string | null }).eventId ?? null;
        const ev = pid ? eventById.get(pid) : null;
        return {
          id: p.id,
          month: p.month,
          displayName: p.displayName ?? null,
          status: p.status,
          eventId: pid,
          eventName: ev?.name ?? null,
          eventNumber: ev?.eventNumber ?? null,
          stats: statsByPeriod.get(p.id) ?? emptyPeriodStats(),
        };
      }),
    [filteredPeriods, eventById, statsByPeriod],
  );

  const uniqueCrewPaid = useMemo(() => {
    const ids = new Set<string>();
    const allowed = new Set(filteredPeriods.map((p) => p.id));
    for (const line of lineStatsQ.data ?? []) {
      if (allowed.has(line.periodId)) ids.add(line.staffId);
    }
    return ids.size;
  }, [filteredPeriods, lineStatsQ.data]);

  const kpis = useMemo(
    () => buildEventPayrollKpis(filteredPeriods, statsByPeriod, uniqueCrewPaid),
    [filteredPeriods, statsByPeriod, uniqueCrewPaid],
  );

  const selectedEvent = eventId ? eventById.get(eventId) : null;
  const setupHref = eventId
    ? `/events/${eventId}/pay`
    : selectedEvent
      ? `/events/${selectedEvent.id}/pay`
      : null;

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.people.hrPayrollPeriods({ periodKind: "event" }) }),
      qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "event-payroll-line-stats"] }),
    ]);
  }

  function emptyGenerateDescription(res: Awaited<ReturnType<typeof generatePayrollLines>>) {
    const b = res.blockers;
    if (!b) return t("peopleEvent.payroll.generateEmptyHint");
    return t("peopleEvent.payroll.generateEmptyHintCounts", {
      eligible: b.eligibleStaff,
      overlapping: b.overlappingOpenWindow,
      attendance: b.attendanceDays,
      rates: b.staffWithDayRate,
      management: b.managementExcluded,
    });
  }

  async function generateForPeriod(periodId: string) {
    setBusy(true);
    try {
      const res = await generatePayrollLines({ periodId });
      await refresh();
      if (res.inserted <= 0) {
        toast.warning(t("peopleEvent.payroll.generateEmpty"), {
          description: emptyGenerateDescription(res),
        });
        return;
      }
      toast.success(t("events.payroll.toasts.generated", { n: res.inserted }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createPeriod() {
    if (!eventId) {
      toast.error(t("peopleEvent.payroll.needEvent"));
      return;
    }
    setBusy(true);
    try {
      const created = await createEventPayrollPeriod({ eventId });
      toast.success(
        created.windowSynced
          ? t("events.payroll.toasts.windowSynced")
          : created.reused
            ? t("events.payroll.toasts.exists")
            : t("events.payroll.toasts.created"),
      );
      // Create alone leaves KPIs at 0 — generate lines immediately for the selected event.
      try {
        const res = await generatePayrollLines({ periodId: created.id });
        await refresh();
        if (res.inserted > 0) {
          toast.success(t("events.payroll.toasts.generated", { n: res.inserted }));
        } else {
          toast.warning(t("peopleEvent.payroll.generateEmpty"), {
            description: emptyGenerateDescription(res),
          });
        }
      } catch (genErr) {
        await refresh();
        toast.error((genErr as Error).message);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const generateTargetPeriodId = useMemo(() => {
    if (!eventId) return null;
    const forEvent = filteredPeriods.filter(
      (p) => ((p as { eventId?: string | null }).eventId ?? null) === eventId,
    );
    if (!forEvent.length) return null;
    const withoutLines = forEvent.find((p) => (statsByPeriod.get(p.id)?.crewCount ?? 0) === 0);
    return (withoutLines ?? forEvent[0])!.id;
  }, [eventId, filteredPeriods, statsByPeriod]);

  /** Selected event has no pay period yet — Create/Generate both create + generate. */
  const noPeriodForEvent = Boolean(eventId) && !generateTargetPeriodId;

  function exportCsv() {
    if (!tableRows.length) return;
    const csv = toCsv(
      [
        "payroll_month",
        "display_name",
        "event_number",
        "event_name",
        "cycle",
        "crew_count",
        "total_hours",
        "payroll_amount_qar",
        "status",
        "date_from",
        "date_to",
        "period_id",
      ],
      tableRows.map((r) => {
        const period = filteredPeriods.find((p) => p.id === r.id);
        return [
          r.month,
          r.displayName ?? "",
          r.eventNumber ?? "",
          r.eventName ?? "",
          "Event",
          String(r.stats.crewCount),
          formatHours(r.stats.totalHours, "en"),
          String(r.stats.payrollAmountQar),
          r.status,
          period?.dateFrom ?? "",
          period?.dateTo ?? "",
          r.id,
        ];
      }),
    );
    downloadCsvContent(csv, "event-payroll-periods.csv");
  }

  return (
    <CapabilityGate
      capability="payroll.view"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("peopleEvent.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <div className="ea-event-payroll space-y-5">
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
                  <Banknote className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    <Link
                      href={peopleEventHref("/people/events", eventId)}
                      className="hover:text-[#7c3aed] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
                    >
                      {t("peopleEvent.payroll.breadcrumb")}
                    </Link>
                  </p>
                  <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                    {t("peopleEvent.payroll.title")}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {t("peopleEvent.payroll.subtitle")}
                  </p>
                </div>
              </div>

              <div className="relative flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto lg:justify-end">
                <PeopleEventSharedEventSelect
                  eventId={eventId}
                  events={events}
                  onEventIdChange={setEventId}
                  className="w-full sm:w-auto"
                  triggerClassName="border-border/80 bg-white"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-xl border-border/80 bg-white"
                    >
                      <CalendarDays className="me-1.5 h-3.5 w-3.5" aria-hidden />
                      {t("peopleEvent.links.allPayroll")}
                      <ChevronDown className="ms-1.5 h-3.5 w-3.5 opacity-80" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[14rem]">
                    <DropdownMenuItem asChild>
                      <Link href="/people/payroll">{t("peopleEvent.links.allPayroll")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/people/payroll?periodKind=event">
                        {t("peopleEvent.payroll.filterEventOnly")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/people/payroll?periodKind=monthly">
                        {t("peopleEvent.payroll.filterMonthly")}
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {setupHref ? (
                  <Button
                    asChild
                    size="sm"
                    className="h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9] focus-visible:ring-[#7c3aed]/40"
                  >
                    <Link href={setupHref}>
                      <Settings2 className="me-1.5 h-3.5 w-3.5" aria-hidden />
                      {t("peopleEvent.links.openEventPay")}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled
                    title={t("peopleEvent.payroll.needEvent")}
                    className="h-10 rounded-xl bg-[#7c3aed] px-4 text-white opacity-60"
                  >
                    <Settings2 className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    {t("peopleEvent.links.openEventPay")}
                  </Button>
                )}
              </div>
            </div>
          </header>

          <PeopleEventWorkforceTabs active="payroll" variant="pills" eventId={eventId} />

          <EventPayrollKpiStrip
            kpis={kpis}
            isLoading={periodsQ.isLoading || (periodIds.length > 0 && lineStatsQ.isLoading)}
            locale={locale}
          />

          <section className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("peopleEvent.filters.status")}
                  </label>
                  <div className="relative">
                    <Activity
                      className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => setStatusFilter(v as UiStatusFilter)}
                    >
                      <SelectTrigger className="h-10 rounded-xl ps-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("peopleEvent.payroll.allStatuses")}</SelectItem>
                        <SelectItem value="completed">
                          {t("peopleEvent.payroll.statusCompleted")}
                        </SelectItem>
                        <SelectItem value="open">{t("peopleEvent.payroll.statusOpen")}</SelectItem>
                        <SelectItem value="in_review">
                          {t("peopleEvent.payroll.statusInReview")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="min-w-0 sm:col-span-2 lg:col-span-1 lg:min-w-[18rem]">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("peopleEvent.payroll.dateRange")}
                  </label>
                  <PeopleEventDateRangeControl
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFrom={setDateFrom}
                    onDateTo={setDateTo}
                    fromId="event-payroll-date-from"
                    toId="event-payroll-date-to"
                    className="border-border/70"
                  />
                </div>
              </div>

              <div className="relative w-full min-w-0 xl:max-w-sm">
                <label className="sr-only" htmlFor="event-payroll-search">
                  {t("peopleEvent.filters.search")}
                </label>
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="event-payroll-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("peopleEvent.payroll.searchPlaceholder")}
                  className="h-10 rounded-xl ps-9"
                />
              </div>
            </div>
          </section>

          <EventPayrollPeriodsPanel
            rows={tableRows}
            isLoading={periodsQ.isLoading}
            canCreate={canGenerate}
            createBusy={busy}
            createDisabled={!eventId}
            createAndGenerateMode={noPeriodForEvent}
            hasEvent={Boolean(eventId)}
            setupHref={setupHref}
            canGenerate={canGenerate}
            generateBusy={busy}
            generateDisabled={!eventId}
            generateNeedsLines={
              noPeriodForEvent ||
              Boolean(
                generateTargetPeriodId &&
                  (statsByPeriod.get(generateTargetPeriodId)?.crewCount ?? 0) === 0,
              )
            }
            onCreate={() => void createPeriod()}
            onGenerate={() => {
              if (!eventId) {
                toast.error(t("peopleEvent.payroll.needEvent"));
                return;
              }
              // No period yet: same path as Create (create period + generate lines).
              if (!generateTargetPeriodId) {
                void createPeriod();
                return;
              }
              void generateForPeriod(generateTargetPeriodId);
            }}
            onGeneratePeriod={(periodId) => void generateForPeriod(periodId)}
            onExportCsv={exportCsv}
            locale={locale}
          />
        </div>
      </HrShell>
    </CapabilityGate>
  );
}
