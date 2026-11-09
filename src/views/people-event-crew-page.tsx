"use client";

/* Hallmark · redesign · Event Crew page · mockup-faithful
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7c3aed)
 * design-system: FEC People/HR · designed-as-app · sibling: Event Attendance overview
 * previous: dense HR table shell · this: KPI strip + filter bar + assignments table/cards
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  Download,
  Layers,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  EventStaffBulkCreateDialog,
  EventStaffIndividualCreateDialog,
} from "@/components/events/event-staff-create-dialogs";
import {
  FecDropdown as DropdownMenu,
  FecDropdownContent as DropdownMenuContent,
  FecDropdownItem as DropdownMenuItem,
  FecDropdownTrigger as DropdownMenuTrigger,
} from "@/components/fec";
import { EventCrewAssignmentsPanel } from "@/components/people/event-crew-assignments-panel";
import { EventCrewKpiStrip } from "@/components/people/event-crew-kpi-strip";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
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
import { usePermission } from "@/hooks/use-permission";
import { canActorPerform } from "@/lib/arcade/access";
import { toCsv } from "@/lib/csv-parse";
import type { Capability } from "@/lib/rbac";
import {
  bulkCloseEventStaffAssignments,
  bulkDeleteEventStaffAssignments,
  bulkReopenEventStaffAssignments,
  bulkUpdateEventStaffAssignmentDates,
} from "@/lib/event-staff-assignments.functions";
import {
  assignmentTypeLabel,
  EVENT_STAFF_ASSIGNMENT_TYPES,
} from "@/lib/events/staff-assignments";
import { findStaffingShortageDays } from "@/lib/events/staffing-shortage";
import { getEventSchedule } from "@/lib/event-schedule.functions";
import {
  assignmentOverlapsRange,
  buildCrewKpis,
  defaultCrewRange,
} from "@/lib/people-event-crew-display";
import {
  eventSiteOptionsFromEvents,
  filterPeopleEventsByLocation,
} from "@/lib/people-event-site-options";
import {
  listPeopleEventAttendance,
  listPeopleEventCrew,
  listPeopleEventOptions,
} from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";

function uuidOrEmpty(v: string | null): string {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PeopleEventCrewPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const canEdit = usePermission("events.edit");
  const canHire = usePermission("people.edit_roster");
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
  const canAttendance = canActorPerform(roles, "attendance.view", actorOpts);

  const initialRange = useMemo(() => defaultCrewRange(), []);
  const [eventId, setEventId] = useState(() => uuidOrEmpty(searchParams.get("eventId")));
  const [locationId, setLocationId] = useState(() => uuidOrEmpty(searchParams.get("locationId")));
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [assignmentType, setAssignmentType] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "closed">("active");
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [individualOpen, setIndividualOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);

  const today = useMemo(() => todayYmd(), []);

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options"],
    queryFn: () => listPeopleEventOptions({ locationId: null }),
    staleTime: STALE.events,
  });

  const crewQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-crew",
      eventId || null,
      locationId || null,
      assignmentType,
      status,
      search.trim() || null,
    ],
    queryFn: () =>
      listPeopleEventCrew({
        eventId: eventId || null,
        locationId: locationId || null,
        assignmentType: assignmentType === "all" ? null : assignmentType,
        status,
        search: search.trim() || null,
      }),
    staleTime: STALE.people,
  });

  /** Broader load for KPI totals / period deltas (status=all, same other filters). */
  const crewKpiQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-crew-kpi",
      eventId || null,
      locationId || null,
      assignmentType,
      search.trim() || null,
    ],
    queryFn: () =>
      listPeopleEventCrew({
        eventId: eventId || null,
        locationId: locationId || null,
        assignmentType: assignmentType === "all" ? null : assignmentType,
        status: "all",
        search: search.trim() || null,
        limit: 2000,
      }),
    staleTime: STALE.people,
  });

  const attendanceTodayQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-attendance", "crew-today", today, eventId || null, locationId || null],
    queryFn: () =>
      listPeopleEventAttendance({
        eventId: eventId || null,
        locationId: locationId || null,
        dateFrom: today,
        dateTo: today,
        limit: 2000,
      }),
    staleTime: STALE.people,
    enabled: canAttendance,
  });

  const allRows = crewQ.data?.rows ?? [];
  const rows = useMemo(
    () => allRows.filter((r) => assignmentOverlapsRange(r, dateFrom, dateTo)),
    [allRows, dateFrom, dateTo],
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
  const createEvents = useMemo(
    () =>
      events.map((ev) => ({
        id: ev.id,
        name: ev.name,
        dateFrom: ev.dateFrom,
        dateTo: ev.dateTo,
      })),
    [events],
  );
  const selectedIds = useMemo(() => [...selected], [selected]);

  const kpis = useMemo(
    () =>
      buildCrewKpis({
        crewRows: crewKpiQ.data?.rows ?? [],
        attendanceToday: attendanceTodayQ.data?.rows ?? [],
        rangeFrom: dateFrom,
        rangeTo: dateTo,
        todayYmd: today,
      }),
    [crewKpiQ.data?.rows, attendanceTodayQ.data?.rows, dateFrom, dateTo, today],
  );

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

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "event-crew"] }),
      qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "event-crew-kpi"] }),
    ]);
    setSelected(new Set());
  }

  const shortageQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-crew-shortage", eventId || null],
    queryFn: async () => {
      if (!eventId) return [] as ReturnType<typeof findStaffingShortageDays>;
      const [crew, schedule] = await Promise.all([
        listPeopleEventCrew({ eventId, status: "all" }),
        getEventSchedule({ eventId }),
      ]);
      return findStaffingShortageDays({
        assignments: crew.rows.map((r) => ({
          staff_id: r.staffId,
          date_from: r.dateFrom,
          date_to: r.dateTo,
          status: r.status,
        })),
        slots: schedule.slots.map((s) => ({
          work_date: s.work_date,
          staff_id: s.staff_id,
        })),
        minScheduled: 1,
      });
    },
    enabled: Boolean(eventId) && canView,
    staleTime: STALE.events,
  });

  async function runBulk(action: "close" | "reopen" | "remove" | "dates") {
    if (!selectedIds.length) return;
    const byEvent = new Map<string, string[]>();
    for (const row of rows) {
      if (!selected.has(row.id)) continue;
      const list = byEvent.get(row.eventId) ?? [];
      list.push(row.id);
      byEvent.set(row.eventId, list);
    }
    if (action === "dates" && (!bulkFrom || !bulkTo)) {
      toast.error(t("peopleEvent.bulk.needDates"));
      return;
    }
    if (action === "reopen") {
      const ok = window.confirm(t("peopleEvent.bulk.reopenConfirm", { n: selectedIds.length }));
      if (!ok) return;
    }
    setBusy(true);
    try {
      let total = 0;
      for (const [evId, ids] of byEvent) {
        if (action === "close") {
          const res = await bulkCloseEventStaffAssignments({ eventId: evId, ids });
          total += res.closed;
        } else if (action === "reopen") {
          const res = await bulkReopenEventStaffAssignments({ eventId: evId, ids });
          total += res.reopened;
        } else if (action === "remove") {
          const res = await bulkDeleteEventStaffAssignments({ eventId: evId, ids });
          total += res.removed;
        } else {
          const res = await bulkUpdateEventStaffAssignmentDates({
            eventId: evId,
            ids,
            date_from: bulkFrom,
            date_to: bulkTo,
          });
          total += res.updated;
        }
      }
      await refresh();
      toast.success(
        action === "close"
          ? t("peopleEvent.bulk.closed", { n: total })
          : action === "reopen"
            ? t("peopleEvent.bulk.reopened", { n: total })
            : action === "remove"
              ? t("peopleEvent.bulk.removed", { n: total })
              : t("peopleEvent.bulk.datesUpdated", { n: total }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const csv = toCsv(
      [
        "event",
        "event_number",
        "employee_code",
        "staff_name",
        "assignment_type",
        "role_label",
        "date_from",
        "date_to",
        "pay_on_event_run",
        "status",
        "site",
      ],
      rows.map((r) => [
        r.eventName ?? "",
        r.eventNumber ?? "",
        r.employeeCode ?? "",
        r.staffName ?? "",
        r.assignmentType,
        r.roleLabel,
        r.dateFrom,
        r.dateTo,
        r.payOnEventRun ? "true" : "false",
        r.status,
        r.locationName ?? "",
      ]),
    );
    downloadCsvContent(csv, "event-crew.csv");
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

  return (
    <HrShell>
      <div className="ea-event-crew space-y-5">
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
                <Users className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  <Link
                    href="/people/events"
                    className="hover:text-[#7c3aed] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
                  >
                    {t("peopleEvent.hub.breadcrumb")}
                  </Link>
                </p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                  {t("peopleEvent.crew.title")}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {t("peopleEvent.crew.subtitle")}
                </p>
              </div>
            </div>

            <div className="relative flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9] focus-visible:ring-[#7c3aed]/40"
                    >
                      <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden />
                      {t("peopleEvent.create.assignmentMenu")}
                      <ChevronDown className="ms-1.5 h-3.5 w-3.5 opacity-80" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[14rem]">
                    <DropdownMenuItem onClick={() => setIndividualOpen(true)}>
                      <Plus className="me-2 h-3.5 w-3.5" />
                      {t("peopleEvent.create.individual")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkCreateOpen(true)}>
                      <Upload className="me-2 h-3.5 w-3.5" />
                      {t("peopleEvent.create.bulk")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={!rows.length}
                onClick={exportCsv}
                className="h-10 rounded-xl border-border/80 bg-white"
              >
                <Download className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("peopleEvent.bulk.exportCsv")}
              </Button>
            </div>
          </div>
        </header>

        <PeopleEventWorkforceTabs active="crew" variant="pills" />

        <EventCrewKpiStrip
          kpis={kpis}
          isLoading={crewKpiQ.isLoading || (canAttendance && attendanceTodayQ.isLoading)}
          hasAttendance={canAttendance}
        />

        <section className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  {t("peopleEvent.filters.site")}
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
                  {t("peopleEvent.filters.type")}
                </label>
                <div className="relative">
                  <Layers
                    className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Select value={assignmentType} onValueChange={setAssignmentType}>
                    <SelectTrigger className="h-10 rounded-xl ps-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("peopleEvent.crew.allTypes")}</SelectItem>
                      {EVENT_STAFF_ASSIGNMENT_TYPES.map((x) => (
                        <SelectItem key={x} value={x}>
                          {assignmentTypeLabel(x)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

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
                    value={status}
                    onValueChange={(v) => setStatus(v as "all" | "active" | "closed")}
                  >
                    <SelectTrigger className="h-10 rounded-xl ps-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("common.all")}</SelectItem>
                      <SelectItem value="active">{t("peopleEvent.status.active")}</SelectItem>
                      <SelectItem value="closed">{t("peopleEvent.status.closed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex w-full min-w-0 items-end gap-2 xl:w-auto xl:max-w-md">
              <div className="relative min-w-0 flex-1">
                <label className="sr-only" htmlFor="crew-search">
                  {t("peopleEvent.filters.search")}
                </label>
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="crew-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("peopleEvent.crew.searchPlaceholder")}
                  className="h-10 rounded-xl ps-9"
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-10 w-10 shrink-0 rounded-xl"
                aria-label={t("peopleEvent.crew.filtersAria")}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {eventId && (shortageQ.data?.length ?? 0) > 0 ? (
          <section className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
            <p className="text-sm font-medium text-amber-950">{t("peopleEvent.shortage.title")}</p>
            <p className="mt-1 text-xs text-amber-900/80">{t("peopleEvent.shortage.hint")}</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-950">
              {(shortageQ.data ?? []).slice(0, 8).map((a) => (
                <li key={a.workDate}>
                  {t("peopleEvent.shortage.day", {
                    date: a.workDate,
                    scheduled: a.scheduledCount,
                    crew: a.coveringCrewCount,
                    deficit: a.deficit,
                  })}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {canEdit && selectedIds.length > 0 ? (
          <section className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:flex-row sm:flex-wrap sm:items-end">
            <p className="text-sm text-muted-foreground">
              {t("peopleEvent.bulk.selected", { n: selectedIds.length })}
            </p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void runBulk("close")}>
              {t("peopleEvent.bulk.close")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void runBulk("reopen")}
            >
              {t("peopleEvent.bulk.reopen")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void runBulk("remove")}
            >
              {t("peopleEvent.bulk.remove")}
            </Button>
            <Input
              type="date"
              className="w-auto rounded-xl"
              value={bulkFrom}
              onChange={(e) => setBulkFrom(e.target.value)}
            />
            <Input
              type="date"
              className="w-auto rounded-xl"
              value={bulkTo}
              onChange={(e) => setBulkTo(e.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || !bulkFrom || !bulkTo}
              onClick={() => void runBulk("dates")}
              className="rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
            >
              {t("peopleEvent.bulk.updateDates")}
            </Button>
          </section>
        ) : null}

        {!canEdit ? (
          <p className="px-1 text-xs text-muted-foreground">{t("peopleEvent.crew.viewOnlyHint")}</p>
        ) : null}

        <EventCrewAssignmentsPanel
          rows={rows}
          isLoading={crewQ.isLoading}
          canEdit={canEdit}
          selected={selected}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFrom={setDateFrom}
          onDateTo={setDateTo}
        />
      </div>

      {canEdit ? (
        <>
          <EventStaffIndividualCreateDialog
            open={individualOpen}
            onOpenChange={setIndividualOpen}
            events={createEvents}
            initialEventId={eventId || undefined}
            canHire={canHire}
            onCreated={() => void refresh()}
          />
          <EventStaffBulkCreateDialog
            open={bulkCreateOpen}
            onOpenChange={setBulkCreateOpen}
            events={createEvents}
            initialEventId={eventId || undefined}
            onImported={() => void refresh()}
          />
        </>
      ) : null}
    </HrShell>
  );
}
