import { CLOSED_TASK_STATUSES } from "@/lib/events/constants";
import { sanitizeEventFileName } from "@/lib/events/documents";

export const TASK_RECURRENCE_FREQS = ["daily", "weekly", "monthly"] as const;
export type TaskRecurrenceFreq = (typeof TASK_RECURRENCE_FREQS)[number];

export const TASK_HISTORY_CHANGE_TYPES = [
  "created",
  "status",
  "assignee",
  "percent",
  "priority",
  "dates",
  "watchers",
  "attachment",
  "bulk",
  "recurrence",
  "other",
] as const;
export type TaskHistoryChangeType = (typeof TASK_HISTORY_CHANGE_TYPES)[number];

export type TaskReminderKind = "due_soon" | "overdue";

export type PlanTaskFilters = {
  department: string;
  owner: string;
  phase: string;
  workstream: string;
  lifecycle: string;
  priority: string;
  status: string;
};

export const DEFAULT_PLAN_FILTERS: PlanTaskFilters = {
  department: "all",
  owner: "all",
  phase: "all",
  workstream: "all",
  lifecycle: "all",
  priority: "all",
  status: "all",
};

/** Storage path: `{event_id}/tasks/{task_id}/{attachment_id}/{stamp}-{safeName}`. */
export function eventTaskAttachmentObjectPath(
  eventId: string,
  taskId: string,
  attachmentId: string,
  fileName: string,
  stamp = Date.now(),
): string {
  const safe = sanitizeEventFileName(fileName);
  return `${eventId}/tasks/${taskId}/${attachmentId}/${stamp}-${safe}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nextRecurrenceDueDate(
  dueDate: string | null | undefined,
  freq: TaskRecurrenceFreq | null | undefined,
  interval = 1,
): string | null {
  if (!dueDate || !freq) return null;
  const step = Math.max(1, interval || 1);
  if (freq === "daily") return addDaysYmd(dueDate, step);
  if (freq === "weekly") return addDaysYmd(dueDate, 7 * step);
  // monthly — calendar months via UTC day-of-month clamp
  const d = new Date(`${dueDate}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + step);
  // Clamp overflow (Jan 31 + 1m → Mar 3 in JS); pin to last day of target month
  if (d.getUTCDate() !== day) {
    d.setUTCDate(0);
  }
  return d.toISOString().slice(0, 10);
}

export function shouldSpawnRecurrence(opts: {
  status: string;
  prevStatus?: string | null;
  recurrenceFreq?: string | null;
  recurrenceUntil?: string | null;
  nextDue: string | null;
  occurrenceIndex?: number | null;
  recurrenceCount?: number | null;
}): boolean {
  if (opts.status !== "completed") return false;
  if (opts.prevStatus === "completed") return false;
  if (!opts.recurrenceFreq || !TASK_RECURRENCE_FREQS.includes(opts.recurrenceFreq as TaskRecurrenceFreq)) {
    return false;
  }
  if (!opts.nextDue) return false;
  if (opts.recurrenceUntil && opts.nextDue > opts.recurrenceUntil) return false;
  if (
    opts.recurrenceCount != null &&
    opts.occurrenceIndex != null &&
    opts.occurrenceIndex >= opts.recurrenceCount
  ) {
    return false;
  }
  return true;
}

export type HistoryDiffInput = {
  status?: string;
  assignee_staff_id?: string | null;
  percent_complete?: number;
  priority?: string;
  start_date?: string | null;
  due_date?: string | null;
};

export type HistoryDiffEntry = {
  change_type: TaskHistoryChangeType;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
};

export function buildTaskHistoryDiffs(
  before: HistoryDiffInput | null | undefined,
  after: HistoryDiffInput,
): HistoryDiffEntry[] {
  if (!before) {
    return [
      {
        change_type: "created",
        field_name: "status",
        old_value: null,
        new_value: after.status ?? "not_started",
      },
    ];
  }
  const out: HistoryDiffEntry[] = [];
  const push = (
    change_type: TaskHistoryChangeType,
    field_name: string,
    oldV: unknown,
    newV: unknown,
  ) => {
    const old_value = oldV == null || oldV === "" ? null : String(oldV);
    const new_value = newV == null || newV === "" ? null : String(newV);
    if (old_value === new_value) return;
    out.push({ change_type, field_name, old_value, new_value });
  };
  if (after.status !== undefined) push("status", "status", before.status, after.status);
  if (after.assignee_staff_id !== undefined) {
    push("assignee", "assignee_staff_id", before.assignee_staff_id, after.assignee_staff_id);
  }
  if (after.percent_complete !== undefined) {
    push("percent", "percent_complete", before.percent_complete, after.percent_complete);
  }
  if (after.priority !== undefined) push("priority", "priority", before.priority, after.priority);
  if (after.start_date !== undefined) push("dates", "start_date", before.start_date, after.start_date);
  if (after.due_date !== undefined) push("dates", "due_date", before.due_date, after.due_date);
  return out;
}

export function classifyTaskReminder(opts: {
  status: string;
  dueDate: string | null | undefined;
  today: string;
  reminderDaysBefore?: number | null;
}): TaskReminderKind | null {
  if (!opts.dueDate) return null;
  if (CLOSED_TASK_STATUSES.has(opts.status)) return null;
  if (opts.dueDate < opts.today) return "overdue";
  const days = opts.reminderDaysBefore ?? 3;
  const soon = addDaysYmd(opts.today, Math.max(0, days));
  if (opts.dueDate <= soon) return "due_soon";
  return null;
}

export function normalizeAssigneeIds(
  primary: string | null | undefined,
  additional: string[] | null | undefined,
): { primary: string | null; all: string[] } {
  const extras = [...new Set((additional ?? []).filter(Boolean))];
  const primaryId = primary || extras[0] || null;
  const all = primaryId
    ? [primaryId, ...extras.filter((id) => id !== primaryId)]
    : extras;
  return { primary: primaryId, all: [...new Set(all)] };
}

export function matchesPlanFilters(
  task: {
    department_id?: string | null;
    workstream_code?: string | null;
    owner_staff_id?: string | null;
    assignee_staff_id?: string | null;
    assignee_ids?: string[];
    phase_id?: string | null;
    wbs_id?: string | null;
    lifecycle_phase?: string | null;
    priority?: string;
    status?: string;
  },
  filters: PlanTaskFilters,
): boolean {
  if (filters.department !== "all") {
    if (filters.department.startsWith("ws:")) {
      if (task.workstream_code !== filters.department.slice(3)) return false;
    } else if (task.department_id !== filters.department) return false;
  }
  if (filters.owner !== "all") {
    const ids = new Set([
      task.owner_staff_id,
      task.assignee_staff_id,
      ...(task.assignee_ids ?? []),
    ]);
    if (!ids.has(filters.owner)) return false;
  }
  if (filters.phase !== "all" && task.phase_id !== filters.phase && task.wbs_id !== filters.phase) {
    return false;
  }
  if (
    filters.workstream !== "all" &&
    task.workstream_code !== filters.workstream &&
    task.phase_id !== filters.workstream &&
    task.wbs_id !== filters.workstream
  ) {
    return false;
  }
  if (filters.lifecycle !== "all" && task.lifecycle_phase !== filters.lifecycle) return false;
  if (filters.priority !== "all" && task.priority !== filters.priority) return false;
  if (filters.status !== "all" && task.status !== filters.status) return false;
  return true;
}

export function parseSavedFilters(raw: unknown): PlanTaskFilters {
  const base = { ...DEFAULT_PLAN_FILTERS };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as Array<keyof PlanTaskFilters>) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) base[key] = v;
  }
  return base;
}
