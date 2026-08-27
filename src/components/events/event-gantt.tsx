"use client";

import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CLOSED_TASK_STATUSES } from "@/lib/events/constants";
import type {
  EventBaselineRow,
  EventDependencyRow,
  EventMilestoneRow,
  EventTaskRow,
  EventWbsNode,
} from "@/lib/events/types";
import { canonicalWorkstreamCode, STANDARD_WORKSTREAMS } from "@/lib/events/workstreams";
import { wbsAncestors } from "@/lib/events/wbs";
import { cn } from "@/lib/utils";

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function todayYmd() {
  return iso(new Date());
}

function isOverdue(task: EventTaskRow, today: string) {
  return !CLOSED_TASK_STATUSES.has(task.status) && Boolean(task.due_date && task.due_date < today);
}

type GanttRow =
  | { kind: "workstream"; id: string; title: string; start: string | null; due: string | null }
  | { kind: "task"; id: string; title: string; task: EventTaskRow }
  | { kind: "milestone"; id: string; title: string; mile: EventMilestoneRow };

function taskTone(task: EventTaskRow, today: string) {
  if (task.status === "completed") return "bg-rag-green";
  if (isOverdue(task, today) || task.status === "blocked") return "bg-rag-red";
  if (task.status === "in_progress" || task.status === "under_review" || task.status === "waiting") return "bg-primary";
  if ((task.variance.dueDays ?? 0) > 0 || task.is_critical) return "bg-rag-amber";
  return "bg-muted-foreground/45";
}

function HoverTip({
  alignPct,
  children,
}: {
  alignPct: number;
  children: ReactNode;
}) {
  const pin = Math.min(88, Math.max(8, alignPct));
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full z-30 mb-1.5 hidden min-w-[13rem] max-w-[16rem] -translate-x-1/2 rounded-lg border border-border/50 bg-card px-2.5 py-2 text-[11px] leading-snug text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.12)] group-hover/bar:block group-focus-within/bar:block"
      style={{ left: `${pin}%` }}
    >
      {children}
    </div>
  );
}

