import { weekBounds, type WorkPriority } from "@/lib/arcade/domain";

/**
 * Planning cards for technician work.
 * A card points at a fault, preventive schedule, or inspection.
 * It does not copy that record.
 */

export const TASK_KINDS = ["REPAIR", "PM", "INSPECTION", "ASSIGNMENT"] as const;
export const TASK_SPANS = ["DAY", "WEEK"] as const;
export const TASK_STATUSES = ["TODO", "STARTED", "PAUSED", "DONE"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export const TASK_VERIFICATIONS = ["NONE", "PENDING", "APPROVED", "RETURNED"] as const;
export const TASK_SOURCE_TYPES = ["fault", "pm_schedule", "observation"] as const;

export const TASK_EVIDENCE_MIN = 8;

export type TaskKind = (typeof TASK_KINDS)[number];
export type TaskSpan = (typeof TASK_SPANS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskVerification = (typeof TASK_VERIFICATIONS)[number];
export type TaskSourceType = (typeof TASK_SOURCE_TYPES)[number];

export type TaskRuleCode =
  | "blocked"
  | "cycle"
  | "missing"
  | "evidence"
  | "approved"
  | "own_task"
  | "not_done"
  | "not_supervisor";

export type BoardTask = {
  id: string;
  technicianStaffId: string | null;
  title: string;
  kind: TaskKind;
  span: TaskSpan;
  dueOn: string;
  priority: TaskPriority;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  status: TaskStatus;
  dependsOnId: string | null;
  sourceType: TaskSourceType | null;
  sourceId: string | null;
  evidence: string | null;
  verification: TaskVerification;
};

type DependencyNode = Pick<BoardTask, "id" | "status" | "dependsOnId">;

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function kindForSource(sourceType: string): TaskKind {
  if (sourceType === "fault") return "REPAIR";
  if (sourceType === "pm_schedule") return "PM";
  if (sourceType === "observation") return "INSPECTION";
  return "ASSIGNMENT";
}

export function boardPriorityFromWork(priority: WorkPriority): TaskPriority {
  if (priority === "critical_down") return "critical";
  if (priority === "revenue_impact" || priority === "waiting_parts" || priority === "pm_overdue") return "high";
  return "normal";
}

export function sourceHref(sourceType: string | null, sourceId: string | null, machineId?: string | null): string | null {
  if (sourceType === "fault" && sourceId) return `/arcade/faults/${sourceId}`;
  if (sourceType === "pm_schedule") return machineId ? `/arcade/pm?machineId=${machineId}` : "/arcade/pm";
  if (sourceType === "observation") return "/arcade/observation";
  return null;
}

/** Card fields copied from a source pointer. The source row itself is not duplicated. */
export function taskDraftFromSource(source: {
  sourceType: TaskSourceType;
  sourceId: string;
  title: string;
  dueOn: string;
  technicianStaffId: string | null;
  priority: TaskPriority;
}): Pick<
  BoardTask,
  "title" | "kind" | "span" | "dueOn" | "priority" | "technicianStaffId" | "dependsOnId" | "sourceType" | "sourceId"
> {
  return {
    title: source.title.trim().slice(0, 200),
    kind: kindForSource(source.sourceType),
    span: "DAY",
    dueOn: source.dueOn,
    priority: source.priority,
    technicianStaffId: source.technicianStaffId,
    dependsOnId: null,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
  };
}

export function sourceKey(sourceType: string, sourceId: string, dueOn: string): string {
  return `${sourceType}:${sourceId}:${dueOn}`;
}

export function dependencyIssue(
  taskId: string,
  dependsOnId: string | null,
  byId: ReadonlyMap<string, DependencyNode>,
  options?: { requireDone?: boolean },
): TaskRuleCode | null {
  if (!dependsOnId) return null;
  if (dependsOnId === taskId) return "cycle";
  const seen = new Set<string>([taskId]);
  let cursor: string | null = dependsOnId;
  let guard = 0;
  while (cursor) {
    if (seen.has(cursor)) return "cycle";
    const row = byId.get(cursor);
    if (!row) return "missing";
    if (options?.requireDone && cursor === dependsOnId && row.status !== "DONE") return "blocked";
    seen.add(cursor);
    cursor = row.dependsOnId;
    if (++guard > 30) return "cycle";
  }
  return null;
}

export function applyTaskStatus(
  task: BoardTask,
  next: TaskStatus,
  byId: ReadonlyMap<string, DependencyNode>,
  evidence: string | null,
): { ok: true; task: BoardTask } | { ok: false; code: TaskRuleCode } {
  if (task.verification === "APPROVED" && next !== task.status) {
    return { ok: false, code: "approved" };
  }
  if (next === "STARTED" || next === "DONE" || next === "PAUSED") {
    const issue = dependencyIssue(task.id, task.dependsOnId, byId, { requireDone: true });
    if (issue) return { ok: false, code: issue };
  }
  const evidenceText = (evidence ?? "").trim();
  if (next === "DONE" && evidenceText.length < TASK_EVIDENCE_MIN) {
    return { ok: false, code: "evidence" };
  }
  let verification = task.verification;
  if (next === "DONE" && verification !== "APPROVED") verification = "PENDING";
  if (next !== "DONE" && (verification === "PENDING" || verification === "RETURNED")) verification = "NONE";
  return {
    ok: true,
    task: {
      ...task,
      status: next,
      evidence: next === "DONE" ? evidenceText : task.evidence,
      verification,
    },
  };
}

export function applyTaskSignoff(
  task: BoardTask,
  decision: "APPROVED" | "RETURNED",
  actor: { staffId: string | null; canVerify: boolean },
): { ok: true; task: BoardTask } | { ok: false; code: TaskRuleCode } {
  if (!actor.canVerify) return { ok: false, code: "not_supervisor" };
  if (actor.staffId && task.technicianStaffId && actor.staffId === task.technicianStaffId) {
    return { ok: false, code: "own_task" };
  }
  if (task.status !== "DONE" || task.verification === "NONE") return { ok: false, code: "not_done" };
  if (decision === "APPROVED") {
    return { ok: true, task: { ...task, status: "DONE", verification: "APPROVED" } };
  }
  return { ok: true, task: { ...task, status: "STARTED", verification: "RETURNED" } };
}

export function tasksForViewer(tasks: readonly BoardTask[], staffId: string | null, scope: "mine" | "team"): BoardTask[] {
  if (scope === "team") return [...tasks];
  if (!staffId) return [];
  return tasks.filter((task) => task.technicianStaffId === staffId);
}

function byPriorityThenDue(a: BoardTask, b: BoardTask): number {
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rank !== 0) return rank;
  return a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title);
}

