import {
  applyPreJoinAttendanceStatus,
  applyRosterDayStatusOverride,
  isWorkDateBeforeHireDate,
} from "@/lib/attendance-display";
import { isAttendanceListingWorkedDay } from "@/lib/attendance-hr/export-workbook";
import type { AttendanceHrReportRow } from "@/lib/attendance-hr/report";
import {
  applyAcceptedCorrectionTimes,
  type AcceptedCorrectionPunch,
} from "@/lib/attendance-hr/missed-punch-approval";
import { resolveWeekOff } from "@/lib/attendance-hr/shift-policy";
import { isJokerStaff } from "@/lib/staff-status";

/** Undertime (short_hours) is not blocking — Generate pays roster/attendance days as worked;
 *  short-hour pay cuts are a manual payslip Other deduction if HR chooses.
 *  Complete In/Out pairs never block (ignore stale missed_punch / review_required stamps). */
export const PAYROLL_BLOCKING_STATUSES = new Set(["missed_punch", "incomplete", "review_required"]);

export const PAYROLL_BLOCK_REASON_LABELS: Record<string, string> = {
  missed_punch: "Missed punch",
  incomplete: "Incomplete attendance",
  short_hours: "Undertime (short hours)",
  review_required: "Review required",
};

export type PayrollDayInput = {
  staff_id: string | null;
  staff_name?: string | null;
  employee_code?: string | null;
  work_date?: string | null;
  status: string;
  late_minutes?: number | null;
  missed_punch?: boolean | null;
  overtime_minutes?: number | null;
  worked_minutes?: number | null;
  punch_count?: number | null;
  /** Listing resolver uses punches, not the stored status alone. */
  actual_in?: string | null;
  actual_out?: string | null;
  scheduled_in?: string | null;
  scheduled_out?: string | null;
  expected_minutes?: number | null;
  employment_type?: string | null;
  flexible_attendance?: boolean | null;
  /** staff.hire_date. Days strictly before this are not absence deductions. */
  hire_date?: string | null;
  /**
   * Roster rest day for this staff+date (any site). Raw daily_summary often keeps
   * status=missed_punch / absent on week offs — listing overlays roster; payroll must too.
   */
  is_week_off?: boolean | null;
  /**
   * True when roster has an on-duty (non week-off) assignment that day.
   * Jokers without on-duty roster are unscheduled — not missed_punch Ready blockers.
   */
  has_on_duty_roster?: boolean | null;
  /** Approved leave from attendance_leave_records (wins over roster week-off). */
  leave_type?: string | null;
};

export type PayrollBlockReason = {
  code: string;
  count: number;
};

export type PayrollBlockDay = {
  workDate: string;
  code: string;
};

export type PayrollStaffRow = {
  staffId: string;
  staffName: string;
  employeeCode: string;
  /**
   * Paid entitlement days for Generate: Present/Late worked days plus paid non-work
   * (weekly off, annual leave, sick leave, comp off, public holiday).
   */
  daysPresent: number;
  daysAbsent: number;
  /** Days marked unpaid_leave in attendance (export treats these as Unpaid). */
  daysUnpaidLeave: number;
  /** Paid + unpaid leave statuses (annual / sick / unpaid / comp off). */
  daysLeave: number;
  daysLate: number;
  missedPunches: number;
  workedMinutes: number;
  /** Punch-derived OT minutes from attendance_daily_summary. */
  overtimeMinutes: number;
  /**
   * Submitted OT claim minutes (Ops supervisor + F&B Cafe + attendance claims).
   * Visibility only — pay still requires gm_approved (AT#4).
   */
  submittedOtMinutes: number;
  blockingDays: number;
  payrollReady: boolean;
  /** Aggregated why-blocked codes (source of truth for Fix UI). */
  blockReasons: PayrollBlockReason[];
  /** Individual blocking days when work_date was provided. */
  blockDays: PayrollBlockDay[];
  locationLabel?: string;
  /**
   * Pay preview for the readiness list (QAR). Prefer generated period line net when
   * present; otherwise estimate from compensation × paid days (Generate rules).
   */
  payQar?: number | null;
  /** generated = period line; estimate = compensation preview; missing = no salary set. */
  paySource?: "generated" | "estimate" | "missing";
};

const PAYROLL_LEAVE_STATUSES = new Set([
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
  "comp_off",
]);

