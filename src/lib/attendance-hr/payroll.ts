export const PAYROLL_BLOCKING_STATUSES = new Set(["missed_punch", "incomplete", "short_hours", "review_required"]);

/** Days the employee was on site — includes late / OT / short hours (still blocking when short). */
export const PAYROLL_PRESENT_STATUSES = new Set([
  "present",
  "late",
  "overtime",
  "early_departure",
  "early_leave",
  "short_hours",
]);

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

export function isPayrollPresentDay(row: Pick<PayrollDayInput, "status">): boolean {
  return PAYROLL_PRESENT_STATUSES.has(String(row.status ?? ""));
}

export function isPayrollReady(row: Pick<PayrollStaffRow, "blockingDays" | "missedPunches">): boolean {
  return row.blockingDays === 0 && row.missedPunches === 0;
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
  for (const day of days) {
    if (!day.staff_id) continue;
    const current =
      byStaff.get(day.staff_id) ??
      emptyStaff(day.staff_id, (day.staff_name ?? "").trim() || "Staff", day.employee_code ?? "");
    const status = String(day.status ?? "");
    if (isPayrollPresentDay(day)) current.daysPresent += 1;
    if (status === "absent") current.daysAbsent += 1;
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
