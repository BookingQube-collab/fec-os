"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, CircleDashed, ListTodo, Timer } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CLOSED_TASK_STATUSES } from "@/lib/events/constants";
import type { EventDetail, EventTaskRow } from "@/lib/events/types";
import { daysBetween } from "@/lib/events/wbs";
import { KPI_ICON_CLASS, KPI_TINT_CLASS, type KpiTint } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(task: EventTaskRow, today: string) {
  return !CLOSED_TASK_STATUSES.has(task.status) && Boolean(task.due_date && task.due_date < today);
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
  tone?: "danger" | "ok" | "warn" | "neutral";
  icon: typeof CheckCircle2;
}) {
  const tint: KpiTint =
    tone === "danger" ? "red" : tone === "warn" ? "amber" : tone === "ok" ? "green" : tone === "neutral" ? "slate" : "sky";
  return (
    <div className={cn("min-w-0 rounded-2xl border px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]", KPI_TINT_CLASS[tint])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("mt-1.5 text-2xl font-bold tabular-nums tracking-tight", tone === "danger" && "text-rag-red")}>
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", KPI_ICON_CLASS[tint])}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}

export function EventScheduleKpis({ event, tasks }: { event?: EventDetail | null; tasks: EventTaskRow[] }) {
  const { t } = useTranslation();
  const today = todayYmd();

  const stats = useMemo(() => {
    const open = tasks.filter((task) => task.status !== "cancelled");
    const done = open.filter((task) => task.status === "completed").length;
    const inProgress = open.filter((task) =>
      task.status === "in_progress" || task.status === "under_review" || task.status === "waiting",
    ).length;
    const overdue = open.filter((task) => isOverdue(task, today)).length;
    const notStarted = open.filter((task) => task.status === "not_started" || task.status === "planned").length;

    const dated = [
      event?.planning_start,
      event?.setup_start,
      event?.event_start,
      event?.event_end,
      event?.dismantle_end,
      ...open.flatMap((task) => [task.start_date, task.due_date]),
    ].filter((d): d is string => Boolean(d));
    const from = dated.length ? dated.reduce((a, b) => (a < b ? a : b)) : null;
    const to = dated.length ? dated.reduce((a, b) => (a > b ? a : b)) : null;
    const span = daysBetween(from, to);
    const duration = span == null ? null : Math.max(1, span + 1);

    return { total: open.length, done, inProgress, overdue, notStarted, from, to, duration };
  }, [event, tasks, today]);

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Kpi
        icon={CalendarDays}
        label={t("events.plan.kpiDuration")}
        value={stats.duration == null ? "—" : t("events.plan.daysShort", { n: stats.duration })}
        hint={
          stats.from && stats.to
            ? t("events.plan.kpiDurationHint", { from: stats.from, to: stats.to })
            : t("events.plan.kpiDurationEmpty")
        }
      />
      <Kpi icon={ListTodo} label={t("events.plan.kpiTasks")} value={String(stats.total)} />
      <Kpi
        icon={CheckCircle2}
        label={t("events.plan.kpiDone")}
        value={String(stats.done)}
        tone={stats.total > 0 && stats.done === stats.total ? "ok" : undefined}
      />
      <Kpi icon={Timer} label={t("events.plan.kpiInProgress")} value={String(stats.inProgress)} />
      <Kpi
        icon={AlertTriangle}
        label={t("events.plan.kpiOverdue")}
        value={String(stats.overdue)}
        tone={stats.overdue > 0 ? "danger" : "ok"}
      />
      <Kpi
        icon={CircleDashed}
        label={t("events.plan.kpiNotStarted")}
        value={String(stats.notStarted)}
        tone="neutral"
      />
    </div>
  );
}
