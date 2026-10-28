import { resolveHoursBasedAttendanceStatus } from "@/lib/attendance-display";

/**
 * Minimal day-row shape for Present / Absent / Late / Missed punch KPIs.
 * Shared by Attendance listing and Dashboard so the same month/range/filters
 * produce the same status buckets.
 */
export type AttendanceSharedKpiInput = {
  staff_id?: string | null;
  status: string;
  missed_punch?: boolean | null;
  actual_in?: string | null;
  actual_out?: string | null;
  late_minutes?: number | null;
  worked_minutes?: number | null;
  break_minutes?: number | null;
  expected_minutes?: number | null;
  employment_type?: string | null;
  flexible_attendance?: boolean | null;
  work_date?: string | null;
  scheduled_in?: string | null;
  scheduled_out?: string | null;
  hasRosterAssignment?: boolean;
  hire_date?: string | null;
};

export type AttendanceSharedKpiFlags = {
  present: boolean;
  absent: boolean;
  late: boolean;
  missedPunch: boolean;
  unscheduled: boolean;
};

export type AttendanceSharedKpis = {
  total: number;
  uniqueStaff: number;
  present: number;
  absent: number;
  late: number;
  missedPunch: number;
  unscheduled: number;
};

/** Same bucket rules as the listing KPI strip (`computeAttendanceHrReportKpis`). */
export function attendanceSharedKpiFlags(row: AttendanceSharedKpiInput): AttendanceSharedKpiFlags {
  const resolved = resolveHoursBasedAttendanceStatus({
    status: row.status,
    missed_punch: Boolean(row.missed_punch),
    actual_in: row.actual_in,
    actual_out: row.actual_out,
    late_minutes: row.late_minutes,
    worked_minutes: row.worked_minutes,
    break_minutes: row.break_minutes,
    expected_minutes: row.expected_minutes,
    employment_type: row.employment_type,
    flexible_attendance: row.flexible_attendance,
    work_date: row.work_date,
    scheduled_in: row.scheduled_in,
    scheduled_out: row.scheduled_out,
    hasRosterAssignment: row.hasRosterAssignment,
    hire_date: row.hire_date,
  });
  return {
    present:
      resolved === "present" ||
      resolved === "working" ||
      resolved === "overtime" ||
      resolved === "short_hours",
    absent: resolved === "absent",
    late: resolved === "late" || Number(row.late_minutes ?? 0) > 0,
    missedPunch: resolved === "missed_punch",
    unscheduled: resolved === "unscheduled",
  };
}

/**
 * Person-day KPI totals. Staff = distinct mapped `staff_id` only
 * (unmapped biometric rows still count in Present/Absent/…).
 */
export function computeSharedAttendanceKpis(rows: readonly AttendanceSharedKpiInput[]): AttendanceSharedKpis {
  const mappedStaff = new Set<string>();
  let present = 0;
  let absent = 0;
  let late = 0;
  let missedPunch = 0;
  let unscheduled = 0;

  for (const row of rows) {
    if (row.staff_id) mappedStaff.add(String(row.staff_id));
    const flags = attendanceSharedKpiFlags(row);
    if (flags.present) present += 1;
    if (flags.absent) absent += 1;
    if (flags.late) late += 1;
    if (flags.missedPunch) missedPunch += 1;
    if (flags.unscheduled) unscheduled += 1;
  }

  return {
    total: rows.length,
    uniqueStaff: mappedStaff.size,
    present,
    absent,
    late,
    missedPunch,
    unscheduled,
  };
}
