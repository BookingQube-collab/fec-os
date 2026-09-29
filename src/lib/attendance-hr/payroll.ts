import { applyPreJoinAttendanceStatus } from "@/lib/attendance-display";
import { isAttendanceListingWorkedDay } from "@/lib/attendance-hr/export-workbook";
import type { AttendanceHrReportRow } from "@/lib/attendance-hr/report";

export const PAYROLL_BLOCKING_STATUSES = new Set(["missed_punch", "incomplete", "short_hours", "review_required"]);

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
  daysPresent: number;
  daysAbsent: number;
  /** Days marked unpaid_leave in attendance (export treats these as Unpaid). */
  daysUnpaidLeave: number;
  daysLate: number;
  missedPunches: number;
  workedMinutes: number;
  overtimeMinutes: number;
  blockingDays: number;
  payrollReady: boolean;
  /** Aggregated why-blocked codes (source of truth for Fix UI). */
  blockReasons: PayrollBlockReason[];
  /** Individual blocking days when work_date was provided. */
  blockDays: PayrollBlockDay[];
  locationLabel?: string;
};

export function isPayrollBlockingDay(row: Pick<PayrollDayInput, "status" | "missed_punch">): boolean {
  if (row.missed_punch) return true;
  return PAYROLL_BLOCKING_STATUSES.has(String(row.status ?? ""));
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
  return isAttendanceListingWorkedDay(payrollDayToListingRow(row));
}

/** Worked days inside an optional hire/exit window. One row per staff+date after listing collapse. */
export function countListingWorkedDays(
  days: PayrollDayInput[],
  staffId: string,
  bounds?: { from?: string | null; to?: string | null },
): number {
  const from = bounds?.from?.slice(0, 10) ?? "";
  const to = bounds?.to?.slice(0, 10) ?? "";
  if (from && to && from > to) return 0;
  let count = 0;
  for (const day of collapsePayrollDayInputs(days)) {
    if (day.staff_id !== staffId) continue;
    const ymd = String(day.work_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    if (from && ymd < from) continue;
    if (to && ymd > to) continue;
    if (isPayrollPresentDay(day)) count += 1;
  }
  return count;
}

export function isPayrollReady(row: Pick<PayrollStaffRow, "blockingDays" | "missedPunches">): boolean {
  return row.blockingDays === 0 && row.missedPunches === 0;
}

/**
 * Score a daily summary row so multisite ABSENT fillers lose to the punched site
 * (same preference as attendance listing collapse).
 */
export function payrollDayRowScore(row: PayrollDayInput): number {
  let score = 0;
  score += Math.min(Number(row.punch_count) || 0, 20) * 100;
  if (row.worked_minutes != null && Number(row.worked_minutes) > 0) score += 30;
  const status = String(row.status ?? "").toLowerCase();
  if (status && status !== "absent") score += 20;
  if (isPayrollPresentDay(row)) score += 10;
  if (row.missed_punch || status === "missed_punch") score -= 5;
  return score;
}

/**
 * One row per staff+work_date. Listing collapses cross-site siblings; payroll must
 * too or Present undercounts when a site filter (or home ABSENT fillers) hide punches.
 */
export function collapsePayrollDayInputs(days: PayrollDayInput[]): PayrollDayInput[] {
  const byKey = new Map<string, PayrollDayInput>();
  const undated: PayrollDayInput[] = [];
  for (const day of days) {
    if (!day.staff_id) continue;
    const workDate = String(day.work_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      undated.push(day);
      continue;
    }
    const key = `${day.staff_id}|${workDate}`;
    const prev = byKey.get(key);
    if (!prev || payrollDayRowScore(day) > payrollDayRowScore(prev)) {
      byKey.set(key, { ...day, work_date: workDate });
    }
  }
  return [...byKey.values(), ...undated];
}

/** Canonical block code for a day — shared by aggregate + Fix UI. */
export function payrollBlockReasonCode(
  day: Pick<PayrollDayInput, "status" | "missed_punch">,
): string | null {
  if (day.missed_punch || String(day.status ?? "") === "missed_punch") return "missed_punch";
  const status = String(day.status ?? "");
  if (PAYROLL_BLOCKING_STATUSES.has(status)) return status;
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
    daysLate: 0,
    missedPunches: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
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
    const status = String(day.status ?? "");
    const absenceStatus = applyPreJoinAttendanceStatus({
      status,
      workDate: day.work_date,
      hireDate: day.hire_date,
    });
    if (isPayrollPresentDay(day)) current.daysPresent += 1;
    if (absenceStatus === "absent") current.daysAbsent += 1;
    if (status === "unpaid_leave") current.daysUnpaidLeave += 1;
    if (status === "late" || Number(day.late_minutes ?? 0) > 0) current.daysLate += 1;
    if (day.missed_punch || status === "missed_punch") current.missedPunches += 1;
    const blockCode = payrollBlockReasonCode(day);
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
