"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { EventGantt } from "@/components/events/event-gantt";
import { EventScheduleHints } from "@/components/events/event-schedule-hints";
import { EventScheduleKpis } from "@/components/events/event-schedule-kpis";
import { EventScheduleRegister } from "@/components/events/event-schedule-register";
import { EventSourceBanner } from "@/components/events/event-source-banner";
import { EventTaskDialog, type TaskDraft } from "@/components/events/event-task-dialog";
import { EventWbsTree } from "@/components/events/event-wbs-tree";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { PageHeader } from "@/components/layout/page-header";
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
import { useEvent, useEventOptions, useEventPlan } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import {
  addEventTaskComment,
  deleteDependency,
  deleteEventTask,
  deleteMilestone,
  deleteWbsNode,
  moveWbsNode,
  saveEventBaseline,
  upsertDependency,
  upsertEventTask,
  upsertMilestone,
  upsertWbsNode,
} from "@/lib/events.functions";
import { CLOSED_TASK_STATUSES, DEP_TYPES, MILESTONE_STATUSES, PENDING_PR_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/events/constants";
import { missingDepartmentBoqs, missingRequiredByType, resolveDocumentStatus } from "@/lib/events/documents";
import { LIFECYCLE_PHASES } from "@/lib/events/lifecycle";
import type { EventTaskRow, EventWbsNode } from "@/lib/events/types";
import { STANDARD_WORKSTREAMS } from "@/lib/events/workstreams";
import { queryKeys } from "@/lib/query-keys";

function numOrNull(v: string) {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export default function EventPlanPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const canEdit = usePermission("events.edit");
  const eventQ = useEvent(id);
  const plan = useEventPlan(id);
  const options = useEventOptions();
  const [filters, setFilters] = useState({
    department: "all",
    owner: "all",
    phase: "all",
    workstream: "all",
    lifecycle: "all",
    priority: "all",
    status: "all",
  });
  const [dep, setDep] = useState({ predecessor_id: "", successor_id: "", dep_type: "FS", lag_days: "0" });
  const [mile, setMile] = useState({
    id: "" as string,
    title: "",
    due_date: "",
    status: "pending",
    owner_staff_id: "",
    wbs_id: "",
    task_id: "",
    is_critical: false,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<EventTaskRow | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.events.plan(id) });
    qc.invalidateQueries({ queryKey: queryKeys.events.detail(id) });
    qc.invalidateQueries({ queryKey: queryKeys.events.myTasks() });
  };

  const staff = options.data?.staff ?? [];
  const departments = options.data?.departments ?? [];
  const wbs = plan.data?.wbs ?? [];
  const tasks = plan.data?.tasks ?? [];
  const milestones = plan.data?.milestones ?? [];
  const latestBaseline = plan.data?.latestScheduleBaseline ?? plan.data?.baselines[0] ?? null;
  const overview = eventQ.data;
  const today = todayYmd();

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filters.department !== "all") {
        if (filters.department.startsWith("ws:")) {
          if (task.workstream_code !== filters.department.slice(3)) return false;
        } else if (task.department_id !== filters.department) return false;
      }
      if (filters.owner !== "all" && task.owner_staff_id !== filters.owner && task.assignee_staff_id !== filters.owner) return false;
      if (filters.phase !== "all" && task.phase_id !== filters.phase && task.wbs_id !== filters.phase) return false;
      if (filters.workstream !== "all" && task.workstream_code !== filters.workstream && task.phase_id !== filters.workstream && task.wbs_id !== filters.workstream) return false;
      if (filters.lifecycle !== "all" && task.lifecycle_phase !== filters.lifecycle) return false;
      if (filters.priority !== "all" && task.priority !== filters.priority) return false;
      if (filters.status !== "all" && task.status !== filters.status) return false;
      return true;
    });
  }, [tasks, filters]);

  const attention = useMemo(() => {
    const open = tasks.filter((task) => !CLOSED_TASK_STATUSES.has(task.status));
    const overdue = open.filter((task) => task.due_date && task.due_date < today).length;
    const blocked = open.filter((task) => task.status === "blocked").length;
    const missingOwner = open.filter((task) => !task.owner_staff_id && !task.assignee_staff_id).length;
    const docs = overview?.documents ?? [];
    const missingBoqN =
      missingDepartmentBoqs(docs, overview?.workstreams).length || missingRequiredByType(docs, "boq").length;
    const boqUploaded = docs.some((doc) => doc.doc_type === "boq" && resolveDocumentStatus(doc) === "uploaded");
    const pendingPrs = (overview?.linkedPrs ?? []).filter((pr) => PENDING_PR_STATUSES.has(pr.status)).length;
    return { overdue, blocked, missingOwner, missingBoq: missingBoqN > 0, missingBoqN, boqUploaded, pendingPrs };
  }, [overview?.documents, overview?.linkedPrs, overview?.workstreams, tasks, today]);

  const saveWbs = useMutation({
    mutationFn: (input: Parameters<typeof upsertWbsNode>[0]) => upsertWbsNode(input),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const moveNode = useMutation({
    mutationFn: (input: { id: string; direction: "up" | "down" | "indent" | "outdent" }) => moveWbsNode(input),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const removeNode = useMutation({
    mutationFn: (nodeId: string) => deleteWbsNode({ id: nodeId }),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const saveTask = useMutation({
    mutationFn: (draft: TaskDraft) =>
      upsertEventTask({
        id: activeTask?.id,
        eventId: id,
        title: draft.title,
        description: draft.description || null,
        wbs_id: draft.wbs_id || null,
        parent_task_id: draft.parent_task_id || null,
        owner_staff_id: draft.owner_staff_id || null,
        assignee_staff_id: draft.assignee_staff_id || null,
        department_id: draft.department_id || null,
        priority: draft.priority as EventTaskRow["priority"],
        status: draft.status as EventTaskRow["status"],
        start_date: draft.start_date || null,
        due_date: draft.due_date || null,
        percent_complete: draft.percent_complete,
        duration_days: numOrNull(draft.duration_days),
        estimated_hours: numOrNull(draft.estimated_hours),
        actual_hours: numOrNull(draft.actual_hours),
        estimated_cost: numOrNull(draft.estimated_cost),
        actual_cost: numOrNull(draft.actual_cost),
        is_milestone: draft.is_milestone,
        is_critical: draft.is_critical,
        checklist: draft.checklist,
        documents: draft.documents,
        supporter_ids: draft.supporter_ids,
        approval_status: draft.approval_status as EventTaskRow["approval_status"],
        delay_reason: draft.delay_reason || null,
        escalation_level: draft.escalation_level as EventTaskRow["escalation_level"],
        cost_impact: numOrNull(draft.cost_impact),
        evidence_url: draft.evidence_url || null,
        is_snag: draft.is_snag,
        lifecycle_phase: draft.lifecycle_phase || null,
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setActiveTask(null);
      invalidate();
      toast.success(t("events.toasts.taskSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const commentTask = useMutation({
    mutationFn: (body: string) => addEventTaskComment({ id: activeTask!.id, body }),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const removeTask = useMutation({
    mutationFn: (taskId: string) => deleteEventTask({ id: taskId }),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const addDep = useMutation({
    mutationFn: () =>
      upsertDependency({
        eventId: id,
        predecessor_id: dep.predecessor_id,
        successor_id: dep.successor_id,
        dep_type: dep.dep_type as "FS" | "SS" | "FF" | "SF",
        lag_days: Number(dep.lag_days || 0),
      }),
    onSuccess: () => {
      setDep({ predecessor_id: "", successor_id: "", dep_type: "FS", lag_days: "0" });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveMile = useMutation({
    mutationFn: () =>
      upsertMilestone({
        id: mile.id || undefined,
        eventId: id,
        title: mile.title,
        due_date: mile.due_date,
        status: mile.status as "pending" | "achieved" | "missed",
        owner_staff_id: mile.owner_staff_id || null,
        wbs_id: mile.wbs_id || null,
        task_id: mile.task_id || null,
        is_critical: mile.is_critical,
      }),
    onSuccess: () => {
      setMile({ id: "", title: "", due_date: "", status: "pending", owner_staff_id: "", wbs_id: "", task_id: "", is_critical: false });
      invalidate();
      toast.success(t("events.toasts.milestoneSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeMile = useMutation({
    mutationFn: (mileId: string) => deleteMilestone({ id: mileId }),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const baseline = useMutation({
    mutationFn: () => saveEventBaseline({ eventId: id, baseline_type: "schedule" }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.baseline"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const patchWbs = (node: EventWbsNode, patch: Partial<EventWbsNode>) => {
    saveWbs.mutate({
      id: node.id,
      eventId: id,
      parent_id: node.parent_id,
      title: patch.title ?? node.title,
      description: node.description,
      owner_staff_id: patch.owner_staff_id === undefined ? node.owner_staff_id : patch.owner_staff_id,
      budget_amount: patch.budget_amount ?? node.budget_amount,
      actual_cost: patch.actual_cost ?? node.actual_cost,
      start_date: patch.start_date === undefined ? node.start_date : patch.start_date,
      due_date: patch.due_date === undefined ? node.due_date : patch.due_date,
      percent_complete: patch.percent_complete ?? node.percent_complete,
      documents: patch.documents ?? node.documents,
    });
  };

  const taskById = (taskId: string) => tasks.find((row) => row.id === taskId);

  const openTask = (task: EventTaskRow | null) => {
    setActiveTask(task);
    setDialogOpen(true);
  };

  const filterBar = (
    <div className="grid gap-2 md:grid-cols-6">
      <Select value={filters.workstream} onValueChange={(v) => setFilters((s) => ({ ...s, workstream: v }))}>
        <SelectTrigger><SelectValue placeholder={t("events.plan.workstream")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("events.filters.all")}</SelectItem>
          {wbs.filter((n) => !n.parent_id).map((n) => (
            <SelectItem key={n.id} value={n.code ?? n.id}>{n.title}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.lifecycle} onValueChange={(v) => setFilters((s) => ({ ...s, lifecycle: v }))}>
        <SelectTrigger><SelectValue placeholder={t("events.plan.lifecycle")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("events.filters.all")}</SelectItem>
          {LIFECYCLE_PHASES.map((p) => (
            <SelectItem key={p.code} value={p.code}>{t(`events.phase.${p.code}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.owner} onValueChange={(v) => setFilters((s) => ({ ...s, owner: v }))}>
        <SelectTrigger><SelectValue placeholder={t("events.plan.owner")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("events.filters.all")}</SelectItem>
          {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.department} onValueChange={(v) => setFilters((s) => ({ ...s, department: v }))}>
        <SelectTrigger><SelectValue placeholder={t("events.fields.department")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("events.filters.all")}</SelectItem>
          {STANDARD_WORKSTREAMS.map((ws) => (
            <SelectItem key={`ws:${ws.code}`} value={`ws:${ws.code}`}>{ws.title_en}</SelectItem>
          ))}
          {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.priority} onValueChange={(v) => setFilters((s) => ({ ...s, priority: v }))}>
        <SelectTrigger><SelectValue placeholder={t("events.plan.priority")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("events.filters.all")}</SelectItem>
          {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{t(`events.priority.${p}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.status} onValueChange={(v) => setFilters((s) => ({ ...s, status: v }))}>
        <SelectTrigger><SelectValue placeholder={t("events.plan.status")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("events.filters.all")}</SelectItem>
          {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`events.taskStatus.${s}`)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        kicker={eventQ.data?.event.event_number ?? undefined}
        title={t("events.plan.title")}
        subtitle={t("events.plan.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <Button size="sm" variant="outline" onClick={() => baseline.mutate()} disabled={baseline.isPending}>
                {t("events.plan.saveBaseline")}
              </Button>
            ) : null}
            <EventWorkspaceNav eventId={id} />
          </div>
        }
      />

      <EventSourceBanner />

      <EventScheduleKpis event={overview?.event} tasks={tasks} />

      <EventScheduleHints eventId={id} overview={overview} tasks={tasks} canEdit={canEdit} />

      <div className="flex flex-wrap items-center gap-2">
        {attention.overdue > 0 ? (
          <Badge variant="destructive">{t("events.plan.overdueN", { n: attention.overdue })}</Badge>
        ) : null}
        {attention.blocked > 0 ? (
          <Badge variant="warning">{t("events.plan.blockedN", { n: attention.blocked })}</Badge>
        ) : null}
        {attention.missingOwner > 0 ? (
          <Badge variant="warning">{t("events.plan.missingOwnerN", { n: attention.missingOwner })}</Badge>
        ) : null}
        {attention.pendingPrs > 0 ? (
          <Link href={`/procurement/requisitions?eventId=${id}`}>
            <Badge variant="warning">
              {t("events.plan.procGate")} · {t("events.plan.procPendingN", { n: attention.pendingPrs })}
            </Badge>
          </Link>
        ) : null}
        {overview ? (
          <Link href={`/events/${id}/scope#documents`}>
            <Badge variant={attention.missingBoq || !attention.boqUploaded ? "destructive" : "success"}>
              {t("events.plan.boqChip")} ·{" "}
              {attention.missingBoq
                ? t("events.plan.boqMissingN", { n: attention.missingBoqN })
                : attention.boqUploaded
                  ? t("events.docStatus.uploaded")
                  : t("events.docStatus.missing")}
            </Badge>
          </Link>
        ) : null}
        {latestBaseline ? (
          <Badge variant="outline">{t("events.plan.baselineSaved", { date: latestBaseline.created_at.slice(0, 10) })}</Badge>
        ) : (
          <Badge variant="muted">{t("events.plan.noBaseline")}</Badge>
        )}
      </div>

      {(plan.data?.violations.length ?? 0) > 0 ? (
        <div className="rounded-xl border border-rag-amber/40 bg-rag-amber/10 p-3 text-sm">
          <p className="font-semibold">{t("events.plan.depWarnings")}</p>
          <ul className="mt-1 list-disc ps-4 text-xs">
            {plan.data?.violations.map((v, i) => (
              <li key={`${v.predecessor_id}-${v.successor_id}-${i}`}>
                {v.dep_type}: {taskById(v.predecessor_id)?.title ?? v.predecessor_id} → {taskById(v.successor_id)?.title ?? v.successor_id}
                {" — "}
                {t("events.plan.depNeeded", { date: v.needed_date })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("events.plan.filters")}</h2>
          {canEdit ? (
            <Button size="sm" onClick={() => openTask(null)}>
              {t("events.plan.addTask")}
            </Button>
          ) : null}
        </div>
        {filterBar}
      </section>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("events.plan.tabOverview")}</TabsTrigger>
          <TabsTrigger value="tasks">{t("events.plan.tabTasks")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <EventGantt
            tasks={filteredTasks}
            milestones={milestones}
            dependencies={plan.data?.dependencies ?? []}
            wbs={wbs}
            baseline={latestBaseline}
            onTaskSelect={canEdit ? openTask : undefined}
          />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <EventScheduleRegister
            tasks={filteredTasks}
            allTasks={tasks}
            canEdit={canEdit}
            onEdit={openTask}
            onDelete={(taskId) => removeTask.mutate(taskId)}
          />

          <CollapsibleSection title={t("events.plan.wbs")} defaultOpen={false}>
            <EventWbsTree
              nodes={wbs}
              staff={staff}
              canEdit={canEdit}
              busy={saveWbs.isPending || moveNode.isPending || removeNode.isPending}
              onCreate={({ parent_id, title }) => saveWbs.mutate({ eventId: id, parent_id, title })}
              onRename={(nodeId, title) => {
                const node = wbs.find((n) => n.id === nodeId);
                if (node) patchWbs(node, { title });
              }}
              onMove={(nodeId, direction) => moveNode.mutate({ id: nodeId, direction })}
              onDelete={(nodeId) => removeNode.mutate(nodeId)}
              onSaveDetails={patchWbs}
            />
          </CollapsibleSection>

          {latestBaseline ? (
            <CollapsibleSection title={t("events.plan.varianceTitle")} defaultOpen={false}>
              <section className="rounded-2xl border border-border/40 bg-card p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("events.plan.task")}</TableHead>
                      <TableHead>{t("events.plan.baselineStart")}</TableHead>
                      <TableHead>{t("events.plan.current")}</TableHead>
                      <TableHead>{t("events.plan.baselineDue")}</TableHead>
                      <TableHead>{t("events.plan.due")}</TableHead>
                      <TableHead>{t("events.plan.variance")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.filter((row) => row.baseline_start || row.baseline_due).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.task_number} {row.title}</TableCell>
                        <TableCell className="tabular-nums">{row.baseline_start ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{row.start_date ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{row.baseline_due ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{row.due_date ?? "—"}</TableCell>
                        <TableCell className={(row.variance.dueDays ?? 0) > 0 ? "text-rag-amber" : ""}>
                          {row.variance.dueDays == null ? "—" : t("events.plan.daysDelta", { n: row.variance.dueDays })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            </CollapsibleSection>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border/40 bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("events.plan.dependencies")}</h2>
              <ul className="mb-3 space-y-1 text-sm">
                {(plan.data?.dependencies ?? []).map((row) => {
                  const pred = taskById(row.predecessor_id);
                  const succ = taskById(row.successor_id);
                  const violated = plan.data?.violations.some(
                    (v) => v.predecessor_id === row.predecessor_id && v.successor_id === row.successor_id && v.dep_type === row.dep_type,
                  );
                  return (
                    <li key={row.id} className="flex items-center justify-between gap-2">
                      <span>
                        {pred?.task_number ?? pred?.title} → {succ?.task_number ?? succ?.title} ({row.dep_type}
                        {row.lag_days ? ` +${row.lag_days}d` : ""})
                        {violated ? <Badge variant="outline" className="ms-2 text-rag-amber">{t("events.plan.violation")}</Badge> : null}
                      </span>
                      {canEdit ? (
                        <Button size="sm" variant="ghost" onClick={() => deleteDependency({ id: row.id }).then(invalidate)}>
                          {t("common.delete")}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Select value={dep.predecessor_id} onValueChange={(v) => setDep((s) => ({ ...s, predecessor_id: v }))}>
                    <SelectTrigger className="w-44"><SelectValue placeholder={t("events.plan.predecessor")} /></SelectTrigger>
                    <SelectContent>
                      {tasks.map((row) => (
                        <SelectItem key={row.id} value={row.id}>{row.task_number ?? row.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={dep.successor_id} onValueChange={(v) => setDep((s) => ({ ...s, successor_id: v }))}>
                    <SelectTrigger className="w-44"><SelectValue placeholder={t("events.plan.successor")} /></SelectTrigger>
                    <SelectContent>
                      {tasks.map((row) => (
                        <SelectItem key={row.id} value={row.id}>{row.task_number ?? row.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={dep.dep_type} onValueChange={(v) => setDep((s) => ({ ...s, dep_type: v }))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEP_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="w-20" type="number" value={dep.lag_days} onChange={(e) => setDep((s) => ({ ...s, lag_days: e.target.value }))} title={t("events.plan.lag")} />
                  <Button size="sm" disabled={!dep.predecessor_id || !dep.successor_id} onClick={() => addDep.mutate()}>
                    {t("events.plan.addDep")}
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border/40 bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("events.plan.milestones")}</h2>
              <ul className="mb-3 space-y-2 text-sm">
                {milestones.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {row.title} · {row.due_date} · {t(`events.milestone.${row.status}`)}
                        {row.is_critical ? <Badge variant="outline" className="ms-1">{t("events.plan.criticalFlag")}</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.owner_name ?? "—"}
                        {row.wbs_title ? ` · ${row.wbs_title}` : ""}
                        {row.task_title ? ` · ${row.task_title}` : ""}
                        {row.variance_days != null ? ` · ${t("events.plan.daysDelta", { n: row.variance_days })}` : ""}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setMile({
                              id: row.id,
                              title: row.title,
                              due_date: row.due_date,
                              status: row.status,
                              owner_staff_id: row.owner_staff_id ?? "",
                              wbs_id: row.wbs_id ?? "",
                              task_id: row.task_id ?? "",
                              is_critical: row.is_critical,
                            })
                          }
                        >
                          {t("events.plan.editTask")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeMile.mutate(row.id)}>
                          {t("common.delete")}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Input className="w-44" value={mile.title} onChange={(e) => setMile((s) => ({ ...s, title: e.target.value }))} placeholder={t("events.plan.milestone")} />
                  <Input type="date" className="w-36" value={mile.due_date} onChange={(e) => setMile((s) => ({ ...s, due_date: e.target.value }))} />
                  <Select value={mile.status} onValueChange={(v) => setMile((s) => ({ ...s, status: v }))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MILESTONE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`events.milestone.${s}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={mile.owner_staff_id || "none"} onValueChange={(v) => setMile((s) => ({ ...s, owner_staff_id: v === "none" ? "" : v }))}>
                    <SelectTrigger className="w-40"><SelectValue placeholder={t("events.plan.owner")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={mile.wbs_id || "none"} onValueChange={(v) => setMile((s) => ({ ...s, wbs_id: v === "none" ? "" : v }))}>
                    <SelectTrigger className="w-40"><SelectValue placeholder={t("events.plan.wbs")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {wbs.map((n) => <SelectItem key={n.id} value={n.id}>{n.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={mile.task_id || "none"} onValueChange={(v) => setMile((s) => ({ ...s, task_id: v === "none" ? "" : v }))}>
                    <SelectTrigger className="w-40"><SelectValue placeholder={t("events.plan.task")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {tasks.map((row) => <SelectItem key={row.id} value={row.id}>{row.task_number ?? row.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!mile.title || !mile.due_date} onClick={() => saveMile.mutate()}>
                    {mile.id ? t("common.save") : t("events.plan.addMilestone")}
                  </Button>
                </div>
              ) : null}
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <EventTaskDialog
        open={dialogOpen}
        task={activeTask}
        wbs={wbs}
        tasks={tasks}
        staff={staff}
        departments={departments}
        pending={saveTask.isPending}
        onOpenChange={setDialogOpen}
        onSave={(draft) => saveTask.mutate(draft)}
        onComment={activeTask ? (body) => commentTask.mutate(body) : undefined}
      />
    </div>
  );
}
