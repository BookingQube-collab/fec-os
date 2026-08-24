"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMyEventTasks } from "@/hooks/queries/useEvents";
import { useAppStore } from "@/stores/app-store";

export default function EventsTasksPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const tasks = useMyEventTasks(locationId);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("events.kicker")}
        title={t("events.myTasks.title")}
        subtitle={t("events.myTasks.subtitle")}
      />

      <div className="rounded-2xl border border-border/40 bg-card shadow-elevated-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("events.plan.taskId")}</TableHead>
              <TableHead>{t("events.plan.task")}</TableHead>
              <TableHead>{t("events.list.name")}</TableHead>
              <TableHead>{t("events.plan.due")}</TableHead>
              <TableHead>{t("events.plan.priority")}</TableHead>
              <TableHead>{t("events.plan.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tasks.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t("events.myTasks.empty")}
                </TableCell>
              </TableRow>
            ) : (
              (tasks.data ?? []).map((task) => {
                const overdue = Boolean(
                  task.due_date && task.due_date < today && task.status !== "completed",
                );
                return (
                  <TableRow key={task.id}>
                    <TableCell className="font-mono text-xs">{task.task_number ?? "—"}</TableCell>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <Link href={`/events/${task.event_id}`} className="underline-offset-2 hover:underline">
                        {task.event_number} · {task.event_name}
                      </Link>
                    </TableCell>
                    <TableCell className={overdue ? "text-rag-red" : ""}>{task.due_date ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={task.priority === "critical" ? "destructive" : "outline"}>
                        {t(`events.priority.${task.priority}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>{t(`events.taskStatus.${task.status}`)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
