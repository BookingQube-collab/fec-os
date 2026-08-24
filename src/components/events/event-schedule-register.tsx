"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLOSED_TASK_STATUSES } from "@/lib/events/constants";
import type { EventTaskRow } from "@/lib/events/types";
import { daysBetween } from "@/lib/events/wbs";
import { cn } from "@/lib/utils";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(task: EventTaskRow, today: string) {
  return !CLOSED_TASK_STATUSES.has(task.status) && Boolean(task.due_date && task.due_date < today);
}

function statusVariant(task: EventTaskRow, today: string) {
  if (isOverdue(task, today)) return "destructive" as const;
  if (task.status === "completed") return "success" as const;
  if (task.status === "blocked") return "destructive" as const;
  if (task.status === "in_progress" || task.status === "under_review") return "info" as const;
  if (task.status === "waiting") return "warning" as const;
  return "muted" as const;
}

function durationLabel(task: EventTaskRow) {
  if (task.duration_days != null) return task.duration_days;
  const span = daysBetween(task.start_date, task.due_date);
  return span == null ? null : Math.max(1, span + 1);
}

export function EventScheduleRegister({
  tasks,
  allTasks,
  canEdit,
  onEdit,
  onDelete,
}: {
  tasks: EventTaskRow[];
  allTasks: EventTaskRow[];
  canEdit: boolean;
  onEdit: (task: EventTaskRow) => void;
  onDelete: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const today = todayYmd();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const tree = useMemo(() => {
    const filteredIds = new Set(tasks.map((row) => row.id));
    const extraParents = tasks
      .map((row) => row.parent_task_id)
      .filter((id): id is string => id != null && !filteredIds.has(id));
    const extra = allTasks.filter((row) => extraParents.includes(row.id));
    const visible = [...extra, ...tasks].filter(
      (row, i, list) => list.findIndex((item) => item.id === row.id) === i,
    );
    const byParent = new Map<string | null, EventTaskRow[]>();
    for (const row of visible) {
      const key = row.parent_task_id && visible.some((item) => item.id === row.parent_task_id)
        ? row.parent_task_id
        : null;
      const list = byParent.get(key) ?? [];
      list.push(row);
      byParent.set(key, list);
    }
    return { roots: byParent.get(null) ?? [], byParent };
  }, [allTasks, tasks]);

  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  const renderRow = (row: EventTaskRow, depth: number) => {
    const children = tree.byParent.get(row.id) ?? [];
    const expanded = open[row.id] ?? children.some((child) => isOverdue(child, today) || child.status === "blocked");
    const overdue = isOverdue(row, today);
    const noOwner = !row.owner_staff_id && !row.assignee_staff_id;
    const days = durationLabel(row);

    return (
      <Fragment key={row.id}>
        <TableRow className={cn(overdue && "bg-rag-red/5", row.status === "blocked" && "bg-rag-amber/10")}>
          <TableCell className="font-mono text-xs">{row.task_number ?? "—"}</TableCell>
          <TableCell>
            <div className="flex min-w-0 items-center gap-1" style={{ paddingInlineStart: depth * 16 }}>
              {children.length ? (
                <button
                  type="button"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                  aria-expanded={expanded}
                  aria-label={expanded ? t("events.plan.collapseSubs") : t("events.plan.expandSubs")}
                  onClick={() => toggle(row.id)}
                >
                  <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
                </button>
              ) : (
                <span className="inline-block w-7 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {row.title}
                  {row.is_milestone ? (
                    <Badge variant="outline" className="ms-1">◆</Badge>
                  ) : null}
                </p>
                {children.length ? (
                  <p className="text-[11px] text-muted-foreground">{t("events.plan.subtasksN", { n: children.length })}</p>
                ) : null}
              </div>
            </div>
          </TableCell>
          <TableCell className="tabular-nums text-xs">{row.start_date ?? "—"}</TableCell>
          <TableCell className="tabular-nums text-xs">{row.due_date ?? "—"}</TableCell>
          <TableCell className="tabular-nums text-xs">{days ?? "—"}</TableCell>
          <TableCell>
            {noOwner ? (
              <Badge variant="warning">{t("events.plan.missingOwner")}</Badge>
            ) : (
              <span className="text-sm">{row.owner_name ?? row.assignee_name}</span>
            )}
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              <Badge variant={statusVariant(row, today)}>
                {overdue ? t("events.plan.kpiOverdue") : t(`events.taskStatus.${row.status}`)}
              </Badge>
              {row.status === "blocked" && overdue ? (
                <Badge variant="warning">{t(`events.taskStatus.${row.status}`)}</Badge>
              ) : null}
            </div>
          </TableCell>
          <TableCell className="text-end">
            {canEdit ? (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>
                  {t("events.plan.editTask")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(row.id)}>
                  {t("common.delete")}
                </Button>
              </div>
            ) : null}
          </TableCell>
        </TableRow>
        {expanded ? children.map((child) => renderRow(child, depth + 1)) : null}
      </Fragment>
    );
  };

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{t("events.plan.tasks")}</h2>
        <p className="text-xs text-muted-foreground">{t("events.plan.registerHint")}</p>
      </div>
      {tree.roots.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("events.plan.emptyTasks")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("events.plan.taskId")}</TableHead>
              <TableHead>{t("events.plan.task")}</TableHead>
              <TableHead>{t("events.plan.start")}</TableHead>
              <TableHead>{t("events.plan.due")}</TableHead>
              <TableHead>{t("events.plan.durationDays")}</TableHead>
              <TableHead>{t("events.plan.owner")}</TableHead>
              <TableHead>{t("events.plan.status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>{tree.roots.map((row) => renderRow(row, 0))}</TableBody>
        </Table>
      )}
    </section>
  );
}
