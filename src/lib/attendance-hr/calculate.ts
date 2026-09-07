import type { AttendanceRuleInput, AttendanceStatus, DailyCalcResult, ShiftTemplateInput } from "./constants";
import { DEFAULT_RULES, DEFAULT_SHIFT } from "./constants";
import { PERMANENT_SHIFT_MINUTES } from "./shift-policy";

export type CalcPunch = {
  id?: string;
  punchAt: string;
  probableDuplicate?: boolean;
  excludedFromCalc?: boolean;
};

export type DayContext = {
  workDate: string;
  scheduled: boolean;
  weekOff?: boolean;
  holidayName?: string | null;
  leaveType?: "annual_leave" | "sick_leave" | "unpaid_leave" | null;
  shift?: ShiftTemplateInput | null;
  rules?: AttendanceRuleInput;
};

function parseHm(value: string): { h: number; m: number } {
  const [h, m] = value.split(":").map((n) => Number.parseInt(n, 10));
  return { h: h || 0, m: m || 0 };
}

function atDate(workDate: string, time: string, addDays = 0): Date {
  const { h, m } = parseHm(time);
  const [y, mo, d] = workDate.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + addDays, h - 3, m, 0));
}

function qatarYmd(date: Date): string {
  const q = new Date(date.getTime() + 3 * 3600_000);
  return q.toISOString().slice(0, 10);
}

export function assignAttendanceDate(punchIso: string, shift: ShiftTemplateInput | null | undefined): string {
  const punch = new Date(punchIso);
  const cutoff = shift?.dayCutoffTime ?? DEFAULT_SHIFT.dayCutoffTime;
  const { h, m } = parseHm(cutoff);
  const qatarHour = (punch.getUTCHours() + 3 + 24) % 24;
  const minutes = qatarHour * 60 + punch.getUTCMinutes();
  const cutoffMinutes = h * 60 + m;
  if (shift?.overnight && minutes < cutoffMinutes) {
    return qatarYmd(new Date(punch.getTime() - 24 * 3600_000));
  }
  return qatarYmd(punch);
}

/**
 * Marks rapid-fire repeats as duplicates within each person stream.
 * Always recomputes flags (does not preserve stale `probableDuplicate`).
 * Pass `groupKey` when the batch mixes multiple people (e.g. full ATTLOG ingest);
 * without it, the whole list is treated as one person (safe for per-subject recalc).
 */
export function markProbableDuplicates<T extends CalcPunch>(
  punches: T[],
  windowSeconds: number,
  options?: { groupKey?: (punch: T) => string },
): T[] {
  if (!punches.length) return punches;
  const groupKey = options?.groupKey;
  if (!groupKey) return markProbableDuplicatesInGroup(punches, windowSeconds);

  const indexed = punches.map((p, index) => ({ p, index }));
  const byGroup = new Map<string, Array<{ p: T; index: number }>>();
  for (const item of indexed) {
    const key = groupKey(item.p) || "__";
    const list = byGroup.get(key) ?? [];
    list.push(item);
    byGroup.set(key, list);
  }

  const out = punches.map((p) => ({ ...p, probableDuplicate: false }));
  for (const group of byGroup.values()) {
    const marked = markProbableDuplicatesInGroup(
      group.map((g) => g.p),
      windowSeconds,
    );
    group.forEach((g, i) => {
      out[g.index] = { ...out[g.index], probableDuplicate: Boolean(marked[i]?.probableDuplicate) };
    });
  }
  return out;
}

function markProbableDuplicatesInGroup<T extends CalcPunch>(punches: T[], windowSeconds: number): T[] {
  const sorted = [...punches].sort((a, b) => new Date(a.punchAt).getTime() - new Date(b.punchAt).getTime());
  const windowMs = Math.max(0, windowSeconds) * 1000;
  let lastKept: number | null = null;
  const flagged = new Map<T, boolean>();
  for (const p of sorted) {
    const t = new Date(p.punchAt).getTime();
    if (lastKept != null && t - lastKept <= windowMs && windowMs > 0) {
      flagged.set(p, true);
      continue;
    }
    lastKept = t;
    flagged.set(p, false);
  }
  return punches.map((p) => ({ ...p, probableDuplicate: flagged.get(p) ?? false }));
}