/**
 * Non-work statuses that still earn pay (not unpaid absence).
 * Week off + annual leave are paid; sick / comp off / public holiday match the same rule.
 * unpaid_leave stays out — it reduces entitlement.
 */
export const PAYROLL_PAID_NON_WORK_STATUSES = new Set([
  "weekly_off",
  "annual_leave",
  "sick_leave",
  "comp_off",
  "public_holiday",
]);

/** Normalize aliases (OFF / week_off) to the canonical payroll status key. */
export function normalizePayrollAttendanceStatus(status: string | null | undefined): string {
  const raw = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "week_off" || raw === "weekoff" || raw === "off") return "weekly_off";
  return raw;
}

/**
 * Effective attendance status for pay / Ready: roster week-off and approved leave
 * override stale daily_summary missed_punch / absent (same as listing + My Attendance).
 */
export function effectivePayrollAttendanceStatus(
  row: Pick<PayrollDayInput, "status" | "is_week_off" | "leave_type">,
): string {
  return applyRosterDayStatusOverride({
    status: String(row.status ?? ""),
    isWeekOff: row.is_week_off,
    leaveType: row.leave_type,
  });
}

/** Scheduled week off / paid leave — never a Ready blocker (ignore stale missed_punch). */
export function isPayrollPaidNonWorkDay(
  row: Pick<PayrollDayInput, "status" | "is_week_off" | "leave_type">,
): boolean {
  return PAYROLL_PAID_NON_WORK_STATUSES.has(
    normalizePayrollAttendanceStatus(effectivePayrollAttendanceStatus(row)),
  );
}

export type PayrollRosterDay = {
  staff_id: string;
  work_date: string;
  is_week_off: boolean;
};

export type PayrollLeaveDay = {
  staff_id: string;
  work_date: string;
  leave_type: string;
};

function payrollDayHasUsablePunch(
  day: Pick<PayrollDayInput, "actual_in" | "actual_out" | "punch_count">,
): boolean {
  if (day.actual_in || day.actual_out) return true;
  return Number(day.punch_count ?? 0) > 0;
}

/**
 * Punchless joker / day-rate with no on-duty roster and no leave — attendance shows
 * Unscheduled (Beth). Stale daily_summary missed_punch must not Block Ready.
 */
export function isPayrollUnscheduledNonWorkDay(
  day: Pick<
    PayrollDayInput,
    | "status"
    | "missed_punch"
    | "actual_in"
    | "actual_out"
    | "punch_count"
    | "employment_type"
    | "has_on_duty_roster"
    | "is_week_off"
    | "leave_type"
    | "scheduled_in"
    | "scheduled_out"
  >,
): boolean {
  if (payrollDayHasUsablePunch(day)) return false;
  if (day.leave_type) return false;
  if (isPayrollPaidNonWorkDay(day)) return false;
  const status = normalizePayrollAttendanceStatus(day.status);
  if (status === "unscheduled") return true;
  if (!isJokerStaff({ employment_type: day.employment_type })) return false;
  if (day.has_on_duty_roster === true) return false;
  if (day.has_on_duty_roster === false) return true;
  // Schedule context not attached: infer from shift bounds (no times ⇒ not expected).
  return !day.scheduled_in && !day.scheduled_out && !day.is_week_off;
}

/**
 * Attach roster week-off + leave onto daily_summary rows before aggregatePayrollRows.
 * Week-off on any roster site counts (listing rule). Standing weekly_off_weekday applies
 * only when that staff+date has no roster row. Leave wins over week-off.
 * Punchless jokers without on-duty roster become unscheduled (not missed_punch).
 */