export function EventGantt({
  tasks,
  milestones,
  dependencies,
  wbs,
  baseline,
  onTaskSelect,
}: {
  tasks: EventTaskRow[];
  milestones: EventMilestoneRow[];
  dependencies: EventDependencyRow[];
  wbs: EventWbsNode[];
  baseline: EventBaselineRow | null;
  onTaskSelect?: (task: EventTaskRow) => void;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const today = todayYmd();

  const model = useMemo(() => {
    const used = new Set<string>();
    const usedMiles = new Set<string>();
    const rows: GanttRow[] = [];

    const taskGroupKey = (task: EventTaskRow) => {
      const code = canonicalWorkstreamCode(task.workstream_code);
      if (code) return `ws:${code}`;
      if (task.phase_id) return `phase:${task.phase_id}`;
      if (task.workstream_id) return `phase:${task.workstream_id}`;
      return "other";
    };

    const mileGroupKey = (mile: EventMilestoneRow) => {
      if (mile.wbs_id) {
        const chain = wbsAncestors(wbs, mile.wbs_id);
        for (const node of chain) {
          const code = canonicalWorkstreamCode(node.code);
          if (code) return `ws:${code}`;
        }
        const root = chain.at(-1);
        if (root) return `phase:${root.id}`;
      }
      if (mile.task_id) {
        const task = tasks.find((row) => row.id === mile.task_id);
        if (task) return taskGroupKey(task);
      }
      return "other";
    };

    const pushGroup = (id: string, title: string, groupTasks: EventTaskRow[], groupMiles: EventMilestoneRow[]) => {
      if (!groupTasks.length && !groupMiles.length) return;
      const dates = [
        ...groupTasks.flatMap((task) => [task.start_date, task.due_date]),
        ...groupMiles.map((mile) => mile.due_date),
      ].filter(Boolean) as string[];
      rows.push({
        kind: "workstream",
        id,
        title,
        start: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
        due: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
      });
      for (const task of groupTasks) {
        used.add(task.id);
        rows.push({
          kind: "task",
          id: task.id,
          title: task.task_number ? `${task.task_number} ${task.title}` : task.title,
          task,
        });
      }
      for (const mile of groupMiles) {
        usedMiles.add(mile.id);
        rows.push({ kind: "milestone", id: mile.id, title: mile.title, mile });
      }
    };

    for (const ws of STANDARD_WORKSTREAMS) {
      const groupTasks = tasks.filter((task) => taskGroupKey(task) === `ws:${ws.code}`);
      const groupMiles = milestones.filter((mile) => mileGroupKey(mile) === `ws:${ws.code}`);
      pushGroup(`ws:${ws.code}`, ar ? ws.title_ar : ws.title_en, groupTasks, groupMiles);
    }

    const leftoverPhases = wbs.filter((node) => !node.parent_id && !canonicalWorkstreamCode(node.code));
    for (const phase of leftoverPhases) {
      const groupTasks = tasks.filter((task) => !used.has(task.id) && taskGroupKey(task) === `phase:${phase.id}`);
      const groupMiles = milestones.filter((mile) => !usedMiles.has(mile.id) && mileGroupKey(mile) === `phase:${phase.id}`);
      pushGroup(`phase:${phase.id}`, phase.code ? `${phase.code} ${phase.title}` : phase.title, groupTasks, groupMiles);
    }

    const orphanTasks = tasks.filter((task) => !used.has(task.id));
    const orphanMiles = milestones.filter((mile) => !usedMiles.has(mile.id));
    pushGroup("other", t("events.plan.ungrouped"), orphanTasks, orphanMiles);

    const dates: string[] = [];
    for (const row of rows) {
      if (row.kind === "workstream") {
        if (row.start) dates.push(row.start);
        if (row.due) dates.push(row.due);
      } else if (row.kind === "task") {
        if (row.task.start_date) dates.push(row.task.start_date);
        if (row.task.due_date) dates.push(row.task.due_date);
        if (row.task.baseline_start) dates.push(row.task.baseline_start);
        if (row.task.baseline_due) dates.push(row.task.baseline_due);
        if (row.task.completed_at) dates.push(row.task.completed_at.slice(0, 10));
      } else {
        dates.push(row.mile.due_date);
        if (row.mile.baseline_due) dates.push(row.mile.baseline_due);
      }
    }
    if (!dates.length) return null;

    const min = dates.reduce((a, b) => (a < b ? a : b));
    const max = dates.reduce((a, b) => (a > b ? a : b));
    const start = toDate(min);
    const end = toDate(max);
    const span = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const useWeeks = span > 45;
    const unit = useWeeks ? 7 : 1;
    const cols = Math.ceil(span / unit);
    const headers = Array.from({ length: cols }, (_, i) => iso(addDays(start, i * unit)));
    const pos = (from: string | null, to: string | null) => {
      const a = toDate(from ?? to ?? min);
      const b = toDate(to ?? from ?? max);
      const left = Math.max(0, (a.getTime() - start.getTime()) / 86_400_000 / unit);
      const width = Math.max(0.6, (b.getTime() - a.getTime()) / 86_400_000 / unit + (useWeeks ? 0 : 1));
      return { left: (left / cols) * 100, width: (width / cols) * 100, mid: ((left + width / 2) / cols) * 100 };
    };

    const todayLeft = (() => {
      const day = toDate(today);
      if (day < start || day > addDays(end, 1)) return null;
      const left = Math.max(0, (day.getTime() - start.getTime()) / 86_400_000 / unit);
      return (left / cols) * 100;
    })();

    const taskIndex = new Map<string, number>();
    rows.forEach((row, i) => {
      if (row.kind === "task") taskIndex.set(row.id, i);
    });
    const links = dependencies
      .map((dep) => {
        const pred = tasks.find((row) => row.id === dep.predecessor_id);
        const succ = tasks.find((row) => row.id === dep.successor_id);
        const fromIdx = taskIndex.get(dep.predecessor_id);
        const toIdx = taskIndex.get(dep.successor_id);
        if (!pred || !succ || fromIdx == null || toIdx == null) return null;
        const fromBar = pos(
          dep.dep_type === "SS" || dep.dep_type === "SF" ? pred.start_date : pred.due_date ?? pred.start_date,
          dep.dep_type === "SS" || dep.dep_type === "SF" ? pred.start_date : pred.due_date ?? pred.start_date,
        );
        const toBar = pos(
          dep.dep_type === "FF" || dep.dep_type === "SF" ? succ.due_date ?? succ.start_date : succ.start_date,
          dep.dep_type === "FF" || dep.dep_type === "SF" ? succ.due_date ?? succ.start_date : succ.start_date,
        );
        return {
          id: dep.id,
          dep_type: dep.dep_type,
          fromIdx,
          toIdx,
          x1: fromBar.left + fromBar.width,
          x2: toBar.left,
        };
      })
      .filter(Boolean);

    return { headers, cols, pos, useWeeks, rows, links, rowH: 32, todayLeft };
  }, [ar, dependencies, milestones, t, tasks, today, wbs]);

  if (!model) {
    return <p className="text-sm text-muted-foreground">{t("events.plan.ganttEmpty")}</p>;
  }

  const chartH = model.rows.length * model.rowH;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card">
      <div className="min-w-[860px] p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("events.plan.gantt")}</p>
            <p className="text-[11px] text-muted-foreground">{t("events.plan.ganttHint")}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1"><i className="h-2 w-4 rounded bg-rag-green" /> {t("events.plan.legendDone")}</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-4 rounded bg-primary" /> {t("events.plan.legendProgress")}</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-4 rounded bg-rag-red" /> {t("events.plan.legendOverdue")}</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-4 rounded bg-muted-foreground/45" /> {t("events.plan.legendNotStarted")}</span>
            {baseline ? (
              <span className="inline-flex items-center gap-1"><i className="h-2 w-4 rounded border border-dashed border-muted-foreground/70" /> {t("events.plan.baseline")}</span>
            ) : null}
          </div>
        </div>
        <div className="mb-2 grid text-[10px] uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns: `220px repeat(${model.cols}, minmax(0,1fr))` }}>
          <span>{t("events.plan.ganttItem")}</span>
          {model.headers.map((h) => (
            <span key={h} className="truncate px-0.5">
              {h.slice(5)}
            </span>
          ))}
        </div>
        <div className="relative pt-6" style={{ minHeight: chartH + 24 }}>
          {model.todayLeft != null ? (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10"
              style={{ left: `calc(220px + (100% - 220px) * ${model.todayLeft / 100})` }}
            >
              <span className="absolute -top-5 start-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
                {t("events.plan.today")}
              </span>
              <span className="absolute inset-y-0 w-px bg-primary/70" />
            </div>
          ) : null}
          <div className="space-y-0">
            {model.rows.map((row) => {
              if (row.kind === "workstream") {
                const bar = row.start || row.due ? model.pos(row.start, row.due) : null;
                return (
                  <div key={row.id} className="grid items-center" style={{ gridTemplateColumns: "220px 1fr", height: model.rowH }}>
                    <p className="truncate pe-2 text-xs font-semibold">{row.title}</p>
                    <div className="relative h-5 rounded bg-muted/30">
                      {bar ? (
                        <span className="absolute top-1 h-3 rounded bg-muted-foreground/35" style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
                      ) : null}
                    </div>
                  </div>
                );
              }
              if (row.kind === "milestone") {
                const bar = model.pos(row.mile.due_date, row.mile.due_date);
                const ghost = row.mile.baseline_due ? model.pos(row.mile.baseline_due, row.mile.baseline_due) : null;
                const late = (row.mile.variance_days ?? 0) > 0 || row.mile.status === "missed";
                return (
                  <div key={row.id} className="grid items-center" style={{ gridTemplateColumns: "220px 1fr", height: model.rowH }}>
                    <p className="truncate pe-2 text-xs text-muted-foreground">◆ {row.title}</p>
                    <div className="group/bar relative h-5 rounded bg-muted/30">
                      {ghost ? <span className="absolute top-0.5 h-4 w-1.5 rounded-sm border border-dashed border-muted-foreground/70" style={{ left: `${ghost.left}%` }} /> : null}
                      <span className={cn("absolute top-0.5 h-4 w-1.5 rounded-sm", late ? "bg-rag-red" : "bg-foreground")} style={{ left: `${bar.left}%` }} />
                      <HoverTip alignPct={bar.left}>
                        <p className="font-semibold">◆ {row.title}</p>
                        <p className="mt-1 text-muted-foreground">
                          {t("events.plan.tooltipDates")}: {row.mile.due_date}
                        </p>
                        <p className="text-muted-foreground">
                          {t("events.plan.tooltipOwner")}: {row.mile.owner_name ?? t("events.builder.plan.unassigned")}
                        </p>
                      </HoverTip>
                    </div>
                  </div>
                );
              }
              const task = row.task;
              const bar = model.pos(task.start_date, task.due_date);
              const ghost = task.baseline_start || task.baseline_due ? model.pos(task.baseline_start, task.baseline_due) : null;
              const actual = task.completed_at ? model.pos(task.start_date, task.completed_at.slice(0, 10)) : null;
              const delayed = isOverdue(task, today);
              const tone = taskTone(task, today);
              const interactive = Boolean(onTaskSelect);
              return (
                <div key={row.id} className="grid items-center" style={{ gridTemplateColumns: "220px 1fr", height: model.rowH }}>
                  <p className="truncate pe-2 text-xs font-medium">{row.title}</p>
                  <div className="group/bar relative h-5 rounded bg-muted/30">
                    {ghost ? (
                      <span
                        className="absolute top-0 h-5 rounded border border-dashed border-muted-foreground/60"
                        style={{ left: `${ghost.left}%`, width: `${ghost.width}%` }}
                      />
                    ) : null}
                    {interactive ? (
                      <button
                        type="button"
                        onClick={() => onTaskSelect?.(task)}
                        className={cn("absolute top-1 h-3 overflow-hidden rounded", tone)}
                        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                        aria-label={row.title}
                      >
                        {task.status !== "completed" && task.percent_complete > 0 ? (
                          <span className="absolute inset-y-0 start-0 bg-white/25" style={{ width: `${Math.min(100, task.percent_complete)}%` }} />
                        ) : null}
                      </button>
                    ) : (
                      <span
                        className={cn("absolute top-1 h-3 overflow-hidden rounded", tone)}
                        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                      >
                        {task.status !== "completed" && task.percent_complete > 0 ? (
                          <span className="absolute inset-y-0 start-0 bg-white/25" style={{ width: `${Math.min(100, task.percent_complete)}%` }} />
                        ) : null}
                      </span>
                    )}
                    {actual ? (
                      <span className="absolute bottom-0 h-1 rounded bg-foreground/50" style={{ left: `${actual.left}%`, width: `${actual.width}%` }} />
                    ) : null}
                    <HoverTip alignPct={bar.mid}>
                      <p className="font-semibold">{task.title}</p>
                      <p className="mt-1 text-muted-foreground">
                        {t("events.plan.tooltipOwner")}: {task.owner_name ?? task.assignee_name ?? t("events.builder.plan.unassigned")}
                      </p>
                      <p className="text-muted-foreground">
                        {t("events.plan.tooltipDates")}: {task.start_date ?? "—"} – {task.due_date ?? "—"}
                      </p>
                      <p className="text-muted-foreground">
                        {t("events.plan.tooltipProgress")}: {task.percent_complete}%
                        {delayed ? ` · ${t("events.plan.kpiOverdue")}` : ""}
                      </p>
                    </HoverTip>
                  </div>
                </div>
              );
            })}
          </div>
          {model.links.length ? (
            <svg className="pointer-events-none absolute inset-0 start-[220px] top-6" viewBox={`0 0 1000 ${chartH}`} preserveAspectRatio="none">
              {model.links.map((link) => {
                if (!link) return null;
                const y1 = link.fromIdx * model.rowH + model.rowH / 2;
                const y2 = link.toIdx * model.rowH + model.rowH / 2;
                const x1 = (link.x1 / 100) * 1000;
                const x2 = (link.x2 / 100) * 1000;
                const mid = (x1 + x2) / 2;
                return (
                  <g key={link.id}>
                    <path
                      d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      className="text-muted-foreground/70"
                    />
                    <polygon points={`${x2},${y2} ${x2 - 6},${y2 - 3} ${x2 - 6},${y2 + 3}`} className="fill-muted-foreground/70" />
                    <title>{link.dep_type}</title>
                  </g>
                );
              })}
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}
