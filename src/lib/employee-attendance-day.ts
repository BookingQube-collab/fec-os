import { applyRosterDayStatusOverride } from "@/lib/attendance-display";

/** Statuses that never count toward worked / required / under-hours totals. */
export const HOURS_EXCLUDED_ATTENDANCE_STATUSES = new Set([
  "weekly_off",
  "week_off",
  "comp_off",
]);

/** Roster / leave statuses that clear missed-punch and beat stale Absent in UI. */
const SCHEDULED_OFF_OR_LEAVE = new Set([
  "weekly_off",
  "week_off",
  "comp_off",
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
  "public_holiday",
]);

export function normalizeAttendanceStatusKey(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isHoursExcludedAttendanceStatus(status: string | null | undefined): boolean {
  return HOURS_EXCLUDED_ATTENDANCE_STATUSES.has(normalizeAttendanceStatusKey(status));
}

export function isScheduledOffOrLeaveStatus(status: string | null | undefined): boolean {
  return SCHEDULED_OFF_OR_LEAVE.has(normalizeAttendanceStatusKey(status));
}

/**
 * My attendance UI: roster week-off / leave wins over daily_summary Absent / missed_punch.
 * Clears missedPunch so the calendar never shows MP/red for a week-off day.
 */
export function resolveEmployeeDayAttendanceDisplay(input: {
  status: string;
  missedPunch?: boolean | null;
  isWeekOff?: boolean | null;
  leaveType?: string | null;
}): { status: string; missedPunch: boolean } {
  const status = applyRosterDayStatusOverride({
    status: input.status,
    isWeekOff: input.isWeekOff,
    leaveType: input.leaveType,
  });
  if (isScheduledOffOrLeaveStatus(status)) {
    return { status, missedPunch: false };
  }
  return { status, missedPunch: Boolean(input.missedPunch) };
}

export function isExcludedFromEmployeeHoursTotals(input: {
  status?: string | null;
  isWeekOff?: boolean | null;
  leaveType?: string | null;
}): boolean {
  if (input.isWeekOff) return true;
  if (isHoursExcludedAttendanceStatus(input.status)) return true;
  if (isHoursExcludedAttendanceStatus(input.leaveType)) return true;
  // Roster leave types that are not hours-excluded (annual/sick) still block required hours
  // only when status was overridden — callers pass the resolved display status for that.
  return false;
}

/** Prefer complete punches, then week-off/leave, over punchless Absent siblings (multi-site). */
export function preferMyAttendanceSummaryRow(
  a: {
    status: string;
    missedPunch: boolean;
    actualIn: string | null;
    actualOut: string | null;
    workedMinutes: number;
  },
  b: {
    status: string;
    missedPunch: boolean;
    actualIn: string | null;
    actualOut: string | null;
    workedMinutes: number;
  },
): boolean {
  const complete = (row: typeof a) => Boolean(row.actualIn && row.actualOut);
  if (complete(a) !== complete(b)) return complete(a);

  const aOff = isScheduledOffOrLeaveStatus(a.status);
  const bOff = isScheduledOffOrLeaveStatus(b.status);
  if (aOff !== bOff) return aOff;

  const rank = (row: typeof a) =>
    (row.actualIn ? 4 : 0) +
    (row.actualOut ? 4 : 0) +
    (row.workedMinutes > 0 ? 2 : 0) +
    (row.status && normalizeAttendanceStatusKey(row.status) !== "absent" ? 1 : 0);
  // Do not boost missedPunch — that preferred broken Absent rows over weekly_off.
  return rank(a) >= rank(b);
}

/** When multiple roster sites exist for one date, week-off (then leave) wins. */
export function preferMyRosterDayRow(
  a: { isWeekOff: boolean; leaveType?: string | null },
  b: { isWeekOff: boolean; leaveType?: string | null },
): boolean {
  if (a.isWeekOff !== b.isWeekOff) return a.isWeekOff;
  const aLeave = Boolean(a.leaveType);
  const bLeave = Boolean(b.leaveType);
  if (aLeave !== bLeave) return aLeave;
  return true;
}

export type EmployeePeriodHoursRow = {
  workDate: string;
  status: string;
  actualIn: string | null;
  actualOut: string | null;
  workedMinutes?: number;
  scheduledIn?: string | null;
  scheduledOut?: string | null;
  earlyLeaveMinutes?: number;
};

export type EmployeePeriodHoursRosterHint = {
  workDate: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff?: boolean;
  leaveType?: string | null;
};

function minutesFromIsoPair(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 60_000);
}

