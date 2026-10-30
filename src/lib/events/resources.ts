/** Event PM Phase 5 — capacity / conflict / workload math (pure). */

export const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;

export type AllocationLike = {
  id: string;
  staff_id: string;
  event_id?: string | null;
  task_id?: string | null;
  start_date: string;
  end_date: string;
  allocated_hours?: number | null;
  allocation_pct?: number | null;
};

export type CapacityLike = {
  staff_id: string;
  weekly_hours: number;
};

export type TimesheetLike = {
  id: string;
  staff_id: string;
  task_id?: string | null;
  work_date: string;
  hours: number;
  status: string;
};

export type TaskHoursLike = {
  id: string;
  assignee_staff_id?: string | null;
  owner_staff_id?: string | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  title?: string | null;
};

export type ResourceConflict = {
  staff_id: string;
  weekStart: string;
  weekEnd: string;
  allocatedHours: number;
  capacityHours: number;
  overBy: number;
  allocationIds: string[];
};

export type StaffWorkloadRow = {
  staff_id: string;
  allocatedHours: number;
  capacityHours: number;
  utilizationPct: number;
  overAllocated: boolean;
  taskEstimatedHours: number;
  taskActualHours: number;
  timesheetHours: number;
  approvedTimesheetHours: number;
};

export type EstVsActualRow = {
  staff_id: string | null;
  estimatedHours: number;
  actualHours: number;
  timesheetApprovedHours: number;
  varianceHours: number;
};

function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

export function ymdAddDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday (UTC) of the week containing ymd. */
export function weekStartMonday(ymd: string): string {
  const d = parseYmd(ymd);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  return ymdAddDays(ymd, delta);
}

export function weekEndSunday(weekStart: string): string {
  return ymdAddDays(weekStart, 6);
}

export function daysInclusive(start: string, end: string): number {
  if (end < start) return 0;
  const a = parseYmd(start).getTime();
  const b = parseYmd(end).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function overlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  if (!rangesOverlap(aStart, aEnd, bStart, bEnd)) return 0;
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return daysInclusive(start, end);
}

/**
 * Resolve total hours for an allocation over its full range.
 * Prefer explicit allocated_hours; else pct × weekly capacity × (days/7).
 */
export function resolveAllocationTotalHours(
  alloc: AllocationLike,
  weeklyCapacity: number = DEFAULT_WEEKLY_CAPACITY_HOURS,
): number {
  if (alloc.allocated_hours != null && Number.isFinite(Number(alloc.allocated_hours))) {
    return Math.max(0, Number(alloc.allocated_hours));
  }
  const pct = Number(alloc.allocation_pct);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const days = daysInclusive(alloc.start_date, alloc.end_date);
  const weeks = days / 7;
  return Math.round(((pct / 100) * weeklyCapacity * weeks) * 100) / 100;
}

/** Hours from an allocation that fall inside [rangeStart, rangeEnd] (pro-rata by days). */
export function allocationHoursInRange(
  alloc: AllocationLike,
  rangeStart: string,
  rangeEnd: string,
  weeklyCapacity: number = DEFAULT_WEEKLY_CAPACITY_HOURS,
): number {
  const totalDays = daysInclusive(alloc.start_date, alloc.end_date);
  if (totalDays <= 0) return 0;
  const overlap = overlapDays(alloc.start_date, alloc.end_date, rangeStart, rangeEnd);
  if (overlap <= 0) return 0;
  const total = resolveAllocationTotalHours(alloc, weeklyCapacity);
  return Math.round((total * (overlap / totalDays)) * 100) / 100;
}

export function capacityForStaff(
  staffId: string,
  capacities: CapacityLike[],
  fallback = DEFAULT_WEEKLY_CAPACITY_HOURS,
): number {
  const row = capacities.find((c) => c.staff_id === staffId);
  const hours = row ? Number(row.weekly_hours) : fallback;
  return Number.isFinite(hours) && hours > 0 ? hours : fallback;
}

/** Detect weeks where a staff member's allocated hours exceed weekly capacity. */
export function detectCapacityConflicts(
  allocations: AllocationLike[],
  capacities: CapacityLike[],
  opts?: { from?: string | null; to?: string | null; thresholdPct?: number },
): ResourceConflict[] {
  if (!allocations.length) return [];
  const threshold = (opts?.thresholdPct ?? 100) / 100;

  let minDate = opts?.from ?? allocations[0]!.start_date;
  let maxDate = opts?.to ?? allocations[0]!.end_date;
  for (const a of allocations) {
    if (a.start_date < minDate) minDate = a.start_date;
    if (a.end_date > maxDate) maxDate = a.end_date;
  }
  if (opts?.from && opts.from > minDate) minDate = opts.from;
  if (opts?.to && opts.to < maxDate) maxDate = opts.to;

  const staffIds = [...new Set(allocations.map((a) => a.staff_id))];
  const conflicts: ResourceConflict[] = [];

  for (const staffId of staffIds) {
    const weekly = capacityForStaff(staffId, capacities);
    const mine = allocations.filter((a) => a.staff_id === staffId);
    let cursor = weekStartMonday(minDate);
    const last = weekStartMonday(maxDate);
    while (cursor <= last) {
      const end = weekEndSunday(cursor);
      const ids: string[] = [];
      let hours = 0;
      for (const a of mine) {
        const h = allocationHoursInRange(a, cursor, end, weekly);
        if (h > 0) {
          hours += h;
          ids.push(a.id);
        }
      }
      hours = Math.round(hours * 100) / 100;
      const limit = weekly * threshold;
      if (hours > limit + 0.001) {
        conflicts.push({
          staff_id: staffId,
          weekStart: cursor,
          weekEnd: end,
          allocatedHours: hours,
          capacityHours: weekly,
          overBy: Math.round((hours - weekly) * 100) / 100,
          allocationIds: ids,
        });
      }
      cursor = ymdAddDays(cursor, 7);
    }
  }

  return conflicts;
}