export function attachPayrollScheduleContext(
  days: PayrollDayInput[],
  input: {
    roster?: readonly PayrollRosterDay[];
    leave?: readonly PayrollLeaveDay[];
    weeklyOffWeekdayByStaff?: ReadonlyMap<string, number | null | undefined>;
  },
): PayrollDayInput[] {
  const weekOffKeys = new Set<string>();
  const rosteredKeys = new Set<string>();
  const onDutyKeys = new Set<string>();
  for (const r of input.roster ?? []) {
    const staffId = String(r.staff_id ?? "").trim();
    const day = String(r.work_date ?? "").slice(0, 10);
    if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const key = `${staffId}|${day}`;
    rosteredKeys.add(key);
    if (r.is_week_off) weekOffKeys.add(key);
    else onDutyKeys.add(key);
  }

  const leaveByKey = new Map<string, string>();
  for (const leave of input.leave ?? []) {
    const staffId = String(leave.staff_id ?? "").trim();
    const day = String(leave.work_date ?? "").slice(0, 10);
    const leaveType = normalizePayrollAttendanceStatus(leave.leave_type);
    if (!staffId || !day || !leaveType) continue;
    leaveByKey.set(`${staffId}|${day}`, leaveType);
  }

  const standing = input.weeklyOffWeekdayByStaff;

  return days.map((day) => {
    const staffId = day.staff_id ? String(day.staff_id) : "";
    const workDate = String(day.work_date ?? "").slice(0, 10);
    if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return day;
    const key = `${staffId}|${workDate}`;
    const leaveType = leaveByKey.get(key) ?? day.leave_type ?? null;
    const hasRosterRow = rosteredKeys.has(key);
    const rosterIsWeekOff = weekOffKeys.has(key);
    const hasOnDutyRoster = onDutyKeys.has(key);
    const isWeekOff = resolveWeekOff({
      hasRosterRow,
      rosterIsWeekOff,
      workDate,
      weeklyOffWeekday: standing?.get(staffId) ?? null,
    });
    let next: PayrollDayInput = {
      ...day,
      has_on_duty_roster: hasOnDutyRoster,
    };
    if (leaveType || isWeekOff || day.is_week_off || day.leave_type) {
      next = {
        ...next,
        leave_type: leaveType,
        // Leave wins: do not keep week-off when an approved leave type is attached.
        is_week_off: leaveType ? false : Boolean(isWeekOff || day.is_week_off),
      };
    }
    // Beth-style joker: no duty, no punches, not leave → Unscheduled (listing rule).
    if (
      isPayrollUnscheduledNonWorkDay({
        ...next,
        has_on_duty_roster: hasOnDutyRoster,
        leave_type: leaveType ?? next.leave_type,
        is_week_off: next.is_week_off,
      })
    ) {
      return {
        ...next,
        status: "unscheduled",
        missed_punch: false,
        has_on_duty_roster: false,
      };
    }
    return next;
  });
}

/**
 * Overlay ops-accepted / fully approved correction clocks onto payroll days
 * (same as attendance listing + My Attendance) so Ready clears when attendance looks OK
 * even if daily_summary still has stale missed_punch / one-sided times.
 */
export function applyPayrollAcceptedCorrectionOverlay(
  days: PayrollDayInput[],
  corrections: readonly AcceptedCorrectionPunch[],
): PayrollDayInput[] {
  if (!days.length || !corrections.length) return days;
  const timed = applyAcceptedCorrectionTimes(
    days.map((day) => ({
      ...day,
      staff_id: day.staff_id,
      work_date: String(day.work_date ?? "").slice(0, 10),
      actual_in: day.actual_in ?? null,
      actual_out: day.actual_out ?? null,
    })),
    corrections,
  );
  return timed.map((row, index) => {
    const prev = days[index]!;
    if (row.actual_in === (prev.actual_in ?? null) && row.actual_out === (prev.actual_out ?? null)) {
      return prev;
    }
    const hasBoth = Boolean(row.actual_in && row.actual_out);
    const wasMissed =
      Boolean(prev.missed_punch) ||
      normalizePayrollAttendanceStatus(prev.status) === "missed_punch";
    return {
      ...prev,
      actual_in: row.actual_in,
      actual_out: row.actual_out,
      missed_punch: hasBoth ? false : prev.missed_punch,
      status: hasBoth && wasMissed ? "present" : prev.status,
      punch_count: hasBoth ? Math.max(Number(prev.punch_count ?? 0), 2) : prev.punch_count,
    };
  });
}

/** True when the day has both clock-in and clock-out (listing treats as a worked day). */
export function hasPayrollCompletePunches(
  day: Pick<PayrollDayInput, "actual_in" | "actual_out">,
): boolean {
  return Boolean(day.actual_in) && Boolean(day.actual_out);
}

