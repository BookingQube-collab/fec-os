"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plane,
  RefreshCw,
  UserMinus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatReportingTime12h, formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import {
  addCalendarDays,
  calendarKpiPercent,
  calendarMonthBounds,
  dayCellSummaryParts,
  type CalendarDayAggregate,
  type CalendarStatusFilter,
  type DayCellSummaryPart,
} from "@/lib/attendance-hr/attendance-leave-calendar";
import {
  getAttendanceLeaveCalendar,
  type AttendanceLeaveCalendarResult,
} from "@/lib/attendance-hr/attendance-leave-calendar.functions";
import { ME_CORRECTION_HREF } from "@/lib/attendance-hr/missed-punch-approval";
import { qatarTodayYmd } from "@/lib/attendance-hr/dashboard";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type CalendarView = "month" | "week" | "day";
type StatusCode = DayCellSummaryPart["code"];

const STATUS_TEXT: Record<StatusCode, string> = {
  P: "text-emerald-700",
  A: "text-rose-700",
  L: "text-amber-700",
  LT: "text-indigo-700",
  WO: "text-slate-600",
  H: "text-[color:var(--hd-accent-deep)]",
  S: "text-[color:var(--electric)]",
};

const STATUS_DOT: Record<StatusCode, string> = {
  P: "bg-emerald-500",
  A: "bg-rose-500",
  L: "bg-amber-500",
  LT: "bg-indigo-500",
  WO: "bg-slate-400",
  H: "bg-[color:var(--hd-accent)]",
  S: "bg-[color:var(--electric)]",
};

function pctLabel(count: number, total: number): string {
  const pct = calendarKpiPercent(count, total);
  return pct == null ? "" : ` (${pct}%)`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y || 1970, (m || 1) - 1, 1)),
  );
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y || 1970, (m || 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function initials(name: string | null | undefined): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

function emptyAgg(ymd: string, today: string): CalendarDayAggregate {
  return {
    workDate: ymd,
    isToday: ymd === today,
    isFuture: ymd > today,
    buckets: {
      scheduled: 0,
      present: 0,
      absent: 0,
      leave: 0,
      late: 0,
      weekOff: 0,
      holiday: 0,
      missedPunch: 0,
    },
  };
}

function buildMonthCells(month: string, days: CalendarDayAggregate[], today: string) {
  const { dateFrom, dateTo } = calendarMonthBounds(month);
  const start = new Date(`${dateFrom}T12:00:00.000Z`);
  const startDow = start.getUTCDay();
  const mondayIndex = startDow === 0 ? 6 : startDow - 1;
  const byDate = new Map(days.map((d) => [d.workDate, d]));
  const cells: Array<{ ymd: string | null; agg: CalendarDayAggregate | null }> = [];
  for (let i = 0; i < mondayIndex; i += 1) cells.push({ ymd: null, agg: null });
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    cells.push({ ymd: cursor, agg: byDate.get(cursor) ?? emptyAgg(cursor, today) });
    cursor = addCalendarDays(cursor, 1);
  }
  while (cells.length % 7 !== 0) cells.push({ ymd: null, agg: null });
  return cells;
}

function StatusParts({ parts, className }: { parts: DayCellSummaryPart[]; className?: string }) {
  if (parts.length === 0) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 gap-y-0.5", className)}>
      {parts.map((part, idx) => (
        <span key={part.code} className="inline-flex items-center gap-0.5">
          {idx > 0 ? <span className="text-muted-foreground/70">|</span> : null}
          <span className={cn("font-semibold tabular-nums", STATUS_TEXT[part.code])}>
            {part.code} {part.count}
          </span>
        </span>
      ))}
    </span>
  );
}

