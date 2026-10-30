"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarDays, Clock3, Users } from "lucide-react";
import { toast } from "sonner";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  approveEventTimesheetEntry,
  deleteEventResourceAllocation,
  deleteEventTimesheetEntry,
  getEventResources,
  rejectEventTimesheetEntry,
  submitEventTimesheetEntry,
  upsertEventResourceAllocation,
  upsertEventStaffCapacity,
  upsertEventTimesheetEntry,
} from "@/lib/events.functions";
import { allocationsByDay, weekDates, weekStartMonday, ymdAddDays } from "@/lib/events/resources";
import { eventOpsUrls } from "@/lib/events/ops-link";
import type { EventTaskRow } from "@/lib/events/types";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import { KPI_ICON_CLASS, KPI_TINT_CLASS, type KpiTint } from "@/lib/ui/command-surface";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type StaffOpt = { id: string; full_name: string };

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

function Kpi({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "ok" | "warn";
  icon: typeof Users;
}) {
  const tint: KpiTint = tone === "danger" ? "red" : tone === "warn" ? "amber" : tone === "ok" ? "green" : "sky";
  return (
    <div className={cn("min-w-0 rounded-2xl border px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]", KPI_TINT_CLASS[tint])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-xl font-bold tabular-nums", tone === "danger" && "text-rag-red")}>{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", KPI_ICON_CLASS[tint])}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}

