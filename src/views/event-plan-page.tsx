"use client";

import { FecPageHeader } from "@/components/fec";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, LayoutGrid, ListChecks, MessagesSquare, Users } from "lucide-react";
import { toast } from "sonner";

import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { EventKanbanBoard } from "@/components/events/event-kanban-board";
import { EventCollaborationPanel } from "@/components/events/event-collaboration-panel";
import { EventResourcesPanel } from "@/components/events/event-resources-panel";
import { EventScheduleHints } from "@/components/events/event-schedule-hints";
import { EventScheduleKpis } from "@/components/events/event-schedule-kpis";
import { EventPlanTemplatesPanel } from "@/components/events/event-phase1-panels";
import { EventScheduleRegister } from "@/components/events/event-schedule-register";
import { EventSourceBanner } from "@/components/events/event-source-banner";
import { EventTaskDialog, type TaskDraft } from "@/components/events/event-task-dialog";
import { EventWbsTree } from "@/components/events/event-wbs-tree";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { retryImport } from "@/lib/retry-import";
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
  applyEventSchedulePatch,
  bulkUpdateEventTasks,
  deleteDependency,
  deleteEventSavedFilter,
  deleteEventSprint,
  deleteEventTask,
  deleteMilestone,
  deleteWbsNode,
  listEventSavedFilters,
  moveEventTaskStatus,
  moveWbsNode,
  saveEventBaseline,
  upsertDependency,
  upsertEventSavedFilter,
  upsertEventSprint,
  upsertEventTask,
  upsertMilestone,
  upsertWbsNode,
} from "@/lib/events.functions";
import { CLOSED_TASK_STATUSES, DEP_TYPES, MILESTONE_STATUSES, PENDING_PR_STATUSES, TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from "@/lib/events/constants";
import { missingDepartmentBoqs, missingRequiredByType, resolveDocumentStatus } from "@/lib/events/documents";
import { LIFECYCLE_PHASES } from "@/lib/events/lifecycle";
import { DEFAULT_PLAN_FILTERS, parseSavedFilters, type PlanTaskFilters } from "@/lib/events/phase2-tasks";
import {
  computeCriticalPath,
  forwardSchedule,
  backwardSchedule,
  type ScheduledTaskDates,
} from "@/lib/events/schedule-engine";
import type { EventSavedFilterRow, EventTaskRow, EventWbsNode } from "@/lib/events/types";
import { scheduleVariance } from "@/lib/events/wbs";
import { STANDARD_WORKSTREAMS } from "@/lib/events/workstreams";
import { queryKeys } from "@/lib/query-keys";

const EventGantt = dynamic(
  () => retryImport(() => import("@/components/events/event-gantt").then((m) => m.EventGantt)),
  { ssr: false, loading: () => <Skeleton className="h-72 rounded-2xl" /> },
);

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
  const search = useSearchParams();
  const id = params.id;
  const qc = useQueryClient();
  const canEdit = usePermission("events.edit");
  const canManage = usePermission("events.manage");
  const eventQ = useEvent(id);
  const plan = useEventPlan(id);
  const options = useEventOptions();
  const planTab = (() => {
    const tab = search.get("tab");
    return tab === "tasks" || tab === "board" || tab === "resources" || tab === "collab" || tab === "overview"
      ? tab
      : "overview";
  })();
  const [filters, setFilters] = useState<PlanTaskFilters>({ ...DEFAULT_PLAN_FILTERS });
  const [savedFilters, setSavedFilters] = useState<EventSavedFilterRow[]>([]);
  const [filterName, setFilterName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({
    status: "",
    priority: "",
    assignee_staff_id: "",
    start_date: "",
    due_date: "",
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
  const [seedParentTaskId, setSeedParentTaskId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string>("latest");
  const [schedulePreview, setSchedulePreview] = useState<{
    direction: "forward" | "backward";
    tasks: ScheduledTaskDates[];
    writeCritical: boolean;
  } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.events.plan(id) });
    qc.invalidateQueries({ queryKey: queryKeys.events.detail(id) });
    qc.invalidateQueries({ queryKey: queryKeys.events.myTasks() });
  };

  const staff = options.data?.staff ?? [];
  const departments = options.data?.departments ?? [];
  const wbs = plan.data?.wbs ?? [];
  const tasks = useMemo(() => plan.data?.tasks ?? [], [plan.data?.tasks]);
  const sprints = useMemo(() => plan.data?.sprints ?? [], [plan.data?.sprints]);
  const milestones = plan.data?.milestones ?? [];
  const scheduleBaselines = useMemo(
    () =>
      (plan.data?.baselines ?? []).filter(
        (b) => b.baseline_type === "schedule" || b.baseline_type === "both",
      ),
    [plan.data?.baselines],
  );
  const latestBaseline = plan.data?.latestScheduleBaseline ?? scheduleBaselines[0] ?? null;
  const selectedBaseline = useMemo(() => {
    if (baselineId === "latest") return latestBaseline;
    return scheduleBaselines.find((b) => b.id === baselineId) ?? latestBaseline;
  }, [baselineId, latestBaseline, scheduleBaselines]);
  const overview = eventQ.data;
  const today = todayYmd();

  const cpm = useMemo(() => {
    return computeCriticalPath(
      tasks.map((task) => ({
        id: task.id,
        start_date: task.start_date,
        due_date: task.due_date,
        duration_days: task.duration_days,
        is_critical: task.is_critical,
        is_milestone: task.is_milestone,
      })),
      (plan.data?.dependencies ?? []).map((dep) => ({
        predecessor_id: dep.predecessor_id,
        successor_id: dep.successor_id,
        dep_type: dep.dep_type,
        lag_days: dep.lag_days,
      })),
    );
  }, [plan.data?.dependencies, tasks]);

  const tasksWithBaseline = useMemo(() => {
    if (!selectedBaseline || selectedBaseline === latestBaseline) return tasks;
    const snap = new Map((selectedBaseline.snapshot.tasks ?? []).map((t) => [t.id, t]));
    return tasks.map((task) => {
      const base = snap.get(task.id);
      if (!base) {
        return {
          ...task,
          baseline_start: null,
          baseline_due: null,
          baseline_percent: null,
          variance: { startDays: null, dueDays: null, progressDelta: null },
        };
      }
      return {
        ...task,
        baseline_start: base.start_date ?? null,
        baseline_due: base.due_date ?? null,
        baseline_percent: base.percent_complete ?? null,
        variance: scheduleVariance(
          task.start_date,
          task.due_date,
          task.percent_complete,
          base.start_date,
          base.due_date,
          base.percent_complete,
        ),
      };
    });
  }, [latestBaseline, selectedBaseline, tasks]);

  const milestonesWithBaseline = useMemo(() => {
    if (!selectedBaseline || selectedBaseline === latestBaseline) return milestones;
    const snap = new Map((selectedBaseline.snapshot.milestones ?? []).map((m) => [m.id, m]));
    return milestones.map((mile) => {
      const base = snap.get(mile.id);
      if (!base) return { ...mile, baseline_due: null, variance_days: null };
      const variance_days =
        base.due_date && mile.due_date
          ? Math.round(
              (new Date(`${mile.due_date}T00:00:00`).getTime() -
                new Date(`${base.due_date}T00:00:00`).getTime()) /
                86_400_000,
            )
          : null;
      return { ...mile, baseline_due: base.due_date ?? null, variance_days };
    });
  }, [latestBaseline, milestones, selectedBaseline]);

  const filteredTasks = useMemo(() => {
    return tasksWithBaseline.filter((task) => {
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
  }, [tasksWithBaseline, filters]);

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

  useEffect(() => {
    let cancelled = false;
    void listEventSavedFilters({ eventId: id })
      .then((rows) => {
        if (!cancelled) setSavedFilters(rows);
      })
      .catch(() => {
        if (!cancelled) setSavedFilters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
        assignee_ids: draft.assignee_ids,
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
        recurrence_freq: (draft.recurrence_freq || null) as EventTaskRow["recurrence_freq"],
        recurrence_interval: numOrNull(draft.recurrence_interval) ?? 1,
        recurrence_until: draft.recurrence_until || null,
        reminder_days_before: numOrNull(draft.reminder_days_before) ?? 3,
        story_points: numOrNull(draft.story_points),
        sprint_id: draft.sprint_id || null,
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setActiveTask(null);
      invalidate();
      toast.success(t("events.toasts.taskSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const moveStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      moveEventTaskStatus({ eventId: id, taskId, status }),
    onSuccess: () => {
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const assignSprint = useMutation({
    mutationFn: ({ taskIds, sprintId }: { taskIds: string[]; sprintId: string | null }) =>
      bulkUpdateEventTasks({ eventId: id, taskIds, sprint_id: sprintId }),
    onSuccess: (_res, vars) => {
      invalidate();
      toast.success(t("events.plan.sprintAssigned", { n: vars.taskIds.length }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveSprint = useMutation({
    mutationFn: (draft: {
      id?: string;
      name: string;
      goal: string;
      start_date: string;
      end_date: string;
      status: "planned" | "active" | "completed" | "cancelled";
    }) =>
      upsertEventSprint({
        id: draft.id,
        eventId: id,
        name: draft.name,
        goal: draft.goal || null,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        status: draft.status,
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.plan.sprintSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeSprint = useMutation({
    mutationFn: (sprintId: string) => deleteEventSprint({ id: sprintId }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.plan.sprintDeleted"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkUpdate = useMutation({
    mutationFn: () =>
      bulkUpdateEventTasks({
        eventId: id,
        taskIds: [...selectedIds],
        status: bulk.status ? (bulk.status as EventTaskRow["status"]) : undefined,
        priority: bulk.priority ? (bulk.priority as EventTaskRow["priority"]) : undefined,
        assignee_staff_id: bulk.assignee_staff_id || undefined,
        start_date: bulk.start_date || undefined,
        due_date: bulk.due_date || undefined,
      }),
    onSuccess: (res) => {
      setSelectedIds(new Set());
      setBulk({ status: "", priority: "", assignee_staff_id: "", start_date: "", due_date: "" });
      invalidate();
      toast.success(t("events.plan.bulkUpdated", { n: res.updated }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveFilter = useMutation({
    mutationFn: () =>
      upsertEventSavedFilter({
        eventId: id,
        name: filterName.trim(),
        filters: filters as unknown as Record<string, string>,
      }),
    onSuccess: async () => {
      setFilterName("");
      const rows = await listEventSavedFilters({ eventId: id });
      setSavedFilters(rows);
      toast.success(t("events.plan.filterSaved"));
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

  const applySchedule = useMutation({
    mutationFn: async () => {
      if (!schedulePreview) throw new Error("No schedule preview");
      const updates = schedulePreview.tasks
        .map((row) => {
          const current = tasks.find((t) => t.id === row.id);
          const criticalChanged =
            schedulePreview.writeCritical &&
            Boolean(current?.is_critical) !== Boolean(row.is_critical);
          if (!row.changed && !criticalChanged) return null;
          return {
            id: row.id,
            start_date: row.changed ? row.start_date : undefined,
            due_date: row.changed ? row.due_date : undefined,
            duration_days: row.changed ? row.duration_days : undefined,
            is_critical: criticalChanged ? row.is_critical : undefined,
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        start_date?: string | null;
        due_date?: string | null;
        duration_days?: number;
        is_critical?: boolean;
      }>;
      if (!updates.length) return { updated: 0 };
      return applyEventSchedulePatch({ eventId: id, updates });
    },
    onSuccess: (res) => {
      setSchedulePreview(null);
      invalidate();
      toast.success(t("events.plan.scheduleApplied", { n: res.updated }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openAutoSchedule = (direction: "forward" | "backward") => {
    const deps = (plan.data?.dependencies ?? []).map((dep) => ({
      predecessor_id: dep.predecessor_id,
      successor_id: dep.successor_id,
      dep_type: dep.dep_type,
      lag_days: dep.lag_days,
    }));
    const input = tasks.map((task) => ({
      id: task.id,
      start_date: task.start_date,
      due_date: task.due_date,
      duration_days: task.duration_days,
      is_critical: task.is_critical,
      is_milestone: task.is_milestone,
    }));
    const result = direction === "forward" ? forwardSchedule(input, deps) : backwardSchedule(input, deps);
    if (result.warnings.includes("dependency_cycle")) {
      toast.error(t("events.plan.scheduleCycle"));
    }
    if (result.warnings.includes("no_dated_tasks")) {
      toast.error(t("events.plan.scheduleNoDates"));
      return;
    }
    const changed = result.tasks.filter((row) => row.changed);
    if (!changed.length) {
      toast.message(t("events.plan.scheduleNoChanges"));
      return;
    }
    setSchedulePreview({ direction, tasks: result.tasks, writeCritical: true });
  };

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
    setSeedParentTaskId(null);
    setActiveTask(task);
    setDialogOpen(true);
  };

  const openChildTask = (parent: EventTaskRow) => {
    setActiveTask(null);
    setSeedParentTaskId(parent.id);
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
      <FecPageHeader
        kicker={eventQ.data?.event.event_number ?? undefined}
        title={t("events.plan.title")}
        subtitle={t("events.plan.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <Button size="sm" variant="outline" onClick={() => openAutoSchedule("forward")}>
                  {t("events.plan.autoScheduleForward")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openAutoSchedule("backward")}>
                  {t("events.plan.autoScheduleBackward")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => baseline.mutate()} disabled={baseline.isPending}>
                  {t("events.plan.saveBaseline")}
                </Button>
              </>
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
        {cpm.criticalIds.length > 0 ? (
          <Badge variant="outline" className="text-rag-red">
            {t("events.plan.criticalPathN", { n: cpm.criticalIds.length })}
          </Badge>
        ) : null}
        {cpm.hasCycle ? (
          <Badge variant="destructive">{t("events.plan.scheduleCycle")}</Badge>
        ) : null}
        {scheduleBaselines.length > 1 ? (
          <Select value={baselineId} onValueChange={setBaselineId}>
            <SelectTrigger className="h-7 w-48 text-xs">
              <SelectValue placeholder={t("events.plan.compareBaseline")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">{t("events.plan.baselineLatest")}</SelectItem>
              {scheduleBaselines.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.created_at.slice(0, 16).replace("T", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {(plan.data?.violations.length ?? 0) > 0 ? (
        <div className="rounded-xl border border-rag-amber/50 bg-rag-amber/10 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{t("events.plan.depWarnings")}</p>
            <Badge variant="outline" className="text-rag-amber">
              {t("events.plan.violationCount", { n: plan.data?.violations.length ?? 0 })}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("events.plan.depWarningsHint")}</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {plan.data?.violations.map((v, i) => {
              const pred = taskById(v.predecessor_id);
              const succ = taskById(v.successor_id);
              return (
                <li
                  key={`${v.predecessor_id}-${v.successor_id}-${i}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-rag-amber/30 bg-card/60 px-2 py-1.5"
                >
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {v.dep_type}
                  </Badge>
                  <button
                    type="button"
                    className="font-medium underline-offset-2 hover:underline"
                    onClick={() => pred && openTask(pred)}
                  >
                    {pred?.task_number ?? pred?.title ?? v.predecessor_id}
                  </button>
                  <span aria-hidden>→</span>
                  <button
                    type="button"
                    className="font-medium underline-offset-2 hover:underline"
                    onClick={() => succ && openTask(succ)}
                  >
                    {succ?.task_number ?? succ?.title ?? v.successor_id}
                  </button>
                  <span className="text-muted-foreground">
                    {t("events.plan.depNeeded", { date: v.needed_date })}
                  </span>
                  {canEdit ? (
                    <Button size="sm" variant="ghost" className="ms-auto h-6 text-[10px]" onClick={() => openAutoSchedule("forward")}>
                      {t("events.plan.fixWithSchedule")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value="__pick__"
            onValueChange={(v) => {
              const row = savedFilters.find((f) => f.id === v);
              if (row) setFilters(parseSavedFilters(row.filters));
            }}
          >
            <SelectTrigger className="w-48"><SelectValue placeholder={t("events.plan.savedFilters")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__pick__">{t("events.plan.savedFilters")}</SelectItem>
              {savedFilters.map((row) => (
                <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-40"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder={t("events.plan.filterName")}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!filterName.trim() || saveFilter.isPending}
            onClick={() => saveFilter.mutate()}
          >
            {t("events.plan.saveFilter")}
          </Button>
          {savedFilters[0] ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await deleteEventSavedFilter({ id: savedFilters[0].id });
                  setSavedFilters(await listEventSavedFilters({ eventId: id }));
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {t("events.plan.deleteFilter")}
            </Button>
          ) : null}
        </div>
      </section>

      <Tabs key={planTab} defaultValue={planTab}>
        <TabsList>
          <TabsTrigger value="overview"><LayoutDashboard aria-hidden />{t("events.plan.tabOverview")}</TabsTrigger>
          <TabsTrigger value="tasks"><ListChecks aria-hidden />{t("events.plan.tabTasks")}</TabsTrigger>
          <TabsTrigger value="board"><LayoutGrid aria-hidden />{t("events.plan.tabBoard")}</TabsTrigger>
          <TabsTrigger value="resources"><Users aria-hidden />{t("events.plan.tabResources")}</TabsTrigger>
          <TabsTrigger value="collab"><MessagesSquare aria-hidden />{t("events.plan.tabCollab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <EventGantt
            tasks={filteredTasks}
            milestones={milestonesWithBaseline}
            dependencies={plan.data?.dependencies ?? []}
            wbs={wbs}
            baseline={selectedBaseline}
            violations={plan.data?.violations ?? []}
            criticalIds={cpm.criticalIds}
            onTaskSelect={canEdit ? openTask : undefined}
          />
        </TabsContent>

        <TabsContent value="board" className="space-y-4">
          <EventKanbanBoard
            eventId={id}
            tasks={filteredTasks}
            sprints={sprints}
            staff={staff}
            canEdit={canEdit}
            busy={moveStatus.isPending || assignSprint.isPending || saveSprint.isPending || removeSprint.isPending}
            onOpenTask={openTask}
            onStatusChange={(taskId, status) => moveStatus.mutate({ taskId, status })}
            onAssignSprint={(taskIds, sprintId) => assignSprint.mutate({ taskIds, sprintId })}
            onSaveSprint={(draft) => saveSprint.mutate(draft)}
            onDeleteSprint={(sprintId) => removeSprint.mutate(sprintId)}
          />
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <EventResourcesPanel
            eventId={id}
            locationId={eventQ.data?.event.location_id}
            tasks={tasks}
            staff={staff}
            canEdit={canEdit}
          />
        </TabsContent>

        <TabsContent value="collab" className="space-y-4">
          <EventCollaborationPanel
            eventId={id}
            staff={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
            canEdit={canEdit}
          />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          {canEdit && selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/40 bg-card p-3">
              <p className="w-full text-xs text-muted-foreground">
                {t("events.plan.bulkSelected", { n: selectedIds.size })}
              </p>
              <Select value={bulk.status || "none"} onValueChange={(v) => setBulk((s) => ({ ...s, status: v === "none" ? "" : v }))}>
                <SelectTrigger className="w-36"><SelectValue placeholder={t("events.plan.status")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`events.taskStatus.${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bulk.priority || "none"} onValueChange={(v) => setBulk((s) => ({ ...s, priority: v === "none" ? "" : v }))}>
                <SelectTrigger className="w-36"><SelectValue placeholder={t("events.plan.priority")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{t(`events.priority.${p}`)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bulk.assignee_staff_id || "none"} onValueChange={(v) => setBulk((s) => ({ ...s, assignee_staff_id: v === "none" ? "" : v }))}>
                <SelectTrigger className="w-40"><SelectValue placeholder={t("events.plan.assignee")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" className="w-36" value={bulk.start_date} onChange={(e) => setBulk((s) => ({ ...s, start_date: e.target.value }))} />
              <Input type="date" className="w-36" value={bulk.due_date} onChange={(e) => setBulk((s) => ({ ...s, due_date: e.target.value }))} />
              <Button size="sm" disabled={bulkUpdate.isPending} onClick={() => bulkUpdate.mutate()}>
                {t("events.plan.applyBulk")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                {t("common.clear")}
              </Button>
            </div>
          ) : null}
          <EventScheduleRegister
            tasks={filteredTasks}
            allTasks={tasks}
            canEdit={canEdit}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            onEdit={openTask}
            onDelete={(taskId) => removeTask.mutate(taskId)}
            onAddChild={openChildTask}
          />

          <EventPlanTemplatesPanel
            eventId={id}
            canManage={canManage}
            canEdit={canEdit}
            onChanged={invalidate}
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

          {selectedBaseline ? (
            <CollapsibleSection title={t("events.plan.varianceTitle")} defaultOpen={false}>
              <section className="rounded-2xl border border-border/40 bg-card p-4">
                {scheduleBaselines.length > 1 ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground">{t("events.plan.compareBaseline")}</p>
                    <Select value={baselineId} onValueChange={setBaselineId}>
                      <SelectTrigger className="h-8 w-52 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="latest">{t("events.plan.baselineLatest")}</SelectItem>
                        {scheduleBaselines.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.created_at.slice(0, 16).replace("T", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
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
                    {tasksWithBaseline.filter((row) => row.baseline_start || row.baseline_due).map((row) => (
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
        sprints={sprints}
        pending={saveTask.isPending}
        seedParentTaskId={seedParentTaskId}
        eventId={id}
        canEdit={canEdit}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSeedParentTaskId(null);
        }}
        onSave={(draft) => saveTask.mutate(draft)}
        onComment={activeTask ? (body) => commentTask.mutate(body) : undefined}
      />

      <AlertDialog open={Boolean(schedulePreview)} onOpenChange={(open) => !open && setSchedulePreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {schedulePreview?.direction === "backward"
                ? t("events.plan.autoScheduleBackward")
                : t("events.plan.autoScheduleForward")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("events.plan.scheduleConfirm", {
                n: schedulePreview?.tasks.filter((row) => row.changed).length ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {schedulePreview ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {schedulePreview.tasks
                .filter((row) => row.changed)
                .slice(0, 40)
                .map((row) => {
                  const task = taskById(row.id);
                  return (
                    <li key={row.id} className="flex justify-between gap-2 tabular-nums">
                      <span className="truncate">{task?.task_number ?? task?.title ?? row.id}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {row.start_date ?? "—"} → {row.due_date ?? "—"}
                      </span>
                    </li>
                  );
                })}
            </ul>
          ) : null}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={schedulePreview?.writeCritical ?? true}
              onChange={(e) =>
                setSchedulePreview((prev) => (prev ? { ...prev, writeCritical: e.target.checked } : prev))
              }
            />
            {t("events.plan.writeCriticalFlags")}
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={applySchedule.isPending}
              onClick={(e) => {
                e.preventDefault();
                applySchedule.mutate();
              }}
            >
              {t("events.plan.applySchedule")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