/** Overlapping date-range pairs for the same staff (informational). */
export function detectOverlappingAllocations(allocations: AllocationLike[]): Array<{
  staff_id: string;
  aId: string;
  bId: string;
  start: string;
  end: string;
}> {
  const byStaff = new Map<string, AllocationLike[]>();
  for (const a of allocations) {
    const list = byStaff.get(a.staff_id) ?? [];
    list.push(a);
    byStaff.set(a.staff_id, list);
  }
  const out: Array<{ staff_id: string; aId: string; bId: string; start: string; end: string }> = [];
  for (const [staffId, list] of byStaff) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (!rangesOverlap(a.start_date, a.end_date, b.start_date, b.end_date)) continue;
        const start = a.start_date > b.start_date ? a.start_date : b.start_date;
        const end = a.end_date < b.end_date ? a.end_date : b.end_date;
        out.push({ staff_id: staffId, aId: a.id, bId: b.id, start, end });
      }
    }
  }
  return out;
}

export function buildStaffWorkload(
  staffIds: string[],
  allocations: AllocationLike[],
  capacities: CapacityLike[],
  tasks: TaskHoursLike[],
  timesheets: TimesheetLike[],
  range?: { from: string; to: string },
): StaffWorkloadRow[] {
  return staffIds.map((staffId) => {
    const weekly = capacityForStaff(staffId, capacities);
    const mine = allocations.filter((a) => a.staff_id === staffId);
    let allocatedHours = 0;
    for (const a of mine) {
      allocatedHours += range
        ? allocationHoursInRange(a, range.from, range.to, weekly)
        : resolveAllocationTotalHours(a, weekly);
    }
    allocatedHours = Math.round(allocatedHours * 100) / 100;

    const weeksInRange = range
      ? Math.max(1, daysInclusive(range.from, range.to) / 7)
      : Math.max(
          1,
          mine.length
            ? daysInclusive(
                mine.reduce((m, a) => (a.start_date < m ? a.start_date : m), mine[0]!.start_date),
                mine.reduce((m, a) => (a.end_date > m ? a.end_date : m), mine[0]!.end_date),
              ) / 7
            : 1,
        );
    const capacityHours = Math.round(weekly * weeksInRange * 100) / 100;
    const utilizationPct =
      capacityHours > 0 ? Math.round((allocatedHours / capacityHours) * 1000) / 10 : 0;

    const staffTasks = tasks.filter(
      (t) => t.assignee_staff_id === staffId || t.owner_staff_id === staffId,
    );
    const taskEstimatedHours = Math.round(
      staffTasks.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0) * 100,
    ) / 100;
    const taskActualHours = Math.round(
      staffTasks.reduce((s, t) => s + (Number(t.actual_hours) || 0), 0) * 100,
    ) / 100;

    const myTs = timesheets.filter((t) => t.staff_id === staffId);
    const timesheetHours = Math.round(myTs.reduce((s, t) => s + (Number(t.hours) || 0), 0) * 100) / 100;
    const approvedTimesheetHours =
      Math.round(
        myTs
          .filter((t) => t.status === "approved")
          .reduce((s, t) => s + (Number(t.hours) || 0), 0) * 100,
      ) / 100;

    return {
      staff_id: staffId,
      allocatedHours,
      capacityHours,
      utilizationPct,
      overAllocated: allocatedHours > capacityHours + 0.001,
      taskEstimatedHours,
      taskActualHours,
      timesheetHours,
      approvedTimesheetHours,
    };
  });
}

/** Aggregate estimated vs actual (task hours + approved timesheets). */
export function estimatedVsActual(
  tasks: TaskHoursLike[],
  timesheets: TimesheetLike[],
): EstVsActualRow[] {
  const byStaff = new Map<string | null, EstVsActualRow>();
  const bump = (staffId: string | null) => {
    let row = byStaff.get(staffId);
    if (!row) {
      row = {
        staff_id: staffId,
        estimatedHours: 0,
        actualHours: 0,
        timesheetApprovedHours: 0,
        varianceHours: 0,
      };
      byStaff.set(staffId, row);
    }
    return row;
  };

  for (const t of tasks) {
    const staffId = t.assignee_staff_id ?? t.owner_staff_id ?? null;
    const row = bump(staffId);
    row.estimatedHours += Number(t.estimated_hours) || 0;
    row.actualHours += Number(t.actual_hours) || 0;
  }
  for (const ts of timesheets) {
    if (ts.status !== "approved") continue;
    const row = bump(ts.staff_id);
    row.timesheetApprovedHours += Number(ts.hours) || 0;
  }

  return [...byStaff.values()]
    .map((row) => ({
      ...row,
      estimatedHours: Math.round(row.estimatedHours * 100) / 100,
      actualHours: Math.round(row.actualHours * 100) / 100,
      timesheetApprovedHours: Math.round(row.timesheetApprovedHours * 100) / 100,
      varianceHours:
        Math.round((row.actualHours - row.estimatedHours) * 100) / 100,
    }))
    .sort((a, b) => (a.staff_id ?? "").localeCompare(b.staff_id ?? ""));
}

/** Calendar cells: allocations touching each day in a month. */
export function allocationsByDay(
  allocations: AllocationLike[],
  monthKey: string,
): Map<string, AllocationLike[]> {
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const map = new Map<string, AllocationLike[]>();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const hits = allocations.filter((a) => a.start_date <= date && a.end_date >= date);
    if (hits.length) map.set(date, hits);
  }
  return map;
}

/** Week grid helper: 7 dates from Monday. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ymdAddDays(weekStart, i));
}
