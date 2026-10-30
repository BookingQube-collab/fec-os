import { CLOSED_TASK_STATUSES, TASK_STATUSES, type SprintStatus, type TaskStatus } from "@/lib/events/constants";

/** Columns for the Kanban board — same statuses as event_tasks. */
export const KANBAN_STATUSES = TASK_STATUSES;

export type AgileTaskLike = {
  id: string;
  status: TaskStatus | string;
  sprint_id?: string | null;
  story_points?: number | null;
  completed_at?: string | null;
  assignee_staff_id?: string | null;
  workstream_code?: string | null;
};

export type AgileSprintLike = {
  id: string;
  status: SprintStatus | string;
  start_date?: string | null;
  end_date?: string | null;
};

export type BurndownPoint = {
  date: string;
  remaining: number;
  ideal: number;
  completed: number;
};

export type VelocityPoint = {
  sprintId: string;
  sprintName: string;
  committed: number;
  completed: number;
};

/** Group tasks into Kanban columns by status. */
export function groupTasksByStatus<T extends AgileTaskLike>(
  tasks: T[],
): Record<TaskStatus, T[]> {
  const columns = Object.fromEntries(KANBAN_STATUSES.map((s) => [s, [] as T[]])) as Record<
    TaskStatus,
    T[]
  >;
  for (const task of tasks) {
    const status = (KANBAN_STATUSES as readonly string[]).includes(task.status)
      ? (task.status as TaskStatus)
      : "not_started";
    columns[status].push(task);
  }
  return columns;
}

/** Active sprint preference: first status=active, else null. */
export function pickActiveSprint<T extends AgileSprintLike>(sprints: T[]): T | null {
  return sprints.find((s) => s.status === "active") ?? null;
}

/**
 * Backlog = tasks not assigned to any sprint.
 * When `sprintId` is provided, returns tasks outside that sprint (planning pool).
 * Fallback (no sprints at all): treat not_started open tasks as backlog grouping.
 */
export function backlogTasks<T extends AgileTaskLike>(
  tasks: T[],
  opts?: { sprintId?: string | null; hasSprints?: boolean },
): T[] {
  const hasSprints = opts?.hasSprints ?? true;
  const sprintId = opts?.sprintId;

  if (sprintId) {
    return tasks.filter((t) => t.sprint_id !== sprintId && !CLOSED_TASK_STATUSES.has(t.status as TaskStatus));
  }

  if (!hasSprints) {
    return tasks.filter((t) => t.status === "not_started");
  }

  return tasks.filter((t) => !t.sprint_id && !CLOSED_TASK_STATUSES.has(t.status as TaskStatus));
}

/** Filter board to a sprint (Scrum board = Kanban + this filter). */
export function tasksForSprintBoard<T extends AgileTaskLike>(
  tasks: T[],
  sprintId: string | null | undefined,
): T[] {
  if (!sprintId || sprintId === "all") return tasks;
  if (sprintId === "backlog") return tasks.filter((t) => !t.sprint_id);
  return tasks.filter((t) => t.sprint_id === sprintId);
}

export function sumStoryPoints(tasks: AgileTaskLike[]): number {
  return tasks.reduce((sum, t) => sum + (Number(t.story_points) || 0), 0);
}

function ymdAddDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysInclusive(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Simple burndown from sprint window + task points / completed_at.
 * Remaining = committed − cumulative completed points (by completed_at date).
 * Ideal line always spans start→end; remaining stops at today (or end).
 */
export function buildBurndownSeries(
  tasks: AgileTaskLike[],
  sprint: { start_date: string | null; end_date: string | null },
  today?: string,
): BurndownPoint[] {
  const start = sprint.start_date;
  const end = sprint.end_date;
  if (!start || !end || end < start) return [];

  const committed = sumStoryPoints(tasks);
  const span = daysInclusive(start, end);
  const todayYmd = today ?? new Date().toISOString().slice(0, 10);
  const remainingUntil = todayYmd < end ? todayYmd : end;

  const completedByDay = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== "completed") continue;
    const doneOn = (task.completed_at ?? "").slice(0, 10);
    if (!doneOn) continue;
    const pts = Number(task.story_points) || 0;
    completedByDay.set(doneOn, (completedByDay.get(doneOn) ?? 0) + pts);
  }

  const points: BurndownPoint[] = [];
  let cumulative = 0;
  for (let i = 0; i <= span; i++) {
    const date = ymdAddDays(start, i);
    cumulative += completedByDay.get(date) ?? 0;
    const ideal = span === 0 ? 0 : committed * (1 - i / span);
    const remaining =
      date <= remainingUntil ? Math.max(0, committed - cumulative) : Math.max(0, committed - cumulative);
    points.push({
      date,
      remaining,
      ideal: Math.max(0, ideal),
      completed: cumulative,
    });
  }

  return points;
}

/** Velocity = completed points per completed/active sprint (simple). */
export function computeVelocity(
  sprints: Array<AgileSprintLike & { id: string; name: string }>,
  tasks: AgileTaskLike[],
): VelocityPoint[] {
  return sprints
    .filter((s) => s.status === "completed" || s.status === "active")
    .map((sprint) => {
      const inSprint = tasks.filter((t) => t.sprint_id === sprint.id);
      const committed = sumStoryPoints(inSprint);
      const completed = sumStoryPoints(
        inSprint.filter((t) => t.status === "completed"),
      );
      return {
        sprintId: sprint.id,
        sprintName: sprint.name,
        committed,
        completed,
      };
    });
}

export function averageVelocity(points: VelocityPoint[]): number {
  const done = points.filter((p) => p.completed > 0 || p.committed > 0);
  if (!done.length) return 0;
  return Math.round((done.reduce((s, p) => s + p.completed, 0) / done.length) * 10) / 10;
}
