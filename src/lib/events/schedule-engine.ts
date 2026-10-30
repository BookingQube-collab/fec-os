import type { DepType } from "@/lib/events/constants";
import { dependencyViolations, type DependencyLike, type TaskDateLike } from "@/lib/events/health";

/** Calendar-day helpers (local date strings YYYY-MM-DD). */
export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenYmd(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export interface ScheduleTaskInput {
  id: string;
  start_date: string | null;
  due_date: string | null;
  duration_days?: number | null;
  is_critical?: boolean;
  is_milestone?: boolean;
}

export interface ScheduleDepInput {
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  lag_days: number;
}

export interface CpmNode {
  id: string;
  duration: number;
  /** Absolute early start (YYYY-MM-DD) when projectStart is set. */
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  /** Calendar-day float (LS - ES). */
  totalFloat: number | null;
  /** True when float is 0 (network-critical). */
  computedCritical: boolean;
  /** computedCritical OR manual is_critical flag. */
  isCritical: boolean;
}

export interface CpmResult {
  projectStart: string | null;
  projectEnd: string | null;
  nodes: Record<string, CpmNode>;
  criticalIds: string[];
  hasCycle: boolean;
  orderedIds: string[];
}

export interface ScheduledTaskDates {
  id: string;
  start_date: string | null;
  due_date: string | null;
  duration_days: number;
  changed: boolean;
  is_critical?: boolean;
}

export interface AutoScheduleResult {
  direction: "forward" | "backward";
  tasks: ScheduledTaskDates[];
  warnings: string[];
  remainingViolations: ReturnType<typeof dependencyViolations>;
}

function resolveDuration(task: ScheduleTaskInput): number {
  if (task.is_milestone) return 0;
  if (task.duration_days != null && task.duration_days >= 0) return task.duration_days;
  if (task.start_date && task.due_date) {
    return Math.max(0, daysBetweenYmd(task.start_date, task.due_date));
  }
  return 1;
}

function topoSort(ids: string[], deps: ScheduleDepInput[]): { order: string[]; hasCycle: boolean } {
  const idSet = new Set(ids);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, [] as string[]]));
  for (const dep of deps) {
    if (!idSet.has(dep.predecessor_id) || !idSet.has(dep.successor_id)) continue;
    adj.get(dep.predecessor_id)!.push(dep.successor_id);
    indeg.set(dep.successor_id, (indeg.get(dep.successor_id) ?? 0) + 1);
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const n = (indeg.get(next) ?? 1) - 1;
      indeg.set(next, n);
      if (n === 0) queue.push(next);
    }
  }
  return { order, hasCycle: order.length !== ids.length };
}

/**
 * Constraint date that the successor must satisfy for a dependency.
 * Returns the earliest allowed successor anchor (start for FS/SS, finish for FF/SF).
 */
export function earliestSuccessorConstraint(
  dep: ScheduleDepInput,
  predStart: string | null,
  predFinish: string | null,
): { kind: "start" | "finish"; date: string } | null {
  const lag = dep.lag_days || 0;
  if (dep.dep_type === "FS") {
    if (!predFinish) return null;
    return { kind: "start", date: addDaysYmd(predFinish, lag) };
  }
  if (dep.dep_type === "SS") {
    if (!predStart) return null;
    return { kind: "start", date: addDaysYmd(predStart, lag) };
  }
  if (dep.dep_type === "FF") {
    if (!predFinish) return null;
    return { kind: "finish", date: addDaysYmd(predFinish, lag) };
  }
  // SF
  if (!predStart) return null;
  return { kind: "finish", date: addDaysYmd(predStart, lag) };
}