export function EventResourcesPanel({
  eventId,
  locationId,
  tasks,
  staff,
  canEdit,
}: {
  eventId: string;
  locationId?: string | null;
  tasks: EventTaskRow[];
  staff: StaffOpt[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const urls = eventOpsUrls(eventId, locationId);
  const resources = useQuery({
    queryKey: queryKeys.events.resources(eventId),
    queryFn: () => getEventResources({ eventId }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.events.resources(eventId) });
    void qc.invalidateQueries({ queryKey: queryKeys.events.plan(eventId) });
  };

  const data = resources.data;
  const [month, setMonth] = useState(() => monthKey());
  const [week, setWeek] = useState(() => weekStartMonday(new Date().toISOString().slice(0, 10)));
  const [calMode, setCalMode] = useState<"month" | "week">("month");

  const [allocDraft, setAllocDraft] = useState({
    id: "",
    staff_id: "",
    task_id: "",
    start_date: "",
    end_date: "",
    allocated_hours: "",
    allocation_pct: "",
    notes: "",
  });

  const [capDraft, setCapDraft] = useState({ staff_id: "", weekly_hours: "40" });
  const [tsDraft, setTsDraft] = useState({
    staff_id: "",
    task_id: "",
    work_date: "",
    hours: "",
    note: "",
  });

  const saveAlloc = useMutation({
    mutationFn: () =>
      upsertEventResourceAllocation({
        id: allocDraft.id || undefined,
        eventId,
        staff_id: allocDraft.staff_id,
        task_id: allocDraft.task_id || null,
        start_date: allocDraft.start_date,
        end_date: allocDraft.end_date,
        allocated_hours: allocDraft.allocated_hours.trim() ? Number(allocDraft.allocated_hours) : null,
        allocation_pct: allocDraft.allocation_pct.trim() ? Number(allocDraft.allocation_pct) : null,
        notes: allocDraft.notes || null,
      }),
    onSuccess: () => {
      toast.success(t("events.resources.allocSaved"));
      setAllocDraft({
        id: "",
        staff_id: "",
        task_id: "",
        start_date: "",
        end_date: "",
        allocated_hours: "",
        allocation_pct: "",
        notes: "",
      });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeAlloc = useMutation({
    mutationFn: (id: string) => deleteEventResourceAllocation({ id }),
    onSuccess: () => {
      toast.success(t("events.resources.allocDeleted"));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveCap = useMutation({
    mutationFn: () =>
      upsertEventStaffCapacity({
        eventId,
        staff_id: capDraft.staff_id,
        weekly_hours: Number(capDraft.weekly_hours),
      }),
    onSuccess: () => {
      toast.success(t("events.resources.capSaved"));
      setCapDraft({ staff_id: "", weekly_hours: "40" });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveTs = useMutation({
    mutationFn: () =>
      upsertEventTimesheetEntry({
        eventId,
        staff_id: tsDraft.staff_id,
        task_id: tsDraft.task_id || null,
        work_date: tsDraft.work_date,
        hours: Number(tsDraft.hours),
        note: tsDraft.note || null,
        status: "draft",
      }),
    onSuccess: () => {
      toast.success(t("events.resources.tsSaved"));
      setTsDraft({ staff_id: "", task_id: "", work_date: "", hours: "", note: "" });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const tsAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "submit" | "approve" | "reject" | "delete" }) => {
      if (action === "submit") return submitEventTimesheetEntry({ id });
      if (action === "approve") return approveEventTimesheetEntry({ id });
      if (action === "reject") return rejectEventTimesheetEntry({ id });
      return deleteEventTimesheetEntry({ id });
    },
    onSuccess: (_r, vars) => {
      const key =
        vars.action === "submit"
          ? "events.resources.tsSubmitted"
          : vars.action === "approve"
            ? "events.resources.tsApproved"
            : vars.action === "reject"
              ? "events.resources.tsRejected"
              : "events.resources.tsDeleted";
      toast.success(t(key));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const chartData = useMemo(
    () =>
      (data?.workload ?? []).map((row) => ({
        name: row.staff_name ?? row.staff_id.slice(0, 6),
        allocated: row.allocatedHours,
        capacity: row.capacityHours,
        utilization: row.utilizationPct,
      })),
    [data?.workload],
  );

  const monthGrid = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < startPad; i += 1) cells.push({ date: null, day: null });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: `${month}-${String(day).padStart(2, "0")}`, day });
    }
    return cells;
  }, [month]);

  const byDay = useMemo(
    () => allocationsByDay(data?.allocations ?? [], month),
    [data?.allocations, month],
  );

  const weekDays = useMemo(() => weekDates(week), [week]);

  if (resources.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (resources.isError) {
    return <p className="text-sm text-rag-red">{(resources.error as Error).message}</p>;
  }

  const kpis = data?.kpis;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={t("events.resources.kpiAllocated")}
          value={`${kpis?.allocatedHours ?? 0}h`}
          hint={t("events.resources.kpiCapacityHint", { n: kpis?.capacityHours ?? 0 })}
          icon={Users}
        />
        <Kpi
          label={t("events.resources.kpiUtilization")}
          value={`${kpis?.utilizationPct ?? 0}%`}
          tone={(kpis?.utilizationPct ?? 0) > 100 ? "danger" : (kpis?.utilizationPct ?? 0) > 85 ? "warn" : "ok"}
          icon={Clock3}
        />
        <Kpi
          label={t("events.resources.kpiConflicts")}
          value={String(kpis?.conflictCount ?? 0)}
          tone={(kpis?.conflictCount ?? 0) > 0 ? "danger" : "ok"}
          icon={AlertTriangle}
        />
        <Kpi
          label={t("events.resources.kpiEstVsActual")}
          value={`${kpis?.actualHours ?? 0} / ${kpis?.estimatedHours ?? 0}h`}
          hint={t("events.resources.kpiPendingTs", { n: kpis?.pendingTimesheets ?? 0 })}
          icon={CalendarDays}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Button asChild size="sm" variant="outline">
          <Link href={urls.people}>{t("events.resources.linkPeople")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={urls.roster}>{t("events.resources.linkRoster")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={urls.attendance}>{t("events.resources.linkAttendance")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={urls.overtime}>{t("events.resources.linkOt")}</Link>
        </Button>
      </div>

      {(data?.conflicts.length ?? 0) > 0 || (data?.overlaps.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-rag-red/30 bg-rag-red/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-rag-red">{t("events.resources.conflictsTitle")}</h3>
          <ul className="space-y-1 text-sm">
            {(data?.conflicts ?? []).map((c) => (
              <li key={`${c.staff_id}-${c.weekStart}`}>
                {c.staff_name ?? c.staff_id}: {c.weekStart}–{c.weekEnd} — {c.allocatedHours}h / {c.capacityHours}h
                <Badge variant="destructive" className="ms-2">
                  +{c.overBy}h
                </Badge>
              </li>
            ))}
            {(data?.overlaps ?? []).map((o) => (
              <li key={`${o.aId}-${o.bId}`} className="text-muted-foreground">
                {t("events.resources.overlapLine", {
                  name: o.staff_name ?? o.staff_id,
                  start: o.start,
                  end: o.end,
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Tabs defaultValue="workload">
        <TabsList>
          <TabsTrigger value="workload">{t("events.resources.tabWorkload")}</TabsTrigger>
          <TabsTrigger value="allocations">{t("events.resources.tabAllocations")}</TabsTrigger>
          <TabsTrigger value="calendar">{t("events.resources.tabCalendar")}</TabsTrigger>
          <TabsTrigger value="timesheets">{t("events.resources.tabTimesheets")}</TabsTrigger>
        </TabsList>

        <TabsContent value="workload" className="space-y-4">
          <ChartCard title={t("events.resources.workloadChart")} subtitle={t("events.resources.workloadHint")}>
            {chartData.length === 0 ? (
              <ChartEmpty label={t("events.resources.workloadEmpty")} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="name" tick={chartTick} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={chartTick} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                  <Bar dataKey="allocated" name={t("events.resources.allocated")} fill={CHART.ink} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="capacity" name={t("events.resources.capacity")} fill={CHART.muted} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="overflow-x-auto rounded-2xl border border-border/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("events.resources.staff")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.allocated")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.capacity")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.utilization")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.estHours")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.actHours")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.workload ?? []).map((row) => (
                  <TableRow key={row.staff_id}>
                    <TableCell>
                      {row.staff_name ?? row.staff_id}
                      {row.overAllocated ? (
                        <Badge variant="destructive" className="ms-2">
                          {t("events.resources.over")}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{row.allocatedHours}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.capacityHours}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.utilizationPct}%</TableCell>
                    <TableCell className="text-end tabular-nums">{row.taskEstimatedHours}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.taskActualHours}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {canEdit ? (
            <div className="rounded-2xl border border-border/40 bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">{t("events.resources.setCapacity")}</h3>
              <div className="grid gap-2 md:grid-cols-3">
                <Select
                  value={capDraft.staff_id || "none"}
                  onValueChange={(v) => setCapDraft((s) => ({ ...s, staff_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("events.overview.selectStaff")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("events.overview.selectStaff")}</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={capDraft.weekly_hours}
                  onChange={(e) => setCapDraft((s) => ({ ...s, weekly_hours: e.target.value }))}
                  placeholder={t("events.resources.weeklyHours")}
                />
                <Button
                  size="sm"
                  disabled={!capDraft.staff_id || saveCap.isPending}
                  onClick={() => saveCap.mutate()}
                >
                  {t("events.resources.saveCapacity")}
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="allocations" className="space-y-4">
          {canEdit ? (
            <div className="grid gap-2 rounded-2xl border border-border/40 bg-card p-4 md:grid-cols-3">
              <Select
                value={allocDraft.staff_id || "none"}
                onValueChange={(v) => setAllocDraft((s) => ({ ...s, staff_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("events.overview.selectStaff")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("events.overview.selectStaff")}</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={allocDraft.task_id || "none"}
                onValueChange={(v) => setAllocDraft((s) => ({ ...s, task_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("events.resources.optionalTask")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("events.resources.optionalTask")}</SelectItem>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={allocDraft.start_date}
                onChange={(e) => setAllocDraft((s) => ({ ...s, start_date: e.target.value }))}
              />
              <Input
                type="date"
                value={allocDraft.end_date}
                onChange={(e) => setAllocDraft((s) => ({ ...s, end_date: e.target.value }))}
              />
              <Input
                type="number"
                min={0}
                value={allocDraft.allocated_hours}
                onChange={(e) => setAllocDraft((s) => ({ ...s, allocated_hours: e.target.value }))}
                placeholder={t("events.resources.hours")}
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={allocDraft.allocation_pct}
                onChange={(e) => setAllocDraft((s) => ({ ...s, allocation_pct: e.target.value }))}
                placeholder={t("events.resources.pct")}
              />
              <Input
                value={allocDraft.notes}
                onChange={(e) => setAllocDraft((s) => ({ ...s, notes: e.target.value }))}
                placeholder={t("events.resources.notes")}
                className="md:col-span-2"
              />
              <Button
                size="sm"
                disabled={!allocDraft.staff_id || !allocDraft.start_date || !allocDraft.end_date || saveAlloc.isPending}
                onClick={() => saveAlloc.mutate()}
              >
                {allocDraft.id ? t("events.resources.updateAlloc") : t("events.resources.addAlloc")}
              </Button>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-border/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("events.resources.staff")}</TableHead>
                  <TableHead>{t("events.resources.task")}</TableHead>
                  <TableHead>{t("events.resources.dates")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.hours")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.pct")}</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.allocations ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} className="text-muted-foreground">
                      {t("events.resources.allocEmpty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.allocations ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.staff_name ?? row.staff_id}</TableCell>
                      <TableCell>{row.task_title ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {row.start_date} → {row.end_date}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{row.allocated_hours ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {row.allocation_pct != null ? `${row.allocation_pct}%` : "—"}
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setAllocDraft({
                                id: row.id,
                                staff_id: row.staff_id,
                                task_id: row.task_id ?? "",
                                start_date: row.start_date,
                                end_date: row.end_date,
                                allocated_hours: row.allocated_hours != null ? String(row.allocated_hours) : "",
                                allocation_pct: row.allocation_pct != null ? String(row.allocation_pct) : "",
                                notes: row.notes ?? "",
                              })
                            }
                          >
                            {t("common.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeAlloc.mutate(row.id)}
                          >
                            {t("common.remove")}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={calMode === "month" ? "secondary" : "outline"} onClick={() => setCalMode("month")}>
              {t("events.calendar.tabMonth")}
            </Button>
            <Button size="sm" variant={calMode === "week" ? "secondary" : "outline"} onClick={() => setCalMode("week")}>
              {t("events.resources.weekView")}
            </Button>
            {calMode === "month" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
                  {t("events.calendar.prev")}
                </Button>
                <span className="text-sm font-semibold tabular-nums">{month}</span>
                <Button size="sm" variant="outline" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
                  {t("events.calendar.next")}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setWeek((w) => ymdAddDays(w, -7))}>
                  {t("events.calendar.prev")}
                </Button>
                <span className="text-sm font-semibold tabular-nums">
                  {week} → {weekDays[6]}
                </span>
                <Button size="sm" variant="outline" onClick={() => setWeek((w) => ymdAddDays(w, 7))}>
                  {t("events.calendar.next")}
                </Button>
              </>
            )}
          </div>

          {calMode === "month" ? (
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border/40 bg-border/40">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="bg-card px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  {t(`events.calendar.dow.${d}`)}
                </div>
              ))}
              {monthGrid.map((cell, idx) => {
                const hits = cell.date ? byDay.get(cell.date) ?? [] : [];
                return (
                  <div key={idx} className={cn("min-h-20 bg-card p-1.5", !cell.date && "bg-muted/30")}>
                    {cell.day ? <p className="text-[10px] font-semibold tabular-nums text-muted-foreground">{cell.day}</p> : null}
                    <ul className="mt-1 space-y-0.5">
                      {hits.slice(0, 3).map((a) => (
                        <li key={a.id} className="truncate rounded bg-sky-500/10 px-1 text-[10px]">
                          {a.staff_name ?? a.staff_id.slice(0, 6)}
                          {a.allocated_hours != null ? ` · ${a.allocated_hours}h` : ""}
                        </li>
                      ))}
                      {hits.length > 3 ? (
                        <li className="text-[10px] text-muted-foreground">+{hits.length - 3}</li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-7">
              {weekDays.map((date) => {
                const hits = (data?.allocations ?? []).filter((a) => a.start_date <= date && a.end_date >= date);
                return (
                  <div key={date} className="rounded-2xl border border-border/40 bg-card p-2">
                    <p className="text-[10px] font-semibold tabular-nums text-muted-foreground">{date}</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      {hits.length === 0 ? (
                        <li className="text-muted-foreground">—</li>
                      ) : (
                        hits.map((a) => (
                          <li key={a.id}>
                            {a.staff_name ?? a.staff_id.slice(0, 6)}
                            {a.task_title ? ` · ${a.task_title}` : ""}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timesheets" className="space-y-4">
          {canEdit ? (
            <div className="grid gap-2 rounded-2xl border border-border/40 bg-card p-4 md:grid-cols-3">
              <Select
                value={tsDraft.staff_id || "none"}
                onValueChange={(v) => setTsDraft((s) => ({ ...s, staff_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("events.overview.selectStaff")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("events.overview.selectStaff")}</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={tsDraft.task_id || "none"}
                onValueChange={(v) => setTsDraft((s) => ({ ...s, task_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("events.resources.optionalTask")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("events.resources.optionalTask")}</SelectItem>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={tsDraft.work_date}
                onChange={(e) => setTsDraft((s) => ({ ...s, work_date: e.target.value }))}
              />
              <Input
                type="number"
                min={0.25}
                max={24}
                step={0.25}
                value={tsDraft.hours}
                onChange={(e) => setTsDraft((s) => ({ ...s, hours: e.target.value }))}
                placeholder={t("events.resources.hours")}
              />
              <Input
                value={tsDraft.note}
                onChange={(e) => setTsDraft((s) => ({ ...s, note: e.target.value }))}
                placeholder={t("events.resources.notes")}
              />
              <Button
                size="sm"
                disabled={!tsDraft.staff_id || !tsDraft.work_date || !tsDraft.hours || saveTs.isPending}
                onClick={() => saveTs.mutate()}
              >
                {t("events.resources.addTimesheet")}
              </Button>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-border/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("events.resources.staff")}</TableHead>
                  <TableHead>{t("events.resources.task")}</TableHead>
                  <TableHead>{t("events.resources.workDate")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.hours")}</TableHead>
                  <TableHead>{t("events.fields.status")}</TableHead>
                  {canEdit ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.timesheets ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} className="text-muted-foreground">
                      {t("events.resources.tsEmpty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.timesheets ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.staff_name ?? row.staff_id}</TableCell>
                      <TableCell>{row.task_title ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{row.work_date}</TableCell>
                      <TableCell className="text-end tabular-nums">{row.hours}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t(`events.resources.tsStatus.${row.status}`)}</Badge>
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="space-x-1 text-end">
                          {row.status === "draft" || row.status === "rejected" ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => tsAction.mutate({ id: row.id, action: "submit" })}>
                                {t("events.resources.submit")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => tsAction.mutate({ id: row.id, action: "delete" })}>
                                {t("common.remove")}
                              </Button>
                            </>
                          ) : null}
                          {row.status === "draft" || row.status === "submitted" ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => tsAction.mutate({ id: row.id, action: "approve" })}>
                                {t("events.resources.approve")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => tsAction.mutate({ id: row.id, action: "reject" })}>
                                {t("events.resources.reject")}
                              </Button>
                            </>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/40">
            <h3 className="border-b border-border/40 px-4 py-2 text-sm font-semibold">
              {t("events.resources.estVsActualTitle")}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("events.resources.staff")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.estHours")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.actHours")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.tsApprovedHours")}</TableHead>
                  <TableHead className="text-end">{t("events.resources.variance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.estVsActual ?? []).map((row) => (
                  <TableRow key={row.staff_id ?? "unassigned"}>
                    <TableCell>{row.staff_name ?? t("events.resources.unassigned")}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.estimatedHours}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.actualHours}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.timesheetApprovedHours}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.varianceHours}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