export function isPayrollBlockingDay(
  row: Pick<
    PayrollDayInput,
    | "status"
    | "missed_punch"
    | "actual_in"
    | "actual_out"
    | "is_week_off"
    | "leave_type"
    | "punch_count"
    | "employment_type"
    | "has_on_duty_roster"
    | "scheduled_in"
    | "scheduled_out"
  >,
): boolean {
  return payrollBlockReasonCode(row) != null;
}

/** Same Present/Late day the attendance listing counts as a worked day. */
export function payrollDayToListingRow(day: PayrollDayInput): AttendanceHrReportRow {
  return {
    id: `${day.staff_id ?? ""}:${String(day.work_date ?? "").slice(0, 10)}`,
    location_id: "",
    staff_id: day.staff_id,
    biometric_user_id: null,
    work_date: String(day.work_date ?? "").slice(0, 10),
    status: String(day.status ?? ""),
    actual_in: day.actual_in ?? null,
    actual_out: day.actual_out ?? null,
    scheduled_in: day.scheduled_in ?? null,
    scheduled_out: day.scheduled_out ?? null,
    late_minutes: Number(day.late_minutes ?? 0),
    early_leave_minutes: 0,
    overtime_minutes: Number(day.overtime_minutes ?? 0),
    missed_punch: Boolean(day.missed_punch),
    punch_count: Number(day.punch_count ?? 0),
    worked_minutes: day.worked_minutes ?? null,
    employment_type: day.employment_type ?? null,
    staff_name: day.staff_name ?? null,
    employee_code: day.employee_code ?? null,
    qid: null,
    location_code: null,
    location_name: null,
    location_region: null,
    expected_minutes: day.expected_minutes ?? null,
    flexible_attendance: Boolean(day.flexible_attendance),
    hire_date: day.hire_date ?? null,
  };
}

export function isPayrollPresentDay(row: PayrollDayInput): boolean {
  if (isAttendanceListingWorkedDay(payrollDayToListingRow(row))) return true;
  // Listing keeps a protected "Review required" badge, but both punches are still a worked day.
  return hasPayrollCompletePunches(row) && String(row.status ?? "") === "review_required";
}

/** Worked day or paid non-work status (week off / annual leave / etc.). Unpaid leave is not paid. */
export function isPayrollPaidDay(row: PayrollDayInput): boolean {
  if (isWorkDateBeforeHireDate(row.work_date, row.hire_date)) return false;
  if (isPayrollPresentDay(row)) return true;
  return isPayrollPaidNonWorkDay(row);
}

/** Worked days inside an optional hire/exit window. One row per staff+date after listing collapse. */
export function countListingWorkedDays(
  days: PayrollDayInput[],
  staffId: string,
  bounds?: { from?: string | null; to?: string | null },
): number {
  return listListingWorkedDates(days, staffId, bounds).length;
}

/** Present/Late work dates (YYYY-MM-DD) inside an optional hire/exit window. */
export function listListingWorkedDates(
  days: PayrollDayInput[],
  staffId: string,
  bounds?: { from?: string | null; to?: string | null },
): string[] {
  return listPayrollDatesMatching(days, staffId, bounds, isPayrollPresentDay);
}

/** Paid entitlement dates: worked + week off + annual leave (+ other paid non-work). */
export function listPayrollPaidDates(
  days: PayrollDayInput[],
  staffId: string,
  bounds?: { from?: string | null; to?: string | null },
): string[] {
  return listPayrollDatesMatching(days, staffId, bounds, isPayrollPaidDay);
}

export function countPayrollPaidDays(
  days: PayrollDayInput[],
  staffId: string,
  bounds?: { from?: string | null; to?: string | null },
): number {
  return listPayrollPaidDates(days, staffId, bounds).length;
}