export function calculateDailyAttendance(punches: CalcPunch[], ctx: DayContext): DailyCalcResult {
  const rules = ctx.rules ?? DEFAULT_RULES;
  const shift = ctx.shift ?? null;
  const rawPunchTimes = [...punches]
    .sort((a, b) => new Date(a.punchAt).getTime() - new Date(b.punchAt).getTime())
    .map((p) => p.punchAt);

  const valid = punches
    .filter((p) => !p.excludedFromCalc && !p.probableDuplicate)
    .sort((a, b) => new Date(a.punchAt).getTime() - new Date(b.punchAt).getTime());

  if (ctx.weekOff) {
    return emptyDay(
      ctx.workDate,
      rawPunchTimes,
      "weekly_off",
      valid.length ? ["weekly_off", "unscheduled"] : ["weekly_off"],
      valid.length ? "Punches on a weekly off" : null,
    );
  }
  if (ctx.holidayName) {
    return emptyDay(
      ctx.workDate,
      rawPunchTimes,
      "public_holiday",
      valid.length ? ["public_holiday", "unscheduled"] : ["public_holiday"],
      valid.length ? `Punches on holiday (${ctx.holidayName})` : null,
    );
  }
  if (ctx.leaveType) {
    return emptyDay(ctx.workDate, rawPunchTimes, ctx.leaveType, [ctx.leaveType], null);
  }

  if (valid.length === 0) {
    if (!ctx.scheduled && rules.absentRequiresRoster) {
      return emptyDay(ctx.workDate, rawPunchTimes, "unscheduled", ["unscheduled"], "No roster or scheduled working day");
    }
    if (ctx.scheduled) {
      return emptyDay(ctx.workDate, rawPunchTimes, "absent", ["absent"], "No punches on a scheduled working day");
    }
    return emptyDay(ctx.workDate, rawPunchTimes, "unscheduled", ["unscheduled"], "No scheduled working day");
  }

  const actualIn = valid[0].punchAt;
  const actualOutIso = valid.length > 1 ? valid[valid.length - 1].punchAt : null;
  const punchCount = valid.length;
  const flags: AttendanceStatus[] = [];
  let missedPunch = punchCount === 1;
  let status: AttendanceStatus = "present";
  let exceptionReason: string | null = null;

  if (punchCount === 1) {
    flags.push("missed_punch", "incomplete");
    status = "missed_punch";
    exceptionReason = "Only one valid punch";
  } else if (punchCount % 2 === 1 && rules.oddPunchesNeedReview) {
    flags.push("review_required", "missed_punch");
    status = "review_required";
    exceptionReason = "Odd number of valid punches";
    missedPunch = true;
  } else if (punchCount > 2 && rules.extraPunchesNeedReview) {
    flags.push("review_required");
    status = "review_required";
    exceptionReason = "More than two punches; first used as check-in and last as check-out";
  }

  if (!ctx.scheduled) flags.push("unscheduled");

  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let workedMinutes = 0;
  let overtimeMinutes = 0;

  const scheduledIn = shift ? atDate(ctx.workDate, shift.startTime) : null;
  const scheduledOut = shift ? atDate(ctx.workDate, shift.endTime, shift.overnight ? 1 : 0) : null;
  const inDate = new Date(actualIn);
  let outDate = actualOutIso ? new Date(actualOutIso) : null;
  if (outDate && outDate.getTime() < inDate.getTime()) {
    outDate = new Date(outDate.getTime() + 24 * 3600_000);
  }

  if (scheduledIn) {
    // Late = first check-in after roster reporting time (shift start) + site buffer / grace.
    const graceMs = (shift?.graceMinutes ?? 0) * 60_000;
    const lateMs = inDate.getTime() - scheduledIn.getTime() - graceMs;
    if (lateMs > 0) {
      lateMinutes = Math.round(lateMs / 60_000);
      flags.push("late");
    }
  }

  if (outDate && scheduledOut) {
    const earlyMs = scheduledOut.getTime() - outDate.getTime();
    if (earlyMs > 60_000) {
      earlyLeaveMinutes = Math.round(earlyMs / 60_000);
      flags.push("early_departure");
    }
  }

  if (outDate) {
    // Total hours worked = punch span − site break (net). OT uses the same net figure.
    const breakMin = shift?.breakMinutes ?? 0;
    workedMinutes = Math.max(0, Math.round((outDate.getTime() - inDate.getTime()) / 60_000) - breakMin);
    // Expected daily length from site policy × employment type (overtimeAfterMinutes / minWorkMinutes).
    // Never fall back to a legacy 8h (480) day when expected is known.
    const expectedMinutes = Math.max(
      0,
      Number(
        shift?.overtimeAfterMinutes ??
          shift?.minWorkMinutes ??
          PERMANENT_SHIFT_MINUTES,
      ),
    );
    overtimeMinutes = Math.max(0, workedMinutes - expectedMinutes);
    if (overtimeMinutes > 0) flags.push("overtime");

    // Hours vs site expected length are the primary status. Under-expected → Late (not Short hours).
    // Roster lateness stays in lateMinutes / Late punch column independently.
    const punchIssue = status === "missed_punch" || status === "review_required";
    if (!punchIssue) {
      const minWork = Math.max(0, Number(shift?.minWorkMinutes ?? expectedMinutes));
      if (minWork > 0) {
        if (workedMinutes >= minWork) {
          status = "present";
          flags.push("present");
        } else {
          status = "late";
          flags.push("late", "incomplete");
          exceptionReason = exceptionReason ?? `Net hours below expected (${minWork} min)`;
        }
      } else if (lateMinutes > 0) {
        status = "late";
      } else if (earlyLeaveMinutes > 0) {
        status = "early_departure";
      } else {
        status = "present";
        flags.push("present");
      }
    }
  } else {
    flags.push("incomplete");
  }

  const uniqueFlags = Array.from(new Set(flags));
  if (!uniqueFlags.includes(status)) uniqueFlags.unshift(status);
  if (uniqueFlags.length === 0) uniqueFlags.push("present");

  return {
    workDate: ctx.workDate,
    actualIn,
    actualOut: outDate ? outDate.toISOString() : null,
    punchCount: punches.length,
    validPunchCount: punchCount,
    rawPunchTimes,
    lateMinutes,
    earlyLeaveMinutes,
    workedMinutes,
    regularMinutes: Math.max(0, workedMinutes - overtimeMinutes),
    overtimeMinutes,
    missedPunch,
    status,
    statusFlags: uniqueFlags,
    exceptionReason,
  };
}