function KpiCard({
  label,
  value,
  pct,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  pct?: string;
  tone: "purple" | "green" | "red" | "amber" | "indigo";
  icon: LucideIcon;
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-900"
      : tone === "red"
        ? "border-rose-200/80 bg-rose-50/70 text-rose-900"
        : tone === "amber"
          ? "border-amber-200/80 bg-amber-50/70 text-amber-950"
          : tone === "indigo"
            ? "border-indigo-200/80 bg-indigo-50/70 text-indigo-950"
            : "border-[color:var(--hd-accent)]/25 bg-[color:var(--hd-wash)] text-[color:var(--hd-accent-deep)]";
  const iconClass =
    tone === "green"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "red"
        ? "bg-rose-100 text-rose-700"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800"
          : tone === "indigo"
            ? "bg-indigo-100 text-indigo-700"
            : "bg-[color:var(--hd-accent)]/15 text-[color:var(--hd-accent-deep)]";
  return (
    <div className={cn("rounded-2xl border px-3 py-3 shadow-sm", toneClass)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.7rem] font-medium uppercase tracking-wide opacity-80">{label}</p>
        <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full", iconClass)}>
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
        {pct ? <span className="ms-1 text-sm font-medium opacity-80">{pct}</span> : null}
      </p>
    </div>
  );
}

function SidebarStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: StatusCode;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-[color:var(--hd-wash)]/40 px-3 py-2">
      <span className="inline-flex items-center gap-2 text-sm">
        <span
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full bg-background shadow-sm",
            STATUS_TEXT[tone],
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
        </span>
        {label}
      </span>
      <span className={cn("text-sm font-semibold tabular-nums", STATUS_TEXT[tone])}>{value}</span>
    </li>
  );
}

function PanelHead({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">
        {title}
        {count != null ? (
          <span className="ms-1.5 rounded-full bg-[color:var(--hd-wash)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[color:var(--hd-accent-deep)]">
            {count}
          </span>
        ) : null}
      </h3>
      {action}
    </div>
  );
}

