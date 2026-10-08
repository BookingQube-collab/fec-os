"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock,
  ListChecks,
  Mail,
  Network,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecLoader } from "@/components/fec";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { usePermission } from "@/hooks/use-permission";
import { useSites } from "@/hooks/queries/useSites";
import { listAttendanceCorrections } from "@/lib/attendance-hr.functions";
import { listUploadedRosterAssignments } from "@/lib/attendance-hr/roster-register.functions";
import { listLeaveRequests } from "@/lib/hr-leave.functions";
import { listHelpdeskQuestions } from "@/lib/hr-workspace.functions";
import { formatLocationRecord } from "@/lib/locations/normalize";
import { listShifts, listStaff } from "@/lib/people.functions";
import { getTeamReporting } from "@/lib/admin-hierarchy.functions";
import { isOperationsFunction, operationalTeamIds, reportingTeamIds } from "@/lib/reporting-chain";
import { listEvaluations } from "@/lib/performance.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { isActiveStaffStatus, isServingNoticeStaffStatus } from "@/lib/staff-status";
import { listTaskInstances } from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 9;
const LATE_MS = 15 * 60 * 1000;
const CLOSED_TASKS = new Set(["completed", "verified", "cancelled", "canceled", "closed", "done"]);
const CLOSED_REVIEWS = new Set(["finalized", "cancelled", "canceled"]);

type ViewId = "reporting" | "operational";
type RecordFilter = "all" | "needed" | "late" | "pending";
type OpsTab = "staffing" | "approvals" | "tasks" | "performance";

type StaffRow = {
  id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  status: string | null;
  location_id: string | null;
  employee_code: string | null;
};

type ShiftRow = {
  id: string;
  location_id: string;
  staff_id: string | null;
  role_label: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  clock_in_at: string | null;
  swap_requested_at: string | null;
};

function qatarToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function addDays(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function qatarDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function inRange(day: string, from: string, to: string) {
  return day >= from && day <= to;
}

function cancelled(status: string) {
  const value = status.toLowerCase();
  return value === "cancelled" || value === "canceled";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first}${second ?? ""}`.toUpperCase();
}

function avatarTone(name: string) {
  const tones = [
    "bg-accent text-electric",
    "bg-success/10 text-success",
    "bg-info/10 text-info",
    "bg-warning/15 text-warning",
  ];
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % tones.length;
  return tones[hash] ?? tones[0];
}

const fieldClass =
  "fec-star-border h-11 min-w-0 rounded-lg border border-input bg-card px-3.5 text-sm font-normal text-foreground shadow-elevated-xs focus:outline-none";

export default function HrTeamOverviewPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canRoster = usePermission("people.view_roster");
  const { hasDirectReports, isPending: reportsPending } = useHasDirectReports();
  const canLeave = usePermission("hr.leave.manage") || usePermission("hr.leave.approve_manager") || hasDirectReports;
  const canTime = usePermission("attendance.view") || usePermission("attendance.approve") || hasDirectReports;
  const canTasks = usePermission("tasks.view");
  const canPerformance = usePermission("performance.view");
  const canHelpdesk = usePermission("hr.manage");

  const today = qatarToday();
  const [view, setView] = useState<ViewId>("reporting");
  const [dateFrom, setDateFrom] = useState(() => addDays(qatarToday(), -6));
  const [dateTo, setDateTo] = useState(() => qatarToday());
  const [teamId, setTeamId] = useState("all");
  const [typeId, setTypeId] = useState("all");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("all");
  const [page, setPage] = useState(0);
  const [opsTeamId, setOpsTeamId] = useState("");
  const [opsTab, setOpsTab] = useState<OpsTab>("staffing");
  const [coverageOpen, setCoverageOpen] = useState(false);

  const rangeOk = dateFrom <= dateTo;
  const horizonFrom = today;
  const horizonTo = addDays(today, 14);

  const staff = useQuery({
    queryKey: queryKeys.people.staff(null),
    queryFn: () => listStaff({}),
    staleTime: STALE.people,
  });
  const reporting = useQuery({
    queryKey: queryKeys.people.teamReporting(),
    queryFn: () => getTeamReporting(),
    staleTime: STALE.people,
  });
  const shifts = useQuery({
    queryKey: queryKeys.people.shifts(null),
    queryFn: () => listShifts({}),
    staleTime: STALE.people,
  });
  const sites = useSites();
  const leave = useQuery({
    queryKey: [...queryKeys.people.hrLeaveQueue(), "team-overview"],
    queryFn: () => listLeaveRequests({}),
    enabled: canLeave,
    staleTime: STALE.people,
  });

  const rosterFilters =
    view === "operational"
      ? { locationId: opsTeamId || null, dateFrom: horizonFrom, dateTo: horizonTo, sourceUploadOnly: false as const }
      : {
          locationId: teamId === "all" ? null : teamId,
          dateFrom,
          dateTo,
          sourceUploadOnly: false as const,
        };
  const roster = useQuery({
    queryKey: queryKeys.people.rosterRegister({ scope: "team-overview", view, ...rosterFilters }),
    queryFn: () => listUploadedRosterAssignments(rosterFilters),
    enabled: rangeOk && (view === "reporting" || Boolean(opsTeamId)),
    staleTime: STALE.people,
  });
  const corrections = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "team-corrections", queue: "waiting" }),
    queryFn: () => listAttendanceCorrections({ queue: "waiting" }),
    enabled: canTime,
    staleTime: STALE.people,
  });
  const tasks = useQuery({
    queryKey: queryKeys.tasks.instances({ scope: "team-overview", locationId: opsTeamId || null }),
    queryFn: () => listTaskInstances({ locationId: opsTeamId || null }),
    enabled: canTasks && view === "operational" && Boolean(opsTeamId),
    staleTime: STALE.people,
  });
  const evaluations = useQuery({
    queryKey: queryKeys.performance.evaluations({ scope: "team-overview" }),
    queryFn: () => listEvaluations({}),
    enabled: canPerformance && view === "operational",
    staleTime: STALE.people,
  });
  const helpdesk = useQuery({
    queryKey: queryKeys.people.hrHelpdesk(),
    queryFn: () => listHelpdeskQuestions({}),
    enabled: canHelpdesk && !canTasks && view === "operational",
    staleTime: STALE.people,
  });

  const activeSites = useMemo(
    () => (sites.data ?? []).filter((site) => site.status === "active"),
    [sites.data],
  );

  useEffect(() => {
    if (!opsTeamId && activeSites[0]) setOpsTeamId(activeSites[0].id);
  }, [activeSites, opsTeamId]);

  useEffect(() => {
    setPage(0);
  }, [dateFrom, dateTo, teamId, typeId, recordFilter]);

  const siteLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites.data ?? []) map.set(site.id, formatLocationRecord(site));
    return map;
  }, [sites.data]);

  const reportingIds = useMemo(
    () => reportingTeamIds(reporting.data?.viewerStaffId ?? null, reporting.data?.people ?? []),
    [reporting.data],
  );
  const opsMemberIds = useMemo(
    () => (opsTeamId ? operationalTeamIds(opsTeamId, reporting.data?.people ?? []) : new Set<string>()),
    [opsTeamId, reporting.data],
  );

  const people = useMemo(() => {
    return ((staff.data ?? []) as StaffRow[]).filter(
      (row) => isActiveStaffStatus(row.status) || isServingNoticeStaffStatus(row.status),
    );
  }, [staff.data]);

  const staffById = useMemo(() => new Map(people.map((row) => [row.id, row])), [people]);

  const departments = useMemo(() => {
    const names = new Set<string>();
    let blank = false;
    for (const row of people) {
      if (!reportingIds.has(row.id)) continue;
      const name = row.department?.trim();
      if (name) names.add(name);
      else blank = true;
    }
    return { names: [...names].sort((a, b) => a.localeCompare(b)), blank };
  }, [people, reportingIds]);

  const shiftRows = (shifts.data ?? []) as unknown as ShiftRow[];
  const rosterRows = roster.data?.rows ?? [];

  function personName(row: StaffRow) {
    if (
      row.id === reporting.data?.viewerStaffId &&
      reporting.data.viewerOperationsName &&
      isOperationsFunction(row.department, row.job_title)
    ) {
      return reporting.data.viewerOperationsName;
    }
    return row.full_name;
  }

  const cards = useMemo(() => {
    if (!rangeOk) return [];
    const pendingLeaveByStaff = new Map<string, number>();
    if (canLeave) {
      for (const row of leave.data ?? []) {
        if (row.status !== "pending") continue;
        if (row.dateTo < dateFrom || row.dateFrom > dateTo) continue;
        pendingLeaveByStaff.set(row.staffId, (pendingLeaveByStaff.get(row.staffId) ?? 0) + 1);
      }
    }
    const pendingTimeByStaff = new Map<string, number>();
    if (canTime) {
      for (const row of corrections.data ?? []) {
        if (!row.staffId) continue;
        if (row.status !== "pending" && row.status !== "waiting") continue;
        if (row.workDate && !inRange(row.workDate.slice(0, 10), dateFrom, dateTo)) continue;
        pendingTimeByStaff.set(row.staffId, (pendingTimeByStaff.get(row.staffId) ?? 0) + 1);
      }
    }

    return people
      .filter((row) => reportingIds.has(row.id))
      .filter((row) => (teamId === "all" ? true : row.location_id === teamId))
      .filter((row) => {
        if (typeId === "all") return true;
        if (typeId === "__none") return !row.department?.trim();
        return row.department?.trim() === typeId;
      })
      .map((row) => {
        const neededDays = new Set<string>();
        let late = 0;
        let pendingShifts = 0;
        for (const shift of shiftRows) {
          if (shift.staff_id !== row.id || cancelled(shift.status)) continue;
          const day = qatarDay(shift.starts_at);
          if (!inRange(day, dateFrom, dateTo)) continue;
          neededDays.add(day);
          if (shift.clock_in_at && new Date(shift.clock_in_at).getTime() - new Date(shift.starts_at).getTime() > LATE_MS) {
            late += 1;
          }
          const status = shift.status.toLowerCase();
          if (status === "pending" || status.includes("swap") || shift.swap_requested_at) pendingShifts += 1;
        }
        for (const assignment of rosterRows) {
          if (assignment.staffId !== row.id || assignment.isWeekOff || assignment.leaveType) continue;
          if (!inRange(assignment.workDate, dateFrom, dateTo)) continue;
          neededDays.add(assignment.workDate);
        }
        const pending = pendingShifts + (pendingLeaveByStaff.get(row.id) ?? 0) + (pendingTimeByStaff.get(row.id) ?? 0);
        const needed = neededDays.size;
        const noteKey =
          pending > 0 ? "pending" : late > 0 ? "late" : needed > 0 ? "needed" : "clear";
        return { row, needed, late, pending, noteKey };
      })
      .filter((card) => (recordFilter === "all" ? true : card[recordFilter] > 0))
      .sort((a, b) => personName(a.row).localeCompare(personName(b.row)));
  }, [
    canLeave,
    canTime,
    corrections.data,
    dateFrom,
    dateTo,
    leave.data,
    people,
    rangeOk,
    recordFilter,
    reporting.data,
    reportingIds,
    rosterRows,
    shiftRows,
    teamId,
    typeId,
  ]);

  const pageCount = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleCards = cards.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const ops = useMemo(() => {
    const locationId = opsTeamId;
    const now = Date.now();
    const working = rosterRows.filter(
      (row) =>
        opsMemberIds.has(row.staffId) &&
        row.locationId === locationId &&
        inRange(row.workDate, horizonFrom, horizonTo) &&
        !row.isWeekOff &&
        !row.leaveType,
    );
    const covered = new Set(working.map((row) => `${row.staffId}|${row.workDate}`));
    let extraAssigned = 0;
    let unfilled = 0;
    const liveKeys = new Set<string>();
    for (const shift of shiftRows) {
      if (shift.location_id !== locationId || cancelled(shift.status)) continue;
      const day = qatarDay(shift.starts_at);
      const live = new Date(shift.starts_at).getTime() <= now && new Date(shift.ends_at).getTime() >= now;
      const inHorizon = inRange(day, horizonFrom, horizonTo);
      if (!live && !inHorizon) continue;
      if (!shift.staff_id) {
        if (inHorizon || live) unfilled += 1;
        continue;
      }
      if (!opsMemberIds.has(shift.staff_id)) continue;
      const key = `${shift.staff_id}|${day}`;
      if (covered.has(key) || liveKeys.has(key)) continue;
      liveKeys.add(key);
      if (inHorizon || live) extraAssigned += 1;
    }
    const accepted = working.length + extraAssigned;
    const required = accepted + unfilled;
    const upcoming = accepted;

    const teamStaff = opsMemberIds;

    const timeRows = canTime
      ? (corrections.data ?? []).filter(
          (row) =>
            row.locationId === locationId &&
            (row.status === "pending" || row.status === "waiting") &&
            (!row.staffId || teamStaff.has(row.staffId)),
        )
      : [];
    const leaveRows = canLeave
      ? (leave.data ?? []).filter((row) => row.status === "pending" && teamStaff.has(row.staffId))
      : [];
    const conflictRows = canLeave
      ? (leave.data ?? []).filter((row) => {
          if (row.status !== "approved" || !teamStaff.has(row.staffId)) return false;
          const onRoster = working.some(
            (slot) => slot.staffId === row.staffId && inRange(slot.workDate, row.dateFrom, row.dateTo),
          );
          const onShift = shiftRows.some((shift) => {
            if (shift.staff_id !== row.staffId || shift.location_id !== locationId || cancelled(shift.status)) {
              return false;
            }
            const day = qatarDay(shift.starts_at);
            return inRange(day, horizonFrom, horizonTo) && inRange(day, row.dateFrom, row.dateTo);
          });
          return onRoster || onShift;
        })
      : [];
    const taskRows = canTasks
      ? (tasks.data ?? []).filter(
          (row) => row.location_id === locationId && !CLOSED_TASKS.has(String(row.status).toLowerCase()),
        )
      : [];
    const helpdeskRows =
      canHelpdesk && !canTasks
        ? (helpdesk.data ?? []).filter(
            (row) => row.status !== "resolved" && teamStaff.has(row.staffId),
          )
        : [];
    const reviewRows = canPerformance
      ? (evaluations.data ?? []).filter((row) => {
          if (CLOSED_REVIEWS.has(String(row.status)) || !teamStaff.has(row.staff_id)) return false;
          if (row.location_id === locationId) return true;
          const person = staffById.get(row.staff_id);
          return person?.location_id === locationId;
        })
      : [];

    return {
      accepted,
      required,
      upcoming,
      unfilled,
      timeRows,
      leaveRows,
      conflictRows,
      taskRows,
      helpdeskRows,
      reviewRows,
    };
  }, [
    canHelpdesk,
    canLeave,
    canPerformance,
    canTasks,
    canTime,
    corrections.data,
    evaluations.data,
    helpdesk.data,
    horizonFrom,
    horizonTo,
    leave.data,
    opsMemberIds,
    opsTeamId,
    rosterRows,
    shiftRows,
    staffById,
    tasks.data,
  ]);

  const refreshing =
    staff.isFetching ||
    reporting.isFetching ||
    shifts.isFetching ||
    sites.isFetching ||
    roster.isFetching ||
    leave.isFetching ||
    corrections.isFetching ||
    tasks.isFetching ||
    evaluations.isFetching ||
    helpdesk.isFetching;

  function refresh() {
    void staff.refetch();
    void reporting.refetch();
    void shifts.refetch();
    void sites.refetch();
    void roster.refetch();
    if (canLeave) void leave.refetch();
    if (canTime) void corrections.refetch();
    if (canTasks && view === "operational") void tasks.refetch();
    if (canPerformance && view === "operational") void evaluations.refetch();
    if (canHelpdesk && !canTasks && view === "operational") void helpdesk.refetch();
    void qc.invalidateQueries({ queryKey: queryKeys.sites.list() });
  }

  const opsTabs: { id: OpsTab; icon: typeof Users }[] = [
    { id: "staffing", icon: Users },
    { id: "approvals", icon: ClipboardList },
    { id: "tasks", icon: ListChecks },
    { id: "performance", icon: BarChart3 },
  ];

  if (!canRoster && reportsPending) {
    return (
      <HrShell>
        <FecLoader />
      </HrShell>
    );
  }

  return (
    <CapabilityGate capability="people.view_roster" alsoAllow={hasDirectReports} fallback={<Denied />}>
      <HrShell>
        <nav aria-label={t("hrWorkspace.team.title")} className="mb-4 text-xs text-muted-foreground">
          <Link href="/people/hr" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("nav.peopleSectionWorkTime")}
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{t("hrWorkspace.team.title")}</span>
        </nav>
        <HrSection
          kicker={t("hrWorkspace.team.kicker")}
          title={t("hrWorkspace.team.title")}
          subtitle={t("hrWorkspace.team.subtitle")}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/people/hr/hierarchy">
                  <Network />
                  {t("hrWorkspace.team.orgCharts")}
                </Link>
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
                <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
                {t("hrWorkspace.team.refresh")}
              </Button>
            </div>
          }
        >
          <div className="fec-inner-tabs" role="tablist" aria-label={t("hrWorkspace.team.title")}>
            {(canRoster ? (["reporting", "operational"] as const) : (["reporting"] as const)).map((id) => {
              const Icon = id === "reporting" ? Network : Users;
              return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`team-view-${id}`}
                aria-selected={view === id}
                aria-controls={`team-panel-${id}`}
                className={cn("fec-inner-tab", view === id && "is-active")}
                onClick={() => setView(id)}
              >
                <Icon aria-hidden />
                {t(`hrWorkspace.team.views.${id}`)}
              </button>
              );
            })}
          </div>

          {view === "reporting" ? (
            <section role="tabpanel" id="team-panel-reporting" aria-labelledby="team-view-reporting" className="min-w-0 space-y-4">
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid min-w-0 grid-cols-2 gap-3">
                  <label className="flex min-w-0 flex-col gap-1.5 text-label">
                    {t("hrWorkspace.team.filters.from")}
                    <Input className="min-w-0" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-label">
                    {t("hrWorkspace.team.filters.to")}
                    <Input className="min-w-0" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                  </label>
                </div>
                <FilterSelect
                  label={t("hrWorkspace.team.filters.team")}
                  value={teamId}
                  onChange={setTeamId}
                >
                  <option value="all">{t("hrWorkspace.team.filters.allTeams")}</option>
                  {activeSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {formatLocationRecord(site)}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect label={t("hrWorkspace.team.filters.type")} value={typeId} onChange={setTypeId}>
                  <option value="all">{t("hrWorkspace.team.filters.allTypes")}</option>
                  {departments.blank ? (
                    <option value="__none">{t("hrWorkspace.team.filters.noDepartment")}</option>
                  ) : null}
                  {departments.names.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  label={t("hrWorkspace.team.filters.record")}
                  value={recordFilter}
                  onChange={(value) => setRecordFilter(value as RecordFilter)}
                >
                  {(["all", "needed", "late", "pending"] as const).map((id) => (
                    <option key={id} value={id}>
                      {t(`hrWorkspace.team.filters.records.${id}`)}
                    </option>
                  ))}
                </FilterSelect>
              </div>

              {!rangeOk ? <p className="text-sm text-muted-foreground">{t("hrWorkspace.team.invalidRange")}</p> : null}

              {staff.isLoading || shifts.isLoading || reporting.isLoading ? (
                <FecLoader density="page" label={t("common.loading")} />
              ) : staff.isError || shifts.isError || reporting.isError ? (
                <HrEmptyState message={t("hrWorkspace.loadFailed")} />
              ) : cards.length === 0 ? (
                <HrEmptyState message={t("hrWorkspace.team.emptyPeople")} icon={Users} />
              ) : (
                <ul className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleCards.map((card) => {
                    const personHref = `/people/staff/${card.row.id}`;
                    const reviewHref = `/people/staff/${card.row.id}?tab=attendance`;
                    const place = card.row.location_id ? siteLabel.get(card.row.location_id) : null;
                    const name = personName(card.row);
                    const role = [card.row.job_title || card.row.department, place].filter(Boolean).join(" · ");
                    return (
                      <li key={card.row.id} className="min-w-0">
                        <article className="relative flex h-full flex-col rounded-2xl border border-border bg-card p-4 shadow-elevated-xs hover:border-electric/30">
                          <Link
                            href={personHref}
                            className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={name}
                          />
                          <div className="pointer-events-none relative z-10 flex min-w-0 items-start gap-3">
                            <span
                              className={cn(
                                "grid size-11 shrink-0 place-items-center rounded-full text-xs font-semibold",
                                avatarTone(name),
                              )}
                              aria-hidden="true"
                            >
                              {initials(name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{name}</p>
                              <p className="truncate text-xs text-muted-foreground">{role || card.row.employee_code}</p>
                            </div>
                          </div>
                          <dl className="pointer-events-none relative z-10 mt-4 grid grid-cols-3 gap-2">
                            {(
                              [
                                ["needed", card.needed],
                                ["late", card.late],
                                ["pending", card.pending],
                              ] as const
                            ).map(([key, value]) => (
                              <div key={key} className="rounded-xl bg-accent px-2 py-2 text-center">
                                <dt className="text-[11px] text-muted-foreground">{t(`hrWorkspace.team.metrics.${key}`)}</dt>
                                <dd className="text-sm font-semibold">{value}</dd>
                              </div>
                            ))}
                          </dl>
                          <Link
                            href={reviewHref}
                            className="relative z-10 mt-3 w-fit text-sm font-semibold text-electric underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t("hrWorkspace.team.reviewAttendance")}
                          </Link>
                          <p className="pointer-events-none relative z-10 mt-3 text-xs leading-5 text-muted-foreground">
                            {t(`hrWorkspace.team.notes.${card.noteKey}`)}
                          </p>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!staff.isLoading && !shifts.isLoading && !reporting.isLoading && !staff.isError && !shifts.isError && !reporting.isError ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
                <p className="text-muted-foreground">{t("hrWorkspace.team.members", { count: cards.length })}</p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                    {t("hrWorkspace.team.previous")}
                  </Button>
                  <span className="min-w-8 text-center font-semibold" aria-label={t("hrWorkspace.team.page", { page: safePage + 1 })}>
                    {safePage + 1}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(safePage + 1)}
                  >
                    {t("hrWorkspace.team.next")}
                  </Button>
                </div>
              </div>
              ) : null}
            </section>
          ) : (
            <section role="tabpanel" id="team-panel-operational" aria-labelledby="team-view-operational" className="min-w-0 space-y-4">
              <FilterSelect fit label={t("hrWorkspace.team.teamLabel")} value={opsTeamId} onChange={setOpsTeamId}>
                {activeSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {formatLocationRecord(site)}
                  </option>
                ))}
              </FilterSelect>

              {sites.isLoading || reporting.isLoading ? (
                <FecLoader density="page" label={t("common.loading")} />
              ) : activeSites.length === 0 ? (
                <HrEmptyState message={t("hrWorkspace.team.noSites")} icon={Users} />
              ) : (
                <>
                  <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                      href="/people/roster"
                      icon={<CalendarDays />}
                      label={t("hrWorkspace.team.kpi.upcoming")}
                      value={roster.isLoading ? "…" : String(ops.upcoming)}
                      hint={t("hrWorkspace.team.kpi.upcomingHint")}
                    />
                    <KpiCard
                      href="/people/roster"
                      icon={<UserRound />}
                      label={t("hrWorkspace.team.kpi.unfilled")}
                      value={roster.isLoading ? "…" : String(ops.unfilled)}
                      hint={
                        roster.isLoading
                          ? t("hrWorkspace.team.kpi.upcomingHint")
                          : ops.unfilled === 0
                            ? t("hrWorkspace.team.kpi.unfilledClear")
                            : t("hrWorkspace.team.kpi.unfilledOpen", { count: ops.unfilled })
                      }
                    />
                    <KpiCard
                      href="/people/attendance/corrections"
                      icon={<Clock />}
                      label={t("hrWorkspace.team.kpi.time")}
                      value={canTime ? (corrections.isLoading ? "…" : String(ops.timeRows.length)) : "0"}
                      hint={t("hrWorkspace.team.kpi.timeHint")}
                    />
                    <KpiCard
                      href="/people/leave"
                      icon={<ClipboardList />}
                      label={t("hrWorkspace.team.kpi.leave")}
                      value={canLeave ? (leave.isLoading ? "…" : String(ops.leaveRows.length)) : "0"}
                      hint={t("hrWorkspace.team.kpi.leaveHint")}
                    />
                  </div>

                  <div className="fec-inner-tabs" role="tablist" aria-label={t("hrWorkspace.team.tabs.staffing")}>
                    {opsTabs.map((tab) => {
                      const Icon = tab.icon;
                      const selected = opsTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          id={`ops-tab-${tab.id}`}
                          aria-selected={selected}
                          aria-controls={`ops-panel-${tab.id}`}
                          className={cn("fec-inner-tab", selected && "is-active")}
                          onClick={() => setOpsTab(tab.id)}
                        >
                          <Icon className="size-4" />
                          {t(`hrWorkspace.team.tabs.${tab.id}`)}
                        </button>
                      );
                    })}
                  </div>

                  {opsTab === "staffing" ? (
                    <div role="tabpanel" id="ops-panel-staffing" aria-labelledby="ops-tab-staffing" className="space-y-4">
                      <section className="rounded-2xl border border-border bg-card p-5 shadow-elevated-xs">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h2 className="text-base font-semibold">{t("hrWorkspace.team.staffingTitle")}</h2>
                          <Link
                            href="/people/roster"
                            className="text-sm font-semibold text-electric underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t("hrWorkspace.team.manageRoster")} →
                          </Link>
                        </div>
                        {roster.isError ? (
                          <p className="mt-4 text-sm text-muted-foreground">{t("hrWorkspace.team.rosterError")}</p>
                        ) : roster.isLoading ? (
                          <FecLoader label={t("common.loading")} />
                        ) : (
                          <>
                            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
                              <p className="font-medium">{t("hrWorkspace.team.coverageLabel")}</p>
                              <p className="text-muted-foreground">
                                {t("hrWorkspace.team.coverageCount", { accepted: ops.accepted, required: ops.required })}
                              </p>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <div
                                className="h-full rounded-full bg-electric"
                                style={{
                                  width: ops.required === 0 ? "0%" : `${Math.round((ops.accepted / ops.required) * 100)}%`,
                                }}
                              />
                            </div>
                            {ops.required === 0 ? (
                              <p className="mt-4 text-sm text-muted-foreground">{t("hrWorkspace.team.noRequirement")}</p>
                            ) : null}
                            <button
                              type="button"
                              className="mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-expanded={coverageOpen}
                              onClick={() => setCoverageOpen((open) => !open)}
                            >
                              {t("hrWorkspace.team.howCoverage")}
                              <ChevronDown className={cn("size-4", coverageOpen && "rotate-180")} />
                            </button>
                            {coverageOpen ? (
                              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                                {t("hrWorkspace.team.howCoverageBody")}
                              </p>
                            ) : null}
                          </>
                        )}
                      </section>

                      <section className="rounded-2xl border border-border bg-card p-5 shadow-elevated-xs">
                        <h2 className="text-base font-semibold">{t("hrWorkspace.team.absenceTitle")}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("hrWorkspace.team.absenceBody")}</p>
                        {!canLeave ? (
                          <QuietEmpty title={t("hrWorkspace.team.absenceScope")} body="" />
                        ) : leave.isLoading ? (
                          <FecLoader label={t("common.loading")} />
                        ) : ops.conflictRows.length === 0 ? (
                          <QuietEmpty
                            title={t("hrWorkspace.team.noConflicts")}
                            body={t("hrWorkspace.team.noConflictsBody")}
                          />
                        ) : (
                          <ul className="mt-4 divide-y divide-border">
                            {ops.conflictRows.map((row) => (
                              <li key={row.id}>
                                <Link href={`/people/staff/${row.staffId}?tab=attendance`} className="block rounded-xl px-1 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <span className="block text-sm font-medium">{row.staffName ?? row.employeeCode}</span>
                                  <span className="block text-xs text-muted-foreground">
                                    {row.dateFrom} → {row.dateTo} · {t(`hr.leave.types.${row.leaveType}`, { defaultValue: row.leaveType })}
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </div>
                  ) : null}

                  {opsTab === "approvals" ? (
                    <section role="tabpanel" id="ops-panel-approvals" aria-labelledby="ops-tab-approvals" className="rounded-2xl border border-border bg-card p-5 shadow-elevated-xs">
                      <h2 className="text-sm font-semibold">{t("hrWorkspace.team.timeHeading")}</h2>
                      {!canTime ? (
                        <p className="mt-2 text-sm text-muted-foreground">{t("hrWorkspace.team.timeScope")}</p>
                      ) : corrections.isLoading ? (
                        <FecLoader label={t("common.loading")} />
                      ) : ops.timeRows.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">{t("hrWorkspace.team.timeEmpty")}</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-border">
                          {ops.timeRows.map((row) => (
                            <li key={row.id}>
                              <Link href="/people/attendance/corrections" className="block rounded-xl px-1 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <span className="block text-sm font-medium">{row.staffName ?? row.employeeCode ?? row.kind}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {row.workDate?.slice(0, 10) ?? row.status} · {row.reason}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      <h2 className="mt-6 text-sm font-semibold">{t("hrWorkspace.team.leaveHeading")}</h2>
                      {!canLeave ? (
                        <p className="mt-2 text-sm text-muted-foreground">{t("hrWorkspace.team.leaveScope")}</p>
                      ) : leave.isLoading ? (
                        <FecLoader label={t("common.loading")} />
                      ) : ops.leaveRows.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">{t("hrWorkspace.team.leaveEmpty")}</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-border">
                          {ops.leaveRows.map((row) => (
                            <li key={row.id}>
                              <Link href="/people/leave" className="block rounded-xl px-1 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <span className="block text-sm font-medium">{row.staffName ?? row.employeeCode}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {row.dateFrom} → {row.dateTo} · {t(`hr.leave.types.${row.leaveType}`, { defaultValue: row.leaveType })}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ) : null}

                  {opsTab === "tasks" ? (
                    <section role="tabpanel" id="ops-panel-tasks" aria-labelledby="ops-tab-tasks" className="rounded-2xl border border-border bg-card p-5 shadow-elevated-xs">
                      {canTasks ? (
                        tasks.isLoading ? (
                          <FecLoader label={t("common.loading")} />
                        ) : tasks.isError ? (
                          <p className="text-sm text-muted-foreground">{t("hrWorkspace.loadFailed")}</p>
                        ) : ops.taskRows.length === 0 ? (
                          <QuietEmpty title={t("hrWorkspace.team.tasksEmpty")} body="" />
                        ) : (
                          <ul className="divide-y divide-border">
                            {ops.taskRows.map((row) => (
                              <li key={row.id}>
                                <Link href={`/tasks/${row.id}`} className="block rounded-xl px-1 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <span className="block text-sm font-medium">{row.title}</span>
                                  <span className="block text-xs text-muted-foreground">{row.status}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : canHelpdesk ? (
                        helpdesk.isLoading ? (
                          <FecLoader label={t("common.loading")} />
                        ) : ops.helpdeskRows.length === 0 ? (
                          <QuietEmpty title={t("hrWorkspace.team.tasksEmpty")} body="" />
                        ) : (
                          <ul className="divide-y divide-border">
                            {ops.helpdeskRows.map((row) => (
                              <li key={row.id}>
                                <Link href={`/people/hr/helpdesk/${row.id}`} className="block rounded-xl px-1 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <span className="block text-sm font-medium">{row.title || row.staffName}</span>
                                  <span className="block text-xs text-muted-foreground">{row.status}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : (
                        <QuietEmpty title={t("hrWorkspace.team.tasksScope")} body="" />
                      )}
                    </section>
                  ) : null}

                  {opsTab === "performance" ? (
                    <section role="tabpanel" id="ops-panel-performance" aria-labelledby="ops-tab-performance" className="rounded-2xl border border-border bg-card p-5 shadow-elevated-xs">
                      {!canPerformance ? (
                        <QuietEmpty title={t("hrWorkspace.team.performanceScope")} body="" />
                      ) : evaluations.isLoading ? (
                        <FecLoader label={t("common.loading")} />
                      ) : evaluations.isError ? (
                        <p className="text-sm text-muted-foreground">{t("hrWorkspace.loadFailed")}</p>
                      ) : ops.reviewRows.length === 0 ? (
                        <QuietEmpty title={t("hrWorkspace.team.performanceEmpty")} body="" />
                      ) : (
                        <ul className="divide-y divide-border">
                          {ops.reviewRows.map((row) => (
                            <li key={row.id}>
                              <Link href={`/people/performance/evaluations/${row.id}`} className="block rounded-xl px-1 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <span className="block text-sm font-medium">{row.staffName}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {row.cycleName} · {row.status}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ) : null}
                </>
              )}
            </section>
          )}
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  fit = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  /** Size to the option text instead of stretching across the page. */
  fit?: boolean;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5 text-label", fit ? "w-fit max-w-full" : "w-full")}>
      {label}
      <select
        className={cn(fieldClass, fit ? "w-auto max-w-full" : "w-full")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function KpiCard({
  href,
  icon,
  label,
  value,
  hint,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hr-ring)] focus-visible:ring-offset-2"
    >
      <span className="hr-kpi h-full">
        <span className="min-w-0">
          <span className="hr-kpi__label">{label}</span>
          <span className="hr-kpi__value block">{value}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{hint}</span>
        </span>
        <span className="hr-kpi__icon" aria-hidden="true">
          {icon}
        </span>
      </span>
    </Link>
  );
}

function QuietEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-muted-foreground" aria-hidden="true">
        <Mail className="size-5" />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{body}</p> : null}
    </div>
  );
}

function Denied() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <HrEmptyState message={t("hr.dashboard.noAccess")} />
    </HrShell>
  );
}
