"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LayoutGrid, Plus } from "lucide-react";

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
import { SPRINT_STATUSES, TASK_STATUSES, type TaskStatus } from "@/lib/events/constants";
import {
  averageVelocity,
  backlogTasks,
  buildBurndownSeries,
  computeVelocity,
  groupTasksByStatus,
  pickActiveSprint,
  sumStoryPoints,
  tasksForSprintBoard,
} from "@/lib/events/agile";
import type { EventSprintRow, EventTaskRow } from "@/lib/events/types";
import {
  CHART,
  CHART_MARGIN,
  chartGridProps,
  chartTick,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

type StaffOpt = { id: string; full_name: string };

type SprintDraft = {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: EventSprintRow["status"];
};

const emptySprintDraft = (): SprintDraft => ({
  name: "",
  goal: "",
  start_date: "",
  end_date: "",
  status: "planned",
});

export function EventKanbanBoard({
  eventId,
  tasks,
  sprints,
  staff,
  canEdit,
  onOpenTask,
  onStatusChange,
  onAssignSprint,
  onSaveSprint,
  onDeleteSprint,
  busy,
}: {
  eventId: string;
  tasks: EventTaskRow[];
  sprints: EventSprintRow[];
  staff: StaffOpt[];
  canEdit: boolean;
  onOpenTask: (task: EventTaskRow) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onAssignSprint: (taskIds: string[], sprintId: string | null) => void;
  onSaveSprint: (draft: SprintDraft & { id?: string }) => void;
  onDeleteSprint: (id: string) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const active = pickActiveSprint(sprints);
  const [boardSprint, setBoardSprint] = useState<string>(active?.id ?? "all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [workstreamFilter, setWorkstreamFilter] = useState("all");
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);
  const [selectedBacklog, setSelectedBacklog] = useState<Set<string>>(new Set());
  const [sprintDraft, setSprintDraft] = useState<SprintDraft>(emptySprintDraft());
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);

  const workstreams = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      if (task.workstream_code) {
        map.set(task.workstream_code, task.workstream_title ?? task.workstream_code);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const filtered = useMemo(() => {
    let list = tasksForSprintBoard(tasks, boardSprint);
    if (assigneeFilter !== "all") {
      list = list.filter(
        (task) =>
          task.assignee_staff_id === assigneeFilter ||
          task.owner_staff_id === assigneeFilter ||
          task.assignee_ids.includes(assigneeFilter),
      );
    }
    if (workstreamFilter !== "all") {
      list = list.filter((task) => task.workstream_code === workstreamFilter);
    }
    return list;
  }, [assigneeFilter, boardSprint, tasks, workstreamFilter]);

  const columns = useMemo(() => groupTasksByStatus(filtered), [filtered]);

  const backlog = useMemo(
    () =>
      backlogTasks(tasks, {
        hasSprints: sprints.length > 0,
        sprintId: boardSprint !== "all" && boardSprint !== "backlog" ? boardSprint : undefined,
      }),
    [boardSprint, sprints.length, tasks],
  );

  const selectedSprint =
    boardSprint !== "all" && boardSprint !== "backlog"
      ? sprints.find((s) => s.id === boardSprint) ?? null
      : active;

  const burndownTasks = useMemo(() => {
    if (!selectedSprint) return [];
    return tasks.filter((task) => task.sprint_id === selectedSprint.id);
  }, [selectedSprint, tasks]);

  const burndown = useMemo(() => {
    if (!selectedSprint) return [];
    return buildBurndownSeries(burndownTasks, {
      start_date: selectedSprint.start_date,
      end_date: selectedSprint.end_date,
    });
  }, [burndownTasks, selectedSprint]);

  const velocity = useMemo(() => computeVelocity(sprints, tasks), [sprints, tasks]);
  const avgVelocity = averageVelocity(velocity);

  const beginEditSprint = (sprint: EventSprintRow) => {
    setEditingSprintId(sprint.id);
    setSprintDraft({
      name: sprint.name,
      goal: sprint.goal ?? "",
      start_date: sprint.start_date ?? "",
      end_date: sprint.end_date ?? "",
      status: sprint.status,
    });
  };

  const submitSprint = () => {
    if (!sprintDraft.name.trim()) return;
    onSaveSprint({
      ...(editingSprintId ? { id: editingSprintId } : {}),
      ...sprintDraft,
    });
    setSprintDraft(emptySprintDraft());
    setEditingSprintId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/40 bg-card p-3">
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{t("events.plan.boardSprint")}</p>
          <Select value={boardSprint} onValueChange={setBoardSprint}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("events.plan.boardAllTasks")}</SelectItem>
              <SelectItem value="backlog">{t("events.plan.backlog")}</SelectItem>
              {sprints.map((sprint) => (
                <SelectItem key={sprint.id} value={sprint.id}>
                  {sprint.name}
                  {sprint.status === "active" ? ` · ${t("events.sprintStatus.active")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{t("events.plan.assignee")}</p>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("events.filters.all")}</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{t("events.plan.workstream")}</p>
          <Select value={workstreamFilter} onValueChange={setWorkstreamFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("events.filters.all")}</SelectItem>
              {workstreams.map(([code, title]) => (
                <SelectItem key={code} value={code}>
                  {title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline" className="ms-auto">
          <LayoutGrid className="me-1 size-3" aria-hidden />
          {t("events.plan.boardPoints", { n: sumStoryPoints(filtered) })}
        </Badge>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATUSES.map((status) => {
          const cards = columns[status];
          const isDrop = dropStatus === status && dragTaskId;
          return (
            <section
              key={status}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-xl border border-border/50 bg-muted/20",
                isDrop && "border-primary/60 bg-primary/5",
              )}
              onDragOver={(e) => {
                if (!canEdit || !dragTaskId) return;
                e.preventDefault();
                setDropStatus(status);
              }}
              onDragLeave={() => {
                if (dropStatus === status) setDropStatus(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragTaskId ?? e.dataTransfer.getData("text/task-id");
                setDragTaskId(null);
                setDropStatus(null);
                if (!canEdit || !id) return;
                const task = tasks.find((row) => row.id === id);
                if (!task || task.status === status) return;
                onStatusChange(id, status);
              }}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`events.taskStatus.${status}`)}
                </h3>
                <Badge variant="muted" className="text-[10px]">
                  {cards.length}
                </Badge>
              </header>
              <div className="flex min-h-28 flex-1 flex-col gap-2 p-2">
                {cards.map((task) => (
                  <article
                    key={task.id}
                    draggable={canEdit && !busy}
                    onDragStart={(e) => {
                      setDragTaskId(task.id);
                      e.dataTransfer.setData("text/task-id", task.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragTaskId(null);
                      setDropStatus(null);
                    }}
                    onClick={() => onOpenTask(task)}
                    className={cn(
                      "cursor-pointer rounded-lg border border-border/60 bg-card p-2.5 text-xs shadow-sm transition hover:border-primary/40",
                      dragTaskId === task.id && "opacity-60",
                      canEdit && "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-snug">{task.title}</p>
                      {task.story_points != null ? (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {task.story_points}pt
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                      {task.task_number ? <span className="font-mono">{task.task_number}</span> : null}
                      {task.assignee_name ? <span>· {task.assignee_name}</span> : null}
                      {task.due_date ? <span>· {task.due_date}</span> : null}
                    </div>
                    {task.workstream_title ? (
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">{task.workstream_title}</p>
                    ) : null}
                  </article>
                ))}
                {!cards.length ? (
                  <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">
                    {t("events.plan.boardEmptyColumn")}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border/40 bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("events.plan.backlog")}</h3>
            {canEdit && selectedBacklog.size > 0 && boardSprint !== "all" && boardSprint !== "backlog" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onAssignSprint([...selectedBacklog], boardSprint);
                  setSelectedBacklog(new Set());
                }}
              >
                {t("events.plan.assignToSprint", { n: selectedBacklog.size })}
              </Button>
            ) : null}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">{t("events.plan.backlogHint")}</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {backlog.slice(0, 40).map((task) => {
              const checked = selectedBacklog.has(task.id);
              return (
                <li
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg border border-border/40 px-2 py-1.5 text-xs"
                >
                  {canEdit ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedBacklog((prev) => {
                          const next = new Set(prev);
                          if (next.has(task.id)) next.delete(task.id);
                          else next.add(task.id);
                          return next;
                        });
                      }}
                      aria-label={task.title}
                    />
                  ) : null}
                  <button type="button" className="min-w-0 flex-1 text-start hover:underline" onClick={() => onOpenTask(task)}>
                    <span className="font-medium">{task.title}</span>
                    {task.story_points != null ? (
                      <span className="ms-1 text-muted-foreground">{task.story_points}pt</span>
                    ) : null}
                  </button>
                  {canEdit && task.sprint_id ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      disabled={busy}
                      onClick={() => onAssignSprint([task.id], null)}
                    >
                      {t("events.plan.unassignSprint")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
            {!backlog.length ? (
              <li className="py-4 text-center text-xs text-muted-foreground">{t("events.plan.backlogEmpty")}</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-xl border border-border/40 bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("events.plan.sprints")}</h3>
            {avgVelocity > 0 ? (
              <Badge variant="outline">{t("events.plan.avgVelocity", { n: avgVelocity })}</Badge>
            ) : null}
          </div>
          {canEdit ? (
            <div className="mb-3 grid gap-2 rounded-lg border border-dashed border-border/60 p-2 sm:grid-cols-2">
              <Input
                placeholder={t("events.plan.sprintName")}
                value={sprintDraft.name}
                onChange={(e) => setSprintDraft((s) => ({ ...s, name: e.target.value }))}
              />
              <Select
                value={sprintDraft.status}
                onValueChange={(v) => setSprintDraft((s) => ({ ...s, status: v as EventSprintRow["status"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPRINT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`events.sprintStatus.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={sprintDraft.start_date}
                onChange={(e) => setSprintDraft((s) => ({ ...s, start_date: e.target.value }))}
              />
              <Input
                type="date"
                value={sprintDraft.end_date}
                onChange={(e) => setSprintDraft((s) => ({ ...s, end_date: e.target.value }))}
              />
              <Input
                className="sm:col-span-2"
                placeholder={t("events.plan.sprintGoal")}
                value={sprintDraft.goal}
                onChange={(e) => setSprintDraft((s) => ({ ...s, goal: e.target.value }))}
              />
              <div className="flex gap-2 sm:col-span-2">
                <Button size="sm" disabled={busy || !sprintDraft.name.trim()} onClick={submitSprint}>
                  <Plus className="me-1 size-3.5" aria-hidden />
                  {editingSprintId ? t("events.plan.updateSprint") : t("events.plan.addSprint")}
                </Button>
                {editingSprintId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingSprintId(null);
                      setSprintDraft(emptySprintDraft());
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {sprints.map((sprint) => (
              <li
                key={sprint.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 px-2 py-1.5 text-xs"
              >
                <button type="button" className="font-medium hover:underline" onClick={() => setBoardSprint(sprint.id)}>
                  {sprint.name}
                </button>
                <Badge variant={sprint.status === "active" ? "success" : "outline"}>
                  {t(`events.sprintStatus.${sprint.status}`)}
                </Badge>
                {sprint.start_date || sprint.end_date ? (
                  <span className="text-muted-foreground">
                    {sprint.start_date ?? "—"} → {sprint.end_date ?? "—"}
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {t("events.plan.boardPoints", {
                    n: sumStoryPoints(tasks.filter((task) => task.sprint_id === sprint.id)),
                  })}
                </span>
                {canEdit ? (
                  <div className="ms-auto flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => beginEditSprint(sprint)}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-destructive"
                      disabled={busy}
                      onClick={() => onDeleteSprint(sprint.id)}
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
            {!sprints.length ? (
              <li className="py-3 text-center text-xs text-muted-foreground">{t("events.plan.sprintsEmpty")}</li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("events.plan.burndown")}
          subtitle={
            selectedSprint
              ? t("events.plan.burndownFor", { name: selectedSprint.name })
              : t("events.plan.burndownHint")
          }
        >
          {burndown.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={burndown} margin={CHART_MARGIN}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="date" tick={chartTick} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tick={chartTick} allowDecimals />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="remaining"
                    name={t("events.plan.remainingPoints")}
                    stroke={CHART.teal}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ideal"
                    name={t("events.plan.idealPoints")}
                    stroke={CHART.amber}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty label={t("events.plan.burndownEmpty")} />
          )}
        </ChartCard>

        <ChartCard title={t("events.plan.velocity")} subtitle={t("events.plan.velocityHint")}>
          {velocity.length ? (
            <ul className="space-y-2 text-sm">
              {velocity.map((row) => (
                <li key={row.sprintId} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2">
                  <span className="font-medium">{row.sprintName}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("events.plan.velocityRow", { done: row.completed, committed: row.committed })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ChartEmpty label={t("events.plan.velocityEmpty")} />
          )}
        </ChartCard>
      </div>

      <p className="sr-only">{eventId}</p>
    </div>
  );
}