export function MeAttendanceLeaveCalendar() {
  const { t } = useTranslation();
  const today = qatarTodayYmd();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [view, setView] = useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const [locationId, setLocationId] = useState<string>("all");
  const [department, setDepartment] = useState<string>("all");
  const [jobTitle, setJobTitle] = useState<string>("all");
  const [status, setStatus] = useState<CalendarStatusFilter>("all");
  const [staffQ, setStaffQ] = useState("");
  const [staffQDraft, setStaffQDraft] = useState("");
  const [detailDate, setDetailDate] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "my-day-attendance-leave-calendar",
      month,
      calendarView: view,
      anchorDate,
      locationId: locationId === "all" ? null : locationId,
      department: department === "all" ? null : department,
      jobTitle: jobTitle === "all" ? null : jobTitle,
      status,
      staffQ: staffQ || null,
      detailDate,
    }),
    queryFn: () =>
      getAttendanceLeaveCalendar({
        month,
        view,
        anchorDate,
        locationId: locationId === "all" ? null : locationId,
        department: department === "all" ? undefined : department,
        jobTitle: jobTitle === "all" ? undefined : jobTitle,
        status,
        staffQ: staffQ || undefined,
        detailDate: detailDate ?? undefined,
      }),
    staleTime: STALE.people,
  });

  const data = query.data as AttendanceLeaveCalendarResult | undefined;
  const kpis = data?.kpis;
  const total = kpis?.total ?? 0;
  const monthCells = useMemo(
    () => (data ? buildMonthCells(data.month, data.days, data.today) : []),
    [data],
  );

  const weekDays = useMemo(() => {
    if (!data || view !== "week") return [];
    const byDate = new Map(data.days.map((d) => [d.workDate, d]));
    const out: CalendarDayAggregate[] = [];
    let cursor = data.dateFrom;
    while (cursor <= data.dateTo) {
      out.push(byDate.get(cursor) ?? emptyAgg(cursor, data.today));
      cursor = addCalendarDays(cursor, 1);
    }
    return out;
  }, [data, view]);

  const upcomingByDay = useMemo(() => {
    if (!data) return [] as Array<[string, number]>;
    const start = upcomingFromSafe(data.today);
    const end = addCalendarDays(data.today, 7);
    const acc: Record<string, number> = {};
    for (const leave of data.upcomingLeaves) {
      let cursor = leave.dateFrom < start ? start : leave.dateFrom;
      const leaveEnd = leave.dateTo > end ? end : leave.dateTo;
      while (cursor <= leaveEnd) {
        acc[cursor] = (acc[cursor] ?? 0) + 1;
        cursor = addCalendarDays(cursor, 1);
      }
    }
    return Object.entries(acc).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const legendItems: Array<{ code: StatusCode; label: string }> = [
    { code: "P", label: t("hr.me.calendarLegend.present") },
    { code: "A", label: t("hr.me.calendarLegend.absent") },
    { code: "L", label: t("hr.me.calendarLegend.leave") },
    { code: "LT", label: t("hr.me.calendarLegend.late") },
    { code: "WO", label: t("hr.me.calendarLegend.weekOff") },
    { code: "H", label: t("hr.me.calendarLegend.holiday") },
    { code: "S", label: t("hr.me.calendarLegend.scheduled") },
  ];

  function openDay(ymd: string) {
    setAnchorDate(ymd);
    setDetailDate(ymd);
  }

  function shiftView(delta: number) {
    if (view === "month") {
      const next = shiftMonth(month, delta);
      setMonth(next);
      setAnchorDate(`${next}-01`);
      return;
    }
    if (view === "week") {
      const next = addCalendarDays(anchorDate, delta * 7);
      setAnchorDate(next);
      setMonth(next.slice(0, 7));
      return;
    }
    const next = addCalendarDays(anchorDate, delta);
    setAnchorDate(next);
    setMonth(next.slice(0, 7));
  }

  const calendarBody =
    query.isError ? (
      <p className="hd-empty">{t("hr.me.calendarUnavailable")}</p>
    ) : query.isLoading ? (
      <Skeleton className="h-72 w-full rounded-2xl" />
    ) : view === "month" ? (
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-background/70 p-2">
        <div className="grid min-w-[44rem] grid-cols-7 gap-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-2 py-1 text-center text-[0.7rem] font-semibold uppercase text-muted-foreground">
              {d}
            </div>
          ))}
          {monthCells.map((cell, idx) =>
            cell.ymd && cell.agg ? (
              <button
                key={cell.ymd}
                type="button"
                onClick={() => openDay(cell.ymd!)}
                className={cn(
                  "min-h-[5.25rem] rounded-xl border border-transparent bg-[color:var(--hd-wash)]/60 px-2 py-1.5 text-start transition hover:border-[color:var(--hd-accent)]/40",
                  cell.agg.isToday &&
                    "border-[color:var(--electric)] bg-[color:var(--hd-wash)] ring-1 ring-[color:var(--electric)]/40",
                  cell.agg.isFuture && "opacity-80",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold tabular-nums">{Number(cell.ymd.slice(8, 10))}</span>
                  {cell.agg.isToday ? (
                    <span className="text-[0.65rem] font-medium text-[color:var(--electric)]">
                      {t("hr.me.attendanceToday")}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-[0.68rem] leading-snug">
                  <StatusParts parts={dayCellSummaryParts(cell.agg)} />
                </div>
              </button>
            ) : (
              <div key={`empty-${idx}`} className="min-h-[5.25rem] rounded-xl bg-transparent" />
            ),
          )}
        </div>
      </div>
    ) : view === "week" ? (
      <div className="grid gap-2 md:grid-cols-7">
        {weekDays.map((day) => (
          <button
            key={day.workDate}
            type="button"
            onClick={() => openDay(day.workDate)}
            className={cn(
              "rounded-2xl border border-border/60 bg-background/80 p-3 text-start",
              day.isToday && "border-[color:var(--electric)] ring-1 ring-[color:var(--electric)]/30",
            )}
          >
            <p className="text-sm font-semibold">{formatWorkDateDdMmYyyy(day.workDate)}</p>
            <div className="mt-2 text-xs">
              <StatusParts parts={dayCellSummaryParts(day)} />
            </div>
          </button>
        ))}
      </div>
    ) : (
      <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{formatWorkDateDdMmYyyy(anchorDate)}</h3>
          <Button type="button" size="sm" variant="outline" onClick={() => openDay(anchorDate)}>
            {t("hr.me.calendarOpenDetail")}
          </Button>
        </div>
        <div className="mt-2 text-sm">
          <StatusParts
            parts={dayCellSummaryParts(
              data?.days.find((d) => d.workDate === anchorDate) ?? emptyAgg(anchorDate, today),
            )}
          />
        </div>
      </div>
    );

  return (
    <div className="hd-stack gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hd-hint">{t("hr.me.calendarHint")}</p>
          {data?.lastSyncAt ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3.5" aria-hidden />
              {t("hr.me.calendarLastSync", {
                time: new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Qatar",
                }).format(new Date(data.lastSyncAt)),
              })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border/70 bg-background p-0.5">
            {(["month", "week", "day"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize",
                  view === mode ? "bg-[color:var(--electric)] text-white" : "text-muted-foreground",
                )}
                onClick={() => setView(mode)}
              >
                {t(`hr.me.calendarView.${mode}`)}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => shiftView(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-semibold">
              {view === "month"
                ? monthLabel(month)
                : view === "week"
                  ? `${formatWorkDateDdMmYyyy(data?.dateFrom ?? anchorDate)} – ${formatWorkDateDdMmYyyy(data?.dateTo ?? anchorDate)}`
                  : formatWorkDateDdMmYyyy(anchorDate)}
            </span>
            <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => shiftView(1)}>
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setAnchorDate(today);
              }}
            >
              {t("hr.me.attendanceToday")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {query.isLoading || !kpis ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />)
        ) : (
          <>
            <KpiCard label={t("hr.me.calendarKpi.total")} value={kpis.total || kpis.scheduled} tone="purple" icon={Users} />
            <KpiCard
              label={t("hr.me.calendarKpi.present")}
              value={kpis.present}
              pct={pctLabel(kpis.present, total)}
              tone="green"
              icon={CalendarCheck2}
            />
            <KpiCard
              label={t("hr.me.calendarKpi.absent")}
              value={kpis.absent}
              pct={pctLabel(kpis.absent, total)}
              tone="red"
              icon={UserMinus}
            />
            <KpiCard
              label={t("hr.me.calendarKpi.leave")}
              value={kpis.leave}
              pct={pctLabel(kpis.leave, total)}
              tone="amber"
              icon={Plane}
            />
            <KpiCard
              label={t("hr.me.calendarKpi.late")}
              value={kpis.late}
              pct={pctLabel(kpis.late, total)}
              tone="indigo"
              icon={Clock3}
            />
          </>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger>
            <SelectValue placeholder={t("hr.me.calendarFilter.location")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hr.me.calendarFilter.allLocations")}</SelectItem>
            {(data?.sites ?? []).map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.code}
                {site.name ? ` — ${site.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger>
            <SelectValue placeholder={t("hr.me.calendarFilter.department")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hr.me.calendarFilter.allDepartments")}</SelectItem>
            {(data?.filterOptions.departments ?? []).map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jobTitle} onValueChange={setJobTitle}>
          <SelectTrigger>
            <SelectValue placeholder={t("hr.me.calendarFilter.designation")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hr.me.calendarFilter.allDesignations")}</SelectItem>
            {(data?.filterOptions.jobTitles ?? []).map((title) => (
              <SelectItem key={title} value={title}>
                {title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as CalendarStatusFilter)}>
          <SelectTrigger>
            <SelectValue placeholder={t("hr.me.calendarFilter.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hr.me.calendarFilter.allStatuses")}</SelectItem>
            <SelectItem value="present">{t("hr.me.calendarLegend.present")}</SelectItem>
            <SelectItem value="absent">{t("hr.me.calendarLegend.absent")}</SelectItem>
            <SelectItem value="leave">{t("hr.me.calendarLegend.leave")}</SelectItem>
            <SelectItem value="late">{t("hr.me.calendarLegend.late")}</SelectItem>
            <SelectItem value="week_off">{t("hr.me.calendarLegend.weekOff")}</SelectItem>
            <SelectItem value="holiday">{t("hr.me.calendarLegend.holiday")}</SelectItem>
            <SelectItem value="missed_punch">{t("hr.me.calendarException.missedPunch")}</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setStaffQ(staffQDraft.trim());
          }}
        >
          <Input
            value={staffQDraft}
            onChange={(e) => setStaffQDraft(e.target.value)}
            placeholder={t("hr.me.calendarFilter.search")}
          />
          <Button type="submit" variant="outline">
            {t("common.search", { defaultValue: "Search" })}
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="font-medium text-foreground">{t("hr.me.calendarLegend.title")}:</span>
        {legendItems.map((item) => (
          <span key={item.code} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className={cn("size-2.5 rounded-full", STATUS_DOT[item.code])} aria-hidden />
            <span className={cn("font-semibold", STATUS_TEXT[item.code])}>{item.code}</span>
            <span>{item.label}</span>
          </span>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(16rem,0.85fr)]">
        <div className="min-w-0">{calendarBody}</div>

        <aside className="grid gap-3 content-start">
          <section className="rounded-2xl border border-border/60 bg-background/80 p-4">
            <h3 className="text-sm font-semibold">
              {t("hr.me.calendarTodaySummary", {
                date: formatWorkDateDdMmYyyy(data?.today ?? today),
              })}
            </h3>
            {query.isLoading || !kpis ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-xl" />
                ))}
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                <SidebarStat
                  label={t("hr.me.calendarLegend.present")}
                  value={kpis.present}
                  icon={CheckCircle2}
                  tone="P"
                />
                <SidebarStat
                  label={t("hr.me.calendarLegend.absent")}
                  value={kpis.absent}
                  icon={XCircle}
                  tone="A"
                />
                <SidebarStat
                  label={t("hr.me.calendarLegend.leave")}
                  value={kpis.leave}
                  icon={Plane}
                  tone="L"
                />
                <SidebarStat
                  label={t("hr.me.calendarKpi.lateIn")}
                  value={kpis.late}
                  icon={Clock3}
                  tone="LT"
                />
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-background/80 p-4">
            <h3 className="text-sm font-semibold">{t("hr.me.calendarLocationToday")}</h3>
            <ul className="mt-3 space-y-2">
              {(data?.locationBreakdown ?? []).length === 0 ? (
                <li className="hd-empty">{t("hr.me.calendarNoLocations")}</li>
              ) : (
                (data?.locationBreakdown ?? []).map((loc) => {
                  const denom =
                    loc.buckets.scheduled || loc.buckets.present + loc.buckets.absent + loc.buckets.leave;
                  const presentPct = calendarKpiPercent(loc.buckets.present, denom) ?? 0;
                  return (
                    <li key={loc.locationId} className="rounded-xl border border-border/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {loc.locationCode}
                          {loc.locationName ? ` — ${loc.locationName}` : ""}
                        </p>
                        <StatusParts
                          className="text-[0.7rem]"
                          parts={[
                            ...(loc.buckets.present ? [{ code: "P" as const, count: loc.buckets.present }] : []),
                            ...(loc.buckets.absent ? [{ code: "A" as const, count: loc.buckets.absent }] : []),
                            ...(loc.buckets.leave ? [{ code: "L" as const, count: loc.buckets.leave }] : []),
                          ]}
                        />
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(100, presentPct)}%` }}
                        />
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
            {(data?.shortageHints.length ?? 0) > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
                <p className="font-semibold">{t("hr.me.calendarShortage")}</p>
                <ul className="mt-1 space-y-0.5">
                  {data!.shortageHints.slice(0, 4).map((hint) => (
                    <li key={hint.locationId}>
                      {hint.label}: {hint.coveragePct}%
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <PanelHead
            title={t("hr.me.calendarOnLeaveToday")}
            count={data?.onLeaveToday.length}
            action={
              (data?.onLeaveToday.length ?? 0) > 0 ? (
                <button
                  type="button"
                  className="text-xs font-medium text-[color:var(--hd-accent)] underline-offset-2 hover:underline"
                  onClick={() => openDay(data?.today ?? today)}
                >
                  {t("hr.me.calendarViewAll")}
                </button>
              ) : null
            }
          />
          {(data?.onLeaveToday ?? []).length === 0 ? (
            <p className="mt-3 hd-empty">{t("hr.me.calendarNoLeaveToday")}</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {(data?.onLeaveToday ?? []).slice(0, 6).map((person) => (
                  <Avatar key={`${person.staffId}-${person.dateFrom}`} className="size-9 border border-border/60">
                    <AvatarFallback className="bg-[color:var(--hd-wash)] text-[0.65rem] font-semibold text-[color:var(--hd-accent-deep)]">
                      {initials(person.staffName || person.employeeCode)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {(data?.onLeaveToday ?? []).slice(0, 5).map((person) => (
                  <li key={`${person.staffId}-row-${person.dateFrom}`} className="hd-row !px-0">
                    <div>
                      <p className="hd-row__title">{person.staffName || person.employeeCode || "—"}</p>
                      <p className="hd-row__meta">
                        {person.leaveType}
                        {person.locationCode ? ` · ${person.locationCode}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-rose-200/70 bg-rose-50/50 p-4">
          <PanelHead
            title={t("hr.me.calendarExceptions")}
            count={(data?.exceptions ?? []).reduce((sum, g) => sum + g.count, 0)}
            action={
              <Link
                href={ME_CORRECTION_HREF}
                className="text-xs font-medium text-[color:var(--hd-accent)] underline-offset-2 hover:underline"
              >
                {t("hr.me.calendarViewAll")}
              </Link>
            }
          />
          <ul className="mt-3 space-y-2">
            {(data?.exceptions ?? []).length === 0 ? (
              <li className="text-xs text-rose-900/70">{t("hr.me.calendarNoExceptions")}</li>
            ) : (
              data!.exceptions.map((group) => (
                <li key={group.kind}>
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-900">
                    {group.kind === "absent" ? (
                      <XCircle className="size-3.5" aria-hidden />
                    ) : group.kind === "late" ? (
                      <Clock3 className="size-3.5" aria-hidden />
                    ) : (
                      <UserMinus className="size-3.5" aria-hidden />
                    )}
                    {t(`hr.me.calendarException.${group.kind === "missed_punch" ? "missedPunch" : group.kind}`)} (
                    {group.count})
                  </p>
                  <p className="mt-0.5 text-sm text-rose-950/90">{group.names.join(", ")}</p>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <PanelHead
            title={t("hr.me.calendarUpcomingLeaves")}
            count={data?.upcomingLeaves.length}
          />
          <ul className="mt-3 space-y-2">
            {upcomingByDay.length === 0 ? (
              <li className="hd-empty">{t("hr.me.calendarNoUpcomingLeaves")}</li>
            ) : (
              upcomingByDay.map(([ymd, count]) => (
                <li
                  key={ymd}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/50 px-3 py-2"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Plane className="size-3.5 text-amber-700" strokeWidth={1.75} aria-hidden />
                    {formatWorkDateDdMmYyyy(ymd)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("hr.me.calendarUpcomingCount", { count })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <Sheet open={Boolean(detailDate)} onOpenChange={(open) => !open && setDetailDate(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {detailDate
                ? t("hr.me.calendarDayDetail", { date: formatWorkDateDdMmYyyy(detailDate) })
                : t("hr.me.calendarOpenDetail")}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {query.isFetching && detailDate ? <Skeleton className="h-24 w-full" /> : null}
            {(data?.detailRows ?? []).length === 0 && !query.isFetching ? (
              <p className="hd-empty">{t("hr.me.calendarNoDayRows")}</p>
            ) : (
              (data?.detailRows ?? []).map((row) => (
                <div key={row.id} className="rounded-xl border border-border/60 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{row.staffName || row.employeeCode || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[row.employeeCode, row.jobTitle, row.locationCode].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full bg-[color:var(--hd-wash)] px-2 py-0.5 text-xs font-semibold",
                        row.calendarCode && row.calendarCode in STATUS_TEXT
                          ? STATUS_TEXT[row.calendarCode as StatusCode]
                          : null,
                      )}
                    >
                      {row.calendarCode || row.status}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <div>
                      <dt className="font-medium text-foreground">{t("hr.me.attendanceRosterShift")}</dt>
                      <dd>
                        {formatReportingTime12h(row.scheduledIn) || "—"} – {formatReportingTime12h(row.scheduledOut) || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">
                        {t("hr.me.attendancePunchIn")} / {t("hr.me.attendancePunchOut")}
                      </dt>
                      <dd>
                        {formatReportingTime12h(row.actualIn) || "—"} – {formatReportingTime12h(row.actualOut) || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">{t("hr.me.attendanceHoursWorked")}</dt>
                      <dd>{row.workedMinutes != null ? `${(row.workedMinutes / 60).toFixed(1)}h` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">{t("hr.me.attendanceLateMinutes")}</dt>
                      <dd>
                        {row.lateMinutes > 0
                          ? t("hr.me.attendanceMinutesValue", { minutes: row.lateMinutes })
                          : "—"}
                      </dd>
                    </div>
                    {row.leaveType ? (
                      <div className="col-span-2">
                        <dt className="font-medium text-foreground">{t("hr.me.calendarLegend.leave")}</dt>
                        <dd>{row.leaveType}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function upcomingFromSafe(today: string): string {
  return addCalendarDays(today, 1);
}