function minutesFromHmPair(
  workDate: string,
  startHm: string | null | undefined,
  endHm: string | null | undefined,
): number | null {
  if (!startHm || !endHm || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
  const start = new Date(`${workDate}T${startHm}:00+03:00`);
  let end = new Date(`${workDate}T${endHm}:00+03:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

function dateInInclusiveRange(date: string, dateFrom: string, dateTo: string): boolean {
  const d = date.slice(0, 10);
  return d >= dateFrom.slice(0, 10) && d <= dateTo.slice(0, 10);
}

function resolveExpectedMinutes(
  row: EmployeePeriodHoursRow | null | undefined,
  roster: EmployeePeriodHoursRosterHint | null | undefined,
): number | null {
  const display = resolveEmployeeDayAttendanceDisplay({
    status: row?.status ?? "",
    isWeekOff: roster?.isWeekOff,
    leaveType: roster?.leaveType,
  });
  if (
    isExcludedFromEmployeeHoursTotals({
      status: display.status,
      isWeekOff: roster?.isWeekOff,
      leaveType: roster?.leaveType,
    })
  ) {
    return null;
  }
  if (row) {
    const fromSchedule = minutesFromIsoPair(row.scheduledIn, row.scheduledOut);
    if (fromSchedule != null && fromSchedule > 0) return fromSchedule;
  }
  const workDate = row?.workDate ?? roster?.workDate;
  if (!workDate) return null;
  const fromRoster = minutesFromHmPair(workDate, roster?.shiftStart, roster?.shiftEnd);
  if (fromRoster != null && fromRoster > 0) return fromRoster;
  return null;
}

function resolveWorkedHours(
  row: EmployeePeriodHoursRow,
  todayYmd: string,
  roster?: EmployeePeriodHoursRosterHint | null,
): number | null {
  const display = resolveEmployeeDayAttendanceDisplay({
    status: row.status,
    isWeekOff: roster?.isWeekOff,
    leaveType: roster?.leaveType,
  });
  if (
    isExcludedFromEmployeeHoursTotals({
      status: display.status,
      isWeekOff: roster?.isWeekOff,
      leaveType: roster?.leaveType,
    })
  ) {
    return null;
  }
  if (row.actualIn && row.actualOut) {
    const ms = new Date(row.actualOut).getTime() - new Date(row.actualIn).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return Math.round((ms / 3_600_000) * 100) / 100;
  }
  if (row.actualIn && !row.actualOut && row.workDate === todayYmd) {
    const ms = Date.now() - new Date(row.actualIn).getTime();
    if (Number.isFinite(ms) && ms >= 0) {
      return Math.round((ms / 3_600_000) * 100) / 100;
    }
  }
  const worked = Number(row.workedMinutes ?? 0);
  if (worked > 0) return Math.round((worked / 60) * 100) / 100;
  return null;
}

/** Period worked / required / shortfall — weekly off and compensatory off excluded. */
export function sumEmployeePeriodHours(
  byDate: Map<string, EmployeePeriodHoursRow>,
  rosterByDate: Map<string, EmployeePeriodHoursRosterHint>,
  dateFrom: string,
  dateTo: string,
  todayYmd: string,
): { workedHours: number; requiredHours: number; shortfallHours: number } {
  const dates = new Set<string>();
  for (const d of byDate.keys()) {
    if (dateInInclusiveRange(d, dateFrom, dateTo)) dates.add(d);
  }
  for (const d of rosterByDate.keys()) {
    if (dateInInclusiveRange(d, dateFrom, dateTo)) dates.add(d);
  }

  let workedMinutes = 0;
  let requiredMinutes = 0;

  for (const date of dates) {
    const row = byDate.get(date) ?? null;
    const roster = rosterByDate.get(date);
    const display = resolveEmployeeDayAttendanceDisplay({
      status: row?.status ?? "",
      isWeekOff: roster?.isWeekOff,
      leaveType: roster?.leaveType,
    });
    if (
      isExcludedFromEmployeeHoursTotals({
        status: display.status,
        isWeekOff: roster?.isWeekOff,
        leaveType: roster?.leaveType,
      })
    ) {
      continue;
    }

    const expected = resolveExpectedMinutes(row ?? undefined, roster);
    if (expected != null && expected > 0) requiredMinutes += expected;

    if (row) {
      const hours = resolveWorkedHours(row, todayYmd, roster);
      if (hours != null && hours > 0) workedMinutes += Math.round(hours * 60);
    }
  }

  const workedHours = Math.round((workedMinutes / 60) * 100) / 100;
  const requiredHours = Math.round((requiredMinutes / 60) * 100) / 100;
  const shortfallHours =
    requiredHours > workedHours ? Math.round((requiredHours - workedHours) * 100) / 100 : 0;

  return { workedHours, requiredHours, shortfallHours };
}