export function kanbanColumns(tasks: readonly BoardTask[]): Record<TaskStatus, BoardTask[]> {
  const columns = {
    TODO: [] as BoardTask[],
    STARTED: [] as BoardTask[],
    PAUSED: [] as BoardTask[],
    DONE: [] as BoardTask[],
  };
  for (const task of tasks) columns[task.status].push(task);
  for (const status of TASK_STATUSES) columns[status].sort(byPriorityThenDue);
  return columns;
}

export function calendarDays(tasks: readonly BoardTask[], days: readonly string[]): Record<string, BoardTask[]> {
  const placed: Record<string, BoardTask[]> = {};
  for (const day of days) placed[day] = [];
  for (const task of tasks) {
    const slots = task.span === "WEEK" ? weekBounds(task.dueOn).days : [task.dueOn];
    for (const day of slots) {
      if (placed[day]) placed[day].push(task);
    }
  }
  for (const day of days) placed[day]?.sort(byPriorityThenDue);
  return placed;
}

export type WorkloadRow = {
  staffId: string | null;
  open: number;
  done: number;
  pendingSignoff: number;
  estimatedMinutes: number;
  actualMinutes: number;
};

export function workloadSummary(tasks: readonly BoardTask[]): WorkloadRow[] {
  const rows = new Map<string, WorkloadRow>();
  for (const task of tasks) {
    const key = task.technicianStaffId ?? "";
    const row = rows.get(key) ?? {
      staffId: task.technicianStaffId,
      open: 0,
      done: 0,
      pendingSignoff: 0,
      estimatedMinutes: 0,
      actualMinutes: 0,
    };
    if (task.status === "DONE") {
      row.done += 1;
      row.actualMinutes += task.actualMinutes ?? 0;
      if (task.verification === "PENDING") row.pendingSignoff += 1;
    } else {
      row.open += 1;
      row.estimatedMinutes += task.estimatedMinutes ?? 0;
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.open - a.open || (a.staffId ?? "").localeCompare(b.staffId ?? ""));
}