function listPayrollDatesMatching(
  days: PayrollDayInput[],
  staffId: string,
  bounds: { from?: string | null; to?: string | null } | undefined,
  match: (day: PayrollDayInput) => boolean,
): string[] {
  const from = bounds?.from?.slice(0, 10) ?? "";
  const to = bounds?.to?.slice(0, 10) ?? "";
  if (from && to && from > to) return [];
  const out: string[] = [];
  for (const day of collapsePayrollDayInputs(days)) {
    if (day.staff_id !== staffId) continue;
    const ymd = String(day.work_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    if (from && ymd < from) continue;
    if (to && ymd > to) continue;
    if (match(day)) out.push(ymd);
  }
  return out;
}

export function isPayrollReady(row: Pick<PayrollStaffRow, "blockingDays" | "missedPunches">): boolean {
  return row.blockingDays === 0 && row.missedPunches === 0;
}

/**
 * Meaningful period activity beyond phantom absent / unscheduled filler rows.
 * Terminated / resigned people often still have daily_summary Absent rows for the
 * whole cycle — those alone must not keep them on /people/payroll.
 */
export function hasPayrollAttendanceActivity(
  row: Pick<
    PayrollStaffRow,
    | "daysLeave"
    | "daysUnpaidLeave"
    | "daysLate"
    | "missedPunches"
    | "blockingDays"
    | "workedMinutes"
    | "overtimeMinutes"
    | "submittedOtMinutes"
  >,
): boolean {
  return (
    row.daysLeave > 0 ||
    row.daysUnpaidLeave > 0 ||
    row.daysLate > 0 ||
    row.missedPunches > 0 ||
    row.blockingDays > 0 ||
    row.workedMinutes > 0 ||
    row.overtimeMinutes > 0 ||
    row.submittedOtMinutes > 0
  );
}

/**
 * Soft-deleted merge archives (`staff.deleted_at`, same as deactivateStaff /
 * merge_duplicate_staff_locations for Lilam KDS-CC-STF02 → S17). Keepers already
 * own relocated attendance; the archived row must not appear on /people/payroll.
 */
export function isPayrollMergedAwayStaff(deletedAt: string | null | undefined): boolean {
  return Boolean(deletedAt);
}

/**
 * /people/payroll readiness list: keep anyone with paid entitlement days or real
 * attendance activity (leave, punches/OT, missed punch / blockers). Omit exited /
 * never-worked ghosts with 0 paid days and only Absent filler rows.
 * Also omit soft-deleted merge archives when `deletedAt` is provided.
 */
export function includeStaffInPayrollAttendanceSummary(
  row: Pick<
    PayrollStaffRow,
    | "daysPresent"
    | "daysLeave"
    | "daysUnpaidLeave"
    | "daysLate"
    | "missedPunches"
    | "blockingDays"
    | "workedMinutes"
    | "overtimeMinutes"
    | "submittedOtMinutes"
  >,
  evidence?: { deletedAt?: string | null },
): boolean {
  if (isPayrollMergedAwayStaff(evidence?.deletedAt)) return false;
  if (row.daysPresent > 0) return true;
  return hasPayrollAttendanceActivity(row);
}

function earlierPayrollIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function laterPayrollIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Score a daily summary row so multisite ABSENT fillers lose to the punched site
 * (same preference as attendance listing collapse).
 */
export function payrollDayRowScore(row: PayrollDayInput): number {
  let score = 0;
  score += Math.min(Number(row.punch_count) || 0, 20) * 100;
  // Match listing flexibleDayRowScore: prefer rows that already carry a clock side.
  if (row.actual_in) score += 50;
  if (row.actual_out) score += 40;
  if (row.worked_minutes != null && Number(row.worked_minutes) > 0) score += 30;
  const status = normalizePayrollAttendanceStatus(effectivePayrollAttendanceStatus(row));
  if (status && status !== "absent") score += 20;
  // Prefer roster week-off / paid leave over punchless missed_punch sibling rows.
  if (isPayrollPaidNonWorkDay(row)) score += 40;
  if (isPayrollPresentDay(row)) score += 10;
  if (hasPayrollCompletePunches(row)) score += 25;
  if (row.missed_punch || status === "missed_punch") score -= 5;
  return score;
}

/**
 * Merge same staff+date site siblings the way attendance listing does:
 * keep the best base row, take earliest In + latest Out across the group.
 * Split transfer days (INF-CC in / UA-DM out) become one complete pair.
 */
export function mergePayrollDayGroup(group: readonly PayrollDayInput[]): PayrollDayInput {
  if (group.length === 0) {
    throw new Error("mergePayrollDayGroup requires at least one day");
  }
  if (group.length === 1) {
    const only = group[0]!;
    return { ...only, work_date: String(only.work_date ?? "").slice(0, 10) || only.work_date };
  }

  const ranked = [...group].sort((a, b) => payrollDayRowScore(b) - payrollDayRowScore(a));
  // Prefer a complete-pair sibling as the base when available (status / OT / late).
  const winner =
    ranked.find((row) => hasPayrollCompletePunches(row)) ??
    ranked.find((row) => isPayrollPaidNonWorkDay(row)) ??
    ranked[0]!;

  let actualIn = winner.actual_in ?? null;
  let actualOut = winner.actual_out ?? null;
  let worked = winner.worked_minutes ?? null;
  let punchCount = Number(winner.punch_count ?? 0);
  let overtime = Number(winner.overtime_minutes ?? 0);
  let late = Number(winner.late_minutes ?? 0);
  let scheduledIn = winner.scheduled_in ?? null;
  let scheduledOut = winner.scheduled_out ?? null;
  let isWeekOff = Boolean(winner.is_week_off);
  let leaveType = winner.leave_type ?? null;
  let hasOnDuty = winner.has_on_duty_roster;
  let expected = winner.expected_minutes ?? null;

  for (const row of ranked) {
    actualIn = earlierPayrollIso(actualIn, row.actual_in);
    actualOut = laterPayrollIso(actualOut, row.actual_out);
    if (row.worked_minutes != null && (worked == null || Number(row.worked_minutes) > Number(worked))) {
      worked = row.worked_minutes;
    }
    punchCount = Math.max(punchCount, Number(row.punch_count ?? 0));
    overtime = Math.max(overtime, Number(row.overtime_minutes ?? 0));
    late = Math.max(late, Number(row.late_minutes ?? 0));
    if (!scheduledIn && row.scheduled_in) scheduledIn = row.scheduled_in;
    if (!scheduledOut && row.scheduled_out) scheduledOut = row.scheduled_out;
    if (row.is_week_off) isWeekOff = true;
    if (!leaveType && row.leave_type) leaveType = row.leave_type;
    if (row.has_on_duty_roster === true) hasOnDuty = true;
    if (expected == null && row.expected_minutes != null) expected = row.expected_minutes;
  }

  if (actualIn && actualOut) {
    const mins = Math.round(
      (new Date(actualOut).getTime() - new Date(actualIn).getTime()) / 60_000,
    );
    if (Number.isFinite(mins) && mins >= 0) worked = mins;
    punchCount = Math.max(punchCount, 2);
  } else if (actualIn || actualOut) {
    punchCount = Math.max(punchCount, 1);
  }

  const hasBoth = Boolean(actualIn && actualOut);
  const incomplete = Boolean(actualIn) !== Boolean(actualOut);
  const wasMissed =
    Boolean(winner.missed_punch) ||
    normalizePayrollAttendanceStatus(winner.status) === "missed_punch" ||
    ranked.some(
      (row) =>
        Boolean(row.missed_punch) ||
        normalizePayrollAttendanceStatus(row.status) === "missed_punch",
    );

  // Leave wins over week-off (same as attachPayrollScheduleContext).
  if (leaveType) isWeekOff = false;

  let status = winner.status;
  if (hasBoth && wasMissed) {
    status =
      late > 0
        ? "late"
        : normalizePayrollAttendanceStatus(winner.status) === "short_hours"
          ? "short_hours"
          : "present";
  } else if (
    !hasBoth &&
    !incomplete &&
    isPayrollPaidNonWorkDay({ status: winner.status, is_week_off: isWeekOff, leave_type: leaveType })
  ) {
    status = effectivePayrollAttendanceStatus({
      status: winner.status,
      is_week_off: isWeekOff,
      leave_type: leaveType,
    });
  }

  return {
    ...winner,
    work_date: String(winner.work_date ?? "").slice(0, 10),
    status,
    actual_in: actualIn,
    actual_out: actualOut,
    scheduled_in: scheduledIn,
    scheduled_out: scheduledOut,
    worked_minutes: worked,
    punch_count: punchCount,
    overtime_minutes: overtime,
    late_minutes: late,
    expected_minutes: expected,
    missed_punch: hasBoth ? false : incomplete || Boolean(winner.missed_punch),
    is_week_off: isWeekOff,
    leave_type: leaveType,
    has_on_duty_roster: hasOnDuty,
  };
}

/**
 * One row per staff+work_date. Listing collapses cross-site siblings and merges
 * earliest In + latest Out; payroll must too or transfer days Block on a punchless /
 * one-sided abandoned site row while attendance shows Missed punch 0.
 */
export function collapsePayrollDayInputs(days: PayrollDayInput[]): PayrollDayInput[] {
  const byKey = new Map<string, PayrollDayInput[]>();
  const undated: PayrollDayInput[] = [];
  for (const day of days) {
    if (!day.staff_id) continue;
    const workDate = String(day.work_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      undated.push(day);
      continue;
    }
    const key = `${day.staff_id}|${workDate}`;
    const list = byKey.get(key) ?? [];
    list.push({ ...day, work_date: workDate });
    byKey.set(key, list);
  }
  return [...[...byKey.values()].map((group) => mergePayrollDayGroup(group)), ...undated];
}

export type PayrollDeviceLogPunch = {
  staff_id: string;
  work_date: string;
  punch_at: string;
  excluded_from_calc?: boolean | null;
  probable_duplicate?: boolean | null;
};

/**
 * Same device-log hydration attendance listing uses for stale daily_summary:
 * first usable punch = In, last usable (when 2+) = Out. Complete pairs clear MP.
 * Paid leave / week-off rows stay punchless.
 */
export function applyPayrollDeviceLogPunchOverlay(
  days: PayrollDayInput[],
  logs: readonly PayrollDeviceLogPunch[],
): PayrollDayInput[] {
  if (!days.length || !logs.length) return days;

  const punchesByKey = new Map<string, string[]>();
  for (const log of logs) {
    if (log.excluded_from_calc || log.probable_duplicate) continue;
    const staffId = String(log.staff_id ?? "").trim();
    const day = String(log.work_date ?? "").slice(0, 10);
    const punchAt = String(log.punch_at ?? "").trim();
    if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !punchAt) continue;
    const key = `${staffId}|${day}`;
    const list = punchesByKey.get(key) ?? [];
    list.push(punchAt);
    punchesByKey.set(key, list);
  }
  if (!punchesByKey.size) return days;

  for (const [key, list] of punchesByKey) {
    list.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    punchesByKey.set(key, list);
  }

  return days.map((day) => {
    const staffId = day.staff_id ? String(day.staff_id) : "";
    const workDate = String(day.work_date ?? "").slice(0, 10);
    if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return day;
    if (isPayrollPaidNonWorkDay(day)) return day;

    const punches = punchesByKey.get(`${staffId}|${workDate}`);
    if (!punches?.length) return day;

    const incomplete = Boolean(day.actual_in) !== Boolean(day.actual_out);
    const needsHydration = (!day.actual_in && !day.actual_out) || incomplete;
    if (!needsHydration) return day;

    const actualIn = punches[0] ?? null;
    const actualOut = punches.length > 1 ? (punches[punches.length - 1] ?? null) : null;
    const hasBoth = Boolean(actualIn && actualOut);
    let worked = day.worked_minutes ?? null;
    if (hasBoth) {
      const mins = Math.round(
        (new Date(actualOut!).getTime() - new Date(actualIn!).getTime()) / 60_000,
      );
      if (Number.isFinite(mins) && mins >= 0) worked = mins;
    }
    const wasMissed =
      Boolean(day.missed_punch) ||
      normalizePayrollAttendanceStatus(day.status) === "missed_punch";
    return {
      ...day,
      actual_in: actualIn,
      actual_out: actualOut,
      worked_minutes: worked,
      punch_count: Math.max(Number(day.punch_count ?? 0), punches.length),
      missed_punch: hasBoth ? false : day.missed_punch,
      status: hasBoth && wasMissed ? (Number(day.late_minutes ?? 0) > 0 ? "late" : "present") : day.status,
    };
  });
}

