export type AttendanceSummaryRow = {
  id: string;
  location_id: string;
  staff_id: string | null;
  work_date: string;
  status: string;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  missed_punch: boolean;
  actual_in: string | null;
  actual_out: string | null;
  scheduled_in: string | null;
  scheduled_out: string | null;
  staff: { full_name?: string; employee_code?: string } | null;
  location: { code: string; name: string; region: string | null } | null;
};

export type AttendanceStatusDisplay = {
  label: string;
  badgeClass: string;
};

export function formatLocationLabel(loc: { name: string; region: string | null } | null | undefined): string {
  if (!loc) return "—";
  if (loc.region) return `${loc.name} - ${loc.region}`;
  return loc.name;
}

/** DD-MM-YYYY from YYYY-MM-DD or ISO date string. */
export function formatWorkDateDdMmYyyy(workDate: string): string {
  const iso = workDate.slice(0, 10);
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return workDate;
  return `${d}-${m}-${y}`;
}

/** 12-hour time with seconds, e.g. 2:27:43 PM */
export function formatPunchTime12h(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function computeHoursWorked(actualIn: string | null, actualOut: string | null): number | null {
  if (!actualIn || !actualOut) return null;
  const ms = new Date(actualOut).getTime() - new Date(actualIn).getTime();
  if (ms < 0) return null;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export function formatHoursValue(hours: number | null): string {
  if (hours == null) return "—";
  return hours.toFixed(2);
}

export function formatOvertimeHours(minutes: number): string {
  if (!minutes) return "—";
  const h = minutes / 60;
  return h % 1 === 0 ? String(h) : h.toFixed(2);
}

export function hasOvertime(row: Pick<AttendanceSummaryRow, "overtime_minutes" | "status">): boolean {
  return row.overtime_minutes > 0 || row.status === "overtime";
}

export function getAttendanceStatusDisplay(
  row: Pick<AttendanceSummaryRow, "status" | "missed_punch" | "actual_in" | "actual_out">,
): AttendanceStatusDisplay {
  const hasIn = Boolean(row.actual_in);
  const hasOut = Boolean(row.actual_out);

  if (row.status === "absent" || (!hasIn && !hasOut)) {
    return {
      label: "Missing Punch",
      badgeClass: "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300",
    };
  }

  if (row.missed_punch || row.status === "missed_punch" || (hasIn !== hasOut)) {
    if (hasIn && !hasOut) {
      return {
        label: "Incomplete",
        badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
      };
    }
    return {
      label: "Missing Punch",
      badgeClass: "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300",
    };
  }

  if (row.status === "late" || row.status === "early_leave") {
    return {
      label: row.status === "late" ? "Late" : "Early Leave",
      badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    };
  }

  return {
    label: "Complete",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  };
}

export function attendanceDateRange(preset: "week" | "month"): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  const days = preset === "week" ? 7 : 30;
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export type AttendanceDatePreset = "week" | "month" | "custom";

export function resolveAttendanceDateRange(
  preset: AttendanceDatePreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  if (preset === "custom") {
    const from = customFrom.trim() || attendanceDateRange("month").from;
    const to = customTo.trim() || todayIsoDate();
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return attendanceDateRange(preset);
}

export type AttendanceKpiSummary = {
  totalRecords: number;
  uniqueStaff: number;
  complete: number;
  missingPunch: number;
  incomplete: number;
  overtime: number;
  totalHours: number;
  late: number;
  absent: number;
};

export function computeAttendanceKpis(rows: AttendanceSummaryRow[]): AttendanceKpiSummary {
  const staffIds = new Set<string>();
  let complete = 0;
  let missingPunch = 0;
  let incomplete = 0;
  let overtime = 0;
  let totalHours = 0;
  let late = 0;
  let absent = 0;

  for (const row of rows) {
    if (row.staff_id) staffIds.add(row.staff_id);

    const display = getAttendanceStatusDisplay(row);
    if (display.label === "Complete") complete++;
    else if (display.label === "Incomplete") incomplete++;
    else if (display.label === "Missing Punch") missingPunch++;
    else if (display.label === "Late" || display.label === "Early Leave") late++;

    if (row.status === "absent") absent++;
    if (hasOvertime(row)) overtime++;

    const hours = computeHoursWorked(row.actual_in, row.actual_out);
    if (hours != null) totalHours += hours;
  }

  return {
    totalRecords: rows.length,
    uniqueStaff: staffIds.size,
    complete,
    missingPunch,
    incomplete,
    overtime,
    totalHours: Math.round(totalHours * 100) / 100,
    late,
    absent,
  };
}

export function buildAttendanceCsv(rows: AttendanceSummaryRow[]): string {
  const header = [
    "Location",
    "User Name",
    "Date",
    "First Check-In",
    "Last Check-Out",
    "Total Hours Worked",
    "Overtime",
    "Overtime Hours",
    "Status",
  ];
  const lines = rows.map((row) => {
    const hours = computeHoursWorked(row.actual_in, row.actual_out);
    const status = getAttendanceStatusDisplay(row);
    const ot = hasOvertime(row);
    return [
      formatLocationLabel(row.location),
      row.staff?.full_name ?? "",
      formatWorkDateDdMmYyyy(row.work_date),
      formatPunchTime12h(row.actual_in),
      formatPunchTime12h(row.actual_out),
      hours != null ? String(hours) : "",
      ot ? "Yes" : "No",
      ot ? formatOvertimeHours(row.overtime_minutes) : "",
      status.label,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [header.join(","), ...lines].join("\n");
}
