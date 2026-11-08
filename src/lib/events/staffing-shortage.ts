/** Basic event staffing shortage: scheduled headcount vs active crew covering a day. */

export type ShortageAssignmentLike = {
  staff_id: string;
  date_from: string;
  date_to: string;
  status?: string | null;
};

export type ShortageSlotLike = {
  work_date: string;
  staff_id: string;
};

export type DayStaffingAlert = {
  workDate: string;
  scheduledCount: number;
  coveringCrewCount: number;
  /** True when scheduled crew is below covering assignments or below minScheduled. */
  short: boolean;
  deficit: number;
};

export function activeCrewCoveringDay(
  assignments: ShortageAssignmentLike[],
  workDate: string,
): number {
  const day = workDate.slice(0, 10);
  const ids = new Set<string>();
  for (const a of assignments) {
    if (String(a.status ?? "active").toLowerCase() === "closed") continue;
    const from = String(a.date_from).slice(0, 10);
    const to = String(a.date_to).slice(0, 10);
    if (from <= day && day <= to) ids.add(a.staff_id);
  }
  return ids.size;
}

export function scheduledCountForDay(slots: ShortageSlotLike[], workDate: string): number {
  const day = workDate.slice(0, 10);
  const ids = new Set<string>();
  for (const s of slots) {
    if (String(s.work_date).slice(0, 10) === day) ids.add(s.staff_id);
  }
  return ids.size;
}

/**
 * Days where schedule is short vs covering crew, or scheduled &lt; minScheduled.
 * Default minScheduled = 1 when any covering crew exists.
 */
export function findStaffingShortageDays(input: {
  assignments: ShortageAssignmentLike[];
  slots: ShortageSlotLike[];
  /** Absolute floor for scheduled headcount when crew covers the day. */
  minScheduled?: number;
}): DayStaffingAlert[] {
  const minScheduled = Math.max(0, input.minScheduled ?? 1);
  const dates = new Set<string>();
  for (const a of input.assignments) {
    if (String(a.status ?? "active").toLowerCase() === "closed") continue;
    const from = String(a.date_from).slice(0, 10);
    const to = String(a.date_to).slice(0, 10);
    if (!from || !to || to < from) continue;
    const start = new Date(`${from}T12:00:00.000Z`);
    const end = new Date(`${to}T12:00:00.000Z`);
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      dates.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  for (const s of input.slots) dates.add(String(s.work_date).slice(0, 10));

  const alerts: DayStaffingAlert[] = [];
  for (const workDate of [...dates].sort()) {
    const coveringCrewCount = activeCrewCoveringDay(input.assignments, workDate);
    const scheduledCount = scheduledCountForDay(input.slots, workDate);
    if (coveringCrewCount <= 0 && scheduledCount <= 0) continue;
    const vsCrew = coveringCrewCount > 0 ? Math.max(0, coveringCrewCount - scheduledCount) : 0;
    const vsFloor =
      coveringCrewCount > 0 && scheduledCount < minScheduled ? minScheduled - scheduledCount : 0;
    const deficit = Math.max(vsCrew, vsFloor);
    const short = deficit > 0;
    if (!short) continue;
    alerts.push({ workDate, scheduledCount, coveringCrewCount, short, deficit });
  }
  return alerts;
}
