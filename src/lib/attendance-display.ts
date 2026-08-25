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

const QATAR_TZ = "Asia/Qatar";

/** 12-hour time with seconds, e.g. 10:17:44 AM (Qatar). */
export function formatPunchTime12h(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: QATAR_TZ,
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

const INCOMPLETE_BADGE = "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300";
const MISSING_PUNCH_BADGE = "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300";
const LATE_BADGE = "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300";
const COMPLETE_BADGE = "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";

const NAMED_STATUS_DISPLAY: Record<string, AttendanceStatusDisplay> = {
  weekly_off: {
    label: "Weekly off",
    badgeClass: "border-slate-400/50 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  public_holiday: {
    label: "Public holiday",
    badgeClass: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  annual_leave: {
    label: "Annual leave",
    badgeClass: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  sick_leave: {
    label: "Sick leave",
    badgeClass: "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  unpaid_leave: {
    label: "Unpaid leave",
    badgeClass: "border-slate-400/50 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  unscheduled: {
    label: "Unscheduled",
    badgeClass: "border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  },
  review_required: {
    label: "Review required",
    badgeClass: LATE_BADGE,
  },
};

export function getAttendanceStatusDisplay(
  row: Pick<AttendanceSummaryRow, "status" | "missed_punch" | "actual_in" | "actual_out">,
): AttendanceStatusDisplay {
  const named = NAMED_STATUS_DISPLAY[row.status];
  if (named) return named;

  const hasIn = Boolean(row.actual_in);
  const hasOut = Boolean(row.actual_out);

  if (row.status === "absent" || (!hasIn && !hasOut)) {
    return { label: "Missing Punch", badgeClass: MISSING_PUNCH_BADGE };
  }

  if (
    row.missed_punch ||
    row.status === "missed_punch" ||
    row.status === "incomplete" ||
    hasIn !== hasOut
  ) {
    if ((hasIn && !hasOut) || row.status === "incomplete") {
      return { label: "Incomplete", badgeClass: INCOMPLETE_BADGE };
    }
    return { label: "Missing Punch", badgeClass: MISSING_PUNCH_BADGE };
  }

  if (row.status === "late" || row.status === "early_leave" || row.status === "early_departure") {
    return {
      label: row.status === "late" ? "Late" : "Early Leave",
      badgeClass: LATE_BADGE,
    };
  }

  return { label: "Complete", badgeClass: COMPLETE_BADGE };
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

export type AttendanceListingSource = {
  id?: string;
  locationLabel: string;
  userName: string;
  userNameUnmapped?: boolean;
  work_date: string;
  actual_in: string | null;
  actual_out: string | null;
  overtime_minutes: number;
  status: string;
  missed_punch: boolean;
};

export const ATTENDANCE_LISTING_COLUMNS = [
  "Location",
  "User Name",
  "Date",
  "First Check-In",
  "Last Check-Out",
  "Total Hours Worked",
  "Overtime",
  "Overtime Hours",
  "Status",
] as const;

export type AttendanceListingCells = {
  location: string;
  userName: string;
  date: string;
  firstCheckIn: string;
  lastCheckOut: string;
  totalHours: string;
  overtime: string;
  overtimeHours: string;
  status: string;
};

export function toAttendanceListingSource(row: AttendanceSummaryRow): AttendanceListingSource {
  return {
    id: row.id,
    locationLabel: formatLocationLabel(row.location),
    userName: row.staff?.full_name ?? "—",
    work_date: row.work_date,
    actual_in: row.actual_in,
    actual_out: row.actual_out,
    overtime_minutes: row.overtime_minutes,
    status: row.status,
    missed_punch: row.missed_punch,
  };
}

export function attendanceListingCells(row: AttendanceListingSource): AttendanceListingCells {
  const hours = computeHoursWorked(row.actual_in, row.actual_out);
  const ot = hasOvertime(row);
  const status = getAttendanceStatusDisplay(row);
  return {
    location: row.locationLabel,
    userName: row.userName,
    date: formatWorkDateDdMmYyyy(row.work_date),
    firstCheckIn: formatPunchTime12h(row.actual_in) || "—",
    lastCheckOut: formatPunchTime12h(row.actual_out) || "—",
    totalHours: formatHoursValue(hours),
    overtime: ot ? "Yes" : "No",
    overtimeHours: ot ? formatOvertimeHours(row.overtime_minutes) : "—",
    status: status.label,
  };
}

export function attendanceListingExportObjects(rows: AttendanceListingSource[]) {
  return rows.map((row) => {
    const cells = attendanceListingCells(row);
    return {
      Location: cells.location,
      "User Name": cells.userName,
      Date: cells.date,
      "First Check-In": cells.firstCheckIn,
      "Last Check-Out": cells.lastCheckOut,
      "Total Hours Worked": cells.totalHours,
      Overtime: cells.overtime,
      "Overtime Hours": cells.overtimeHours,
      Status: cells.status,
    };
  });
}

export function buildAttendanceListingCsv(rows: AttendanceListingSource[]): string {
  const lines = rows.map((row) => {
    const cells = attendanceListingCells(row);
    return [
      cells.location,
      cells.userName,
      cells.date,
      cells.firstCheckIn,
      cells.lastCheckOut,
      cells.totalHours,
      cells.overtime,
      cells.overtimeHours,
      cells.status,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [ATTENDANCE_LISTING_COLUMNS.join(","), ...lines].join("\n");
}

export function buildAttendanceCsv(rows: AttendanceSummaryRow[]): string {
  return buildAttendanceListingCsv(rows.map(toAttendanceListingSource));
}