function maxYmd(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function minYmd(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function finishFromStart(start: string, duration: number): string {
  return duration <= 0 ? start : addDaysYmd(start, duration);
}

function startFromFinish(finish: string, duration: number): string {
  return duration <= 0 ? finish : addDaysYmd(finish, -duration);
}

/**
 * Classic CPM on calendar dates using FS/SS/FF/SF + lag.
 * Manual `is_critical` is OR'd into the display flag; `computedCritical` is float === 0.
 */
export function computeCriticalPath(
  tasks: ScheduleTaskInput[],
  deps: ScheduleDepInput[],
): CpmResult {
  const ids = tasks.map((t) => t.id);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { order, hasCycle } = topoSort(ids, deps);

  const durations = new Map(ids.map((id) => [id, resolveDuration(byId.get(id)!)]));

  // Seed project start from earliest known start/due
  let projectStart: string | null = null;
  for (const t of tasks) {
    projectStart = minYmd(projectStart, t.start_date);
    projectStart = minYmd(projectStart, t.due_date);
  }
  if (!projectStart) {
    const empty: Record<string, CpmNode> = {};
    for (const id of ids) {
      empty[id] = {
        id,
        duration: durations.get(id) ?? 1,
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        totalFloat: null,
        computedCritical: false,
        isCritical: Boolean(byId.get(id)?.is_critical),
      };
    }
    return {
      projectStart: null,
      projectEnd: null,
      nodes: empty,
      criticalIds: Object.values(empty).filter((n) => n.isCritical).map((n) => n.id),
      hasCycle,
      orderedIds: order,
    };
  }

  const earlyStart = new Map<string, string | null>();
  const earlyFinish = new Map<string, string | null>();

  // Forward pass
  for (const id of order) {
    const dur = durations.get(id) ?? 1;
    const task = byId.get(id)!;
    let es: string | null = task.start_date ?? projectStart;
    const preds = deps.filter((d) => d.successor_id === id);
    for (const dep of preds) {
      const pEs = earlyStart.get(dep.predecessor_id) ?? null;
      const pEf = earlyFinish.get(dep.predecessor_id) ?? null;
      const constraint = earliestSuccessorConstraint(dep, pEs, pEf);
      if (!constraint) continue;
      if (constraint.kind === "start") {
        es = maxYmd(es, constraint.date);
      } else {
        // finish constraint → derive start
        const neededStart = startFromFinish(constraint.date, dur);
        es = maxYmd(es, neededStart);
      }
    }
    if (!es) es = projectStart;
    const ef = finishFromStart(es, dur);
    earlyStart.set(id, es);
    earlyFinish.set(id, ef);
  }

  let projectEnd: string | null = null;
  for (const id of order) {
    projectEnd = maxYmd(projectEnd, earlyFinish.get(id) ?? null);
  }
  // Prefer explicit due dates when later than computed EF
  for (const t of tasks) {
    projectEnd = maxYmd(projectEnd, t.due_date);
  }
  if (!projectEnd) projectEnd = projectStart;

  const lateFinish = new Map<string, string | null>();
  const lateStart = new Map<string, string | null>();

  // Backward pass (reverse topo)
  for (const id of [...order].reverse()) {
    const dur = durations.get(id) ?? 1;
    let lf: string | null = projectEnd;
    const succs = deps.filter((d) => d.predecessor_id === id);
    for (const dep of succs) {
      const sLs = lateStart.get(dep.successor_id) ?? null;
      const sLf = lateFinish.get(dep.successor_id) ?? null;
      if (!sLs && !sLf) continue;
      // Invert constraint: predecessor must finish/start so successor can meet LS/LF
      const lag = dep.lag_days || 0;
      if (dep.dep_type === "FS" && sLs) {
        // succ.start >= pred.finish + lag → pred.finish <= succ.start - lag
        lf = minYmd(lf, addDaysYmd(sLs, -lag));
      } else if (dep.dep_type === "SS" && sLs) {
        // succ.start >= pred.start + lag → pred.start <= succ.start - lag → pred.finish = start+dur
        const predStartMax = addDaysYmd(sLs, -lag);
        lf = minYmd(lf, finishFromStart(predStartMax, dur));
      } else if (dep.dep_type === "FF" && sLf) {
        // succ.finish >= pred.finish + lag → pred.finish <= succ.finish - lag
        lf = minYmd(lf, addDaysYmd(sLf, -lag));
      } else if (dep.dep_type === "SF" && sLf) {
        // succ.finish >= pred.start + lag → pred.start <= succ.finish - lag
        const predStartMax = addDaysYmd(sLf, -lag);
        lf = minYmd(lf, finishFromStart(predStartMax, dur));
      }
    }
    if (!lf) lf = projectEnd;
    const ls = startFromFinish(lf, dur);
    lateFinish.set(id, lf);
    lateStart.set(id, ls);
  }

  const nodes: Record<string, CpmNode> = {};
  const criticalIds: string[] = [];
  for (const id of ids) {
    const es = earlyStart.get(id) ?? null;
    const ef = earlyFinish.get(id) ?? null;
    const ls = lateStart.get(id) ?? null;
    const lf = lateFinish.get(id) ?? null;
    const float = es && ls ? daysBetweenYmd(es, ls) : null;
    const computedCritical = float != null && float <= 0;
    const isCritical = computedCritical || Boolean(byId.get(id)?.is_critical);
    nodes[id] = {
      id,
      duration: durations.get(id) ?? 1,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat: float,
      computedCritical,
      isCritical,
    };
    if (isCritical) criticalIds.push(id);
  }

  return { projectStart, projectEnd, nodes, criticalIds, hasCycle, orderedIds: order };
}

/**
 * Forward-schedule: push successors so dependency constraints hold, preserving duration.
 * Does not mutate inputs; returns proposed dates. Anchors roots to their current start (or projectStart).
 */
export function forwardSchedule(
  tasks: ScheduleTaskInput[],
  deps: ScheduleDepInput[],
  options?: { projectStart?: string | null },
): AutoScheduleResult {
  const warnings: string[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = tasks.map((t) => t.id);
  const { order, hasCycle } = topoSort(ids, deps);
  if (hasCycle) warnings.push("dependency_cycle");

  let projectStart = options?.projectStart ?? null;
  for (const t of tasks) {
    projectStart = minYmd(projectStart, t.start_date);
    projectStart = minYmd(projectStart, t.due_date);
  }
  if (!projectStart) {
    return {
      direction: "forward",
      tasks: tasks.map((t) => ({
        id: t.id,
        start_date: t.start_date,
        due_date: t.due_date,
        duration_days: resolveDuration(t),
        changed: false,
      })),
      warnings: [...warnings, "no_dated_tasks"],
      remainingViolations: [],
    };
  }

  const startMap = new Map<string, string | null>();
  const dueMap = new Map<string, string | null>();

  for (const id of order) {
    const task = byId.get(id)!;
    const dur = resolveDuration(task);
    let start = task.start_date ?? projectStart;
    const preds = deps.filter((d) => d.successor_id === id);
    for (const dep of preds) {
      const pStart = startMap.get(dep.predecessor_id) ?? byId.get(dep.predecessor_id)?.start_date ?? null;
      const pDue =
        dueMap.get(dep.predecessor_id) ??
        byId.get(dep.predecessor_id)?.due_date ??
        (pStart ? finishFromStart(pStart, resolveDuration(byId.get(dep.predecessor_id)!)) : null);
      const constraint = earliestSuccessorConstraint(dep, pStart, pDue);
      if (!constraint) continue;
      if (constraint.kind === "start") {
        if (!start || start < constraint.date) start = constraint.date;
      } else {
        const neededStart = startFromFinish(constraint.date, dur);
        if (!start || start < neededStart) start = neededStart;
      }
    }
    const due = finishFromStart(start, dur);
    startMap.set(id, start);
    dueMap.set(id, due);
  }

  const cpm = computeCriticalPath(
    tasks.map((t) => ({
      ...t,
      start_date: startMap.get(t.id) ?? t.start_date,
      due_date: dueMap.get(t.id) ?? t.due_date,
      duration_days: resolveDuration(t),
    })),
    deps,
  );

  const resultTasks: ScheduledTaskDates[] = tasks.map((t) => {
    const start = startMap.get(t.id) ?? t.start_date;
    const due = dueMap.get(t.id) ?? t.due_date;
    const changed = start !== t.start_date || due !== t.due_date;
    return {
      id: t.id,
      start_date: start,
      due_date: due,
      duration_days: resolveDuration(t),
      changed,
      is_critical: cpm.nodes[t.id]?.isCritical,
    };
  });

  const asDates: TaskDateLike[] = resultTasks.map((t) => ({
    id: t.id,
    start_date: t.start_date,
    due_date: t.due_date,
  }));
  const remaining = dependencyViolations(asDates, deps as DependencyLike[]);

  return { direction: "forward", tasks: resultTasks, warnings, remainingViolations: remaining };
}

/**
 * Backward-schedule: pull predecessors earlier so constraints hold against fixed leaf finishes.
 */
export function backwardSchedule(
  tasks: ScheduleTaskInput[],
  deps: ScheduleDepInput[],
  options?: { projectEnd?: string | null },
): AutoScheduleResult {
  const warnings: string[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = tasks.map((t) => t.id);
  const { order, hasCycle } = topoSort(ids, deps);
  if (hasCycle) warnings.push("dependency_cycle");

  let projectEnd = options?.projectEnd ?? null;
  for (const t of tasks) {
    projectEnd = maxYmd(projectEnd, t.due_date);
    projectEnd = maxYmd(projectEnd, t.start_date);
  }
  if (!projectEnd) {
    return {
      direction: "backward",
      tasks: tasks.map((t) => ({
        id: t.id,
        start_date: t.start_date,
        due_date: t.due_date,
        duration_days: resolveDuration(t),
        changed: false,
      })),
      warnings: [...warnings, "no_dated_tasks"],
      remainingViolations: [],
    };
  }

  const startMap = new Map<string, string | null>();
  const dueMap = new Map<string, string | null>();

  for (const id of [...order].reverse()) {
    const task = byId.get(id)!;
    const dur = resolveDuration(task);
    let due = task.due_date ?? projectEnd;
    const succs = deps.filter((d) => d.predecessor_id === id);
    for (const dep of succs) {
      const sStart = startMap.get(dep.successor_id) ?? byId.get(dep.successor_id)?.start_date ?? null;
      const sDue =
        dueMap.get(dep.successor_id) ??
        byId.get(dep.successor_id)?.due_date ??
        (sStart ? finishFromStart(sStart, resolveDuration(byId.get(dep.successor_id)!)) : null);
      const lag = dep.lag_days || 0;
      if (dep.dep_type === "FS" && sStart) {
        // pred.finish + lag <= succ.start → pred.finish <= succ.start - lag
        const maxFinish = addDaysYmd(sStart, -lag);
        if (!due || due > maxFinish) due = maxFinish;
      } else if (dep.dep_type === "SS" && sStart) {
        // pred.start + lag <= succ.start → pred.start <= succ.start - lag
        const maxStart = addDaysYmd(sStart, -lag);
        const maxFinish = finishFromStart(maxStart, dur);
        if (!due || due > maxFinish) due = maxFinish;
      } else if (dep.dep_type === "FF" && sDue) {
        const maxFinish = addDaysYmd(sDue, -lag);
        if (!due || due > maxFinish) due = maxFinish;
      } else if (dep.dep_type === "SF" && sDue) {
        const maxStart = addDaysYmd(sDue, -lag);
        const maxFinish = finishFromStart(maxStart, dur);
        if (!due || due > maxFinish) due = maxFinish;
      }
    }
    const start = startFromFinish(due, dur);
    startMap.set(id, start);
    dueMap.set(id, due);
  }

  const cpm = computeCriticalPath(
    tasks.map((t) => ({
      ...t,
      start_date: startMap.get(t.id) ?? t.start_date,
      due_date: dueMap.get(t.id) ?? t.due_date,
      duration_days: resolveDuration(t),
    })),
    deps,
  );

  const resultTasks: ScheduledTaskDates[] = tasks.map((t) => {
    const start = startMap.get(t.id) ?? t.start_date;
    const due = dueMap.get(t.id) ?? t.due_date;
    const changed = start !== t.start_date || due !== t.due_date;
    return {
      id: t.id,
      start_date: start,
      due_date: due,
      duration_days: resolveDuration(t),
      changed,
      is_critical: cpm.nodes[t.id]?.isCritical,
    };
  });

  const asDates: TaskDateLike[] = resultTasks.map((t) => ({
    id: t.id,
    start_date: t.start_date,
    due_date: t.due_date,
  }));
  const remaining = dependencyViolations(asDates, deps as DependencyLike[]);

  return { direction: "backward", tasks: resultTasks, warnings, remainingViolations: remaining };
}

/** Merge CPM critical flags with optional write-back candidates. */
export function criticalFlagUpdates(
  tasks: ScheduleTaskInput[],
  deps: ScheduleDepInput[],
  mode: "computed_only" | "merge_manual" = "merge_manual",
): Array<{ id: string; is_critical: boolean; changed: boolean }> {
  const cpm = computeCriticalPath(tasks, deps);
  return tasks.map((t) => {
    const node = cpm.nodes[t.id];
    const next =
      mode === "computed_only"
        ? Boolean(node?.computedCritical)
        : Boolean(node?.isCritical);
    return {
      id: t.id,
      is_critical: next,
      changed: Boolean(t.is_critical) !== next,
    };
  });
}