/** Canonical block code for a day — shared by aggregate + Fix UI.
 *  Aligns with attendance listing: both punches ⇒ not a missed punch / not Ready-blocking.
 *  Paid week off / annual leave / other paid non-work never block (stale missed_punch ignored).
 *  Punchless jokers / unscheduled (no on-duty roster) never block.
 *  Labels: xor or flagged incomplete punches → missed_punch; status-only gaps → incomplete /
 *  review_required (never relabel complete-punch review days as Missed punch). */
export function payrollBlockReasonCode(
  day: Pick<
    PayrollDayInput,
    | "status"
    | "missed_punch"
    | "actual_in"
    | "actual_out"
    | "is_week_off"
    | "leave_type"
    | "punch_count"
    | "employment_type"
    | "has_on_duty_roster"
    | "scheduled_in"
    | "scheduled_out"
  >,
): string | null {
  // Listing already shows Present/OT/Review with both times — Generate must Ready the same days.
  if (hasPayrollCompletePunches(day)) return null;

  // Roster week-off / paid leave (and status aliases) — never Ready blockers, even when
  // daily_summary still says missed_punch.
  if (isPayrollPaidNonWorkDay(day)) return null;

  // Joker / unscheduled rest — not expected to punch; stale missed_punch must not Block.
  if (isPayrollUnscheduledNonWorkDay(day)) return null;

  const status = normalizePayrollAttendanceStatus(day.status);
  const hasIn = Boolean(day.actual_in);
  const hasOut = Boolean(day.actual_out);
  const incompletePair = hasIn !== hasOut;

  // True missed punch: one-sided punches, or explicit missed stamp when the pair is incomplete.
  if (day.missed_punch || status === "missed_punch" || incompletePair) return "missed_punch";
  if (status === "incomplete") return "incomplete";
  if (status === "review_required") return "review_required";
  return null;
}