function emptyDay(
  workDate: string,
  rawPunchTimes: string[],
  status: AttendanceStatus,
  flags: AttendanceStatus[],
  exceptionReason: string | null,
): DailyCalcResult {
  return {
    workDate,
    actualIn: null,
    actualOut: null,
    punchCount: rawPunchTimes.length,
    validPunchCount: 0,
    rawPunchTimes,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    workedMinutes: 0,
    regularMinutes: 0,
    overtimeMinutes: 0,
    missedPunch: false,
    status,
    statusFlags: flags,
    exceptionReason,
  };
}

export function summarizePeriod(days: DailyCalcResult[]) {
  const leaveStatuses = new Set(["annual_leave", "sick_leave", "unpaid_leave"]);
  const offStatuses = new Set(["weekly_off", "public_holiday", ...leaveStatuses]);
  const workingDays = days.filter((d) => !offStatuses.has(d.status)).length;
  const presentDays = days.filter(
    (d) =>
      d.validPunchCount >= 2 ||
      d.statusFlags.includes("present") ||
      d.statusFlags.includes("late") ||
      d.statusFlags.includes("early_departure") ||
      d.statusFlags.includes("overtime"),
  ).length;
  return {
    workingDays,
    presentDays,
    absentDays: days.filter((d) => d.status === "absent").length,
    weeklyOffs: days.filter((d) => d.status === "weekly_off").length,
    holidays: days.filter((d) => d.status === "public_holiday").length,
    leaveDays: days.filter((d) => leaveStatuses.has(d.status)).length,
    annualLeave: days.filter((d) => d.status === "annual_leave").length,
    sickLeave: days.filter((d) => d.status === "sick_leave").length,
    unpaidLeave: days.filter((d) => d.status === "unpaid_leave").length,
    lateOccurrences: days.filter((d) => d.lateMinutes > 0).length,
    totalLateMinutes: days.reduce((s, d) => s + d.lateMinutes, 0),
    earlyDepartures: days.filter((d) => d.earlyLeaveMinutes > 0).length,
    missedPunches: days.filter((d) => d.missedPunch).length,
    incompleteRecords: days.filter(
      (d) => d.statusFlags.includes("incomplete") || d.statusFlags.includes("review_required"),
    ).length,
    totalWorkedHours: round1(days.reduce((s, d) => s + d.workedMinutes, 0) / 60),
    regularHours: round1(days.reduce((s, d) => s + d.regularMinutes, 0) / 60),
    overtimeHours: round1(days.reduce((s, d) => s + d.overtimeMinutes, 0) / 60),
    attendancePercent: workingDays === 0 ? 0 : Math.round((presentDays / workingDays) * 1000) / 10,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
