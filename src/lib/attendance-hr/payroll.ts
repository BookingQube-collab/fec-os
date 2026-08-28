export const PAYROLL_BLOCKING_STATUSES = new Set(["missed_punch", "incomplete", "review_required"]);

export type PayrollDayInput = {
  staff_id: string | null;
  staff_name?: string | null;
  employee_code?: string | null;
  status: string;
  late_minutes?: number | null;
  missed_punch?: boolean | null;
  overtime_minutes?: number | null;
  worked_minutes?: number | null;
  punch_count?: number | null;
};

export type PayrollStaffRow = {
  staffId: string;
  staffName: string;
  employeeCode: string;
  daysPresent: number;
  daysAbsent: number;
  daysLate: number;
  missedPunches: number;
  workedMinutes: number;
  overtimeMinutes: number;
  blockingDays: number;
  payrollReady: boolean;
  locationLabel?: string;
};

export function isPayrollBlockingDay(row: Pick<PayrollDayInput, "status" | "missed_punch">): boolean {
  if (row.missed_punch) return true;
  return PAYROLL_BLOCKING_STATUSES.has(String(row.status ?? ""));
}

export function isPayrollReady(row: Pick<PayrollStaffRow, "blockingDays" | "missedPunches">): boolean {
  return row.blockingDays === 0 && row.missedPunches === 0;
}

function emptyStaff(id: string, name: string, code: string): PayrollStaffRow {
  return {
    staffId: id,
    staffName: name,
    employeeCode: code,
    daysPresent: 0,
    daysAbsent: 0,
    daysLate: 0,
    missedPunches: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
    blockingDays: 0,
    payrollReady: true,
  };
}

export function aggregatePayrollRows(days: PayrollDayInput[]): PayrollStaffRow[] {
  const byStaff = new Map<string, PayrollStaffRow>();
  for (const day of days) {
    if (!day.staff_id) continue;
    const current =
      byStaff.get(day.staff_id) ??
      emptyStaff(day.staff_id, (day.staff_name ?? "").trim() || "Staff", day.employee_code ?? "");
    const status = String(day.status ?? "");
    if (status === "present" || status === "late" || status === "overtime" || status === "early_departure") {
      current.daysPresent += 1;
    }
    if (status === "absent") current.daysAbsent += 1;
    if (status === "late" || Number(day.late_minutes ?? 0) > 0) current.daysLate += 1;
    if (day.missed_punch || status === "missed_punch") current.missedPunches += 1;
    if (isPayrollBlockingDay(day)) current.blockingDays += 1;
    current.workedMinutes += Number(day.worked_minutes ?? 0);
    current.overtimeMinutes += Number(day.overtime_minutes ?? 0);
    if ((day.staff_name ?? "").trim()) current.staffName = day.staff_name!.trim();
    if (day.employee_code) current.employeeCode = day.employee_code;
    byStaff.set(day.staff_id, current);
  }
  return [...byStaff.values()]
    .map((row) => ({ ...row, payrollReady: isPayrollReady(row) }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
}