export function payrollBlockReasonLabel(code: string): string {
  return PAYROLL_BLOCK_REASON_LABELS[code] ?? code.replace(/_/g, " ");
}

export function formatPayrollBlockReasons(reasons: PayrollBlockReason[]): string[] {
  return reasons.map((r) => {
    const label = payrollBlockReasonLabel(r.code);
    return r.count > 1 ? `${label} ×${r.count}` : label;
  });
}

function tallyBlockReasons(days: PayrollBlockDay[]): PayrollBlockReason[] {
  const counts = new Map<string, number>();
  for (const d of days) {
    counts.set(d.code, (counts.get(d.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function emptyStaff(id: string, name: string, code: string): PayrollStaffRow {
  return {
    staffId: id,
    staffName: name,
    employeeCode: code,
    daysPresent: 0,
    daysAbsent: 0,
    daysUnpaidLeave: 0,
    daysLeave: 0,
    daysLate: 0,
    missedPunches: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
    submittedOtMinutes: 0,
    blockingDays: 0,
    payrollReady: true,
    blockReasons: [],
    blockDays: [],
  };
}

export function aggregatePayrollRows(days: PayrollDayInput[]): PayrollStaffRow[] {
  const byStaff = new Map<string, PayrollStaffRow>();
  for (const day of collapsePayrollDayInputs(days)) {
    if (!day.staff_id) continue;
    const current =
      byStaff.get(day.staff_id) ??
      emptyStaff(day.staff_id, (day.staff_name ?? "").trim() || "Staff", day.employee_code ?? "");
    const status = normalizePayrollAttendanceStatus(effectivePayrollAttendanceStatus(day));
    const absenceStatus = applyPreJoinAttendanceStatus({
      status,
      workDate: day.work_date,
      hireDate: day.hire_date,
    });
    if (isPayrollPaidDay(day)) current.daysPresent += 1;
    if (absenceStatus === "absent") current.daysAbsent += 1;
    if (status === "unpaid_leave") current.daysUnpaidLeave += 1;
    if (PAYROLL_LEAVE_STATUSES.has(status)) current.daysLeave += 1;
    if (status === "late" || Number(day.late_minutes ?? 0) > 0) current.daysLate += 1;
    const blockCode = payrollBlockReasonCode(day);
    if (blockCode === "missed_punch") current.missedPunches += 1;
    if (blockCode) {
      current.blockingDays += 1;
      const workDate = String(day.work_date ?? "").slice(0, 10);
      current.blockDays.push({ workDate, code: blockCode });
    }
    current.workedMinutes += Number(day.worked_minutes ?? 0);
    current.overtimeMinutes += Number(day.overtime_minutes ?? 0);
    if ((day.staff_name ?? "").trim()) current.staffName = day.staff_name!.trim();
    if (day.employee_code) current.employeeCode = day.employee_code;
    byStaff.set(day.staff_id, current);
  }
  return [...byStaff.values()]
    .map((row) => ({
      ...row,
      blockReasons: tallyBlockReasons(row.blockDays),
      blockDays: row.blockDays
        .slice()
        .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.code.localeCompare(b.code)),
      payrollReady: isPayrollReady(row),
    }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
}
