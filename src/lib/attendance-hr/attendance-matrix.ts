import {
  formatHoursValue,
  formatLatePunch,
  formatReportingTime12h,
  getAttendanceStatusDisplay,
  hasLatePunch,
  resolveHoursBasedAttendanceStatus,
  resolveTotalHoursWorked,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import {
  buildRosterMatrix,
  isWeekendYmd,
  rosterMatrixCellKey,
  rosterMonthSpans,
} from "@/lib/attendance-hr/roster-register-scope";

export type AttendanceMatrixRow = AttendanceListingSource & {
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  qid: string | null;
  workDate: string;
};

export type AttendanceGridTone =
  | "empty"
  | "present"
  | "late"
  | "missed_punch"
  | "weekly_off"
  | "absent"
  | "unscheduled"
  | "leave"
  | "other";

const LEAVE_KEYS = new Set(["public_holiday", "annual_leave", "sick_leave", "unpaid_leave"]);

/** Compact punch clock for grid cells (no seconds). */
export function formatAttendanceGridPunch(iso: string | null | undefined): string {
  return formatReportingTime12h(iso);
}

export function attendanceListingStaffKey(row: AttendanceListingSource): string {
  if (row.staffKey) return row.staffKey;
  if (row.deviceUserId?.trim()) return `bio:${row.locationLabel}:${row.deviceUserId.trim()}`;
  if (row.userName?.trim()) return `name:${row.userName.trim()}`;
  return `row:${row.id ?? row.work_date}`;
}

export function toAttendanceMatrixRow(row: AttendanceListingSource): AttendanceMatrixRow {
  return {
    ...row,
    staffId: attendanceListingStaffKey(row),
    staffName: row.userName,
    employeeCode: row.employeeCode ?? row.deviceUserId ?? null,
    qid: row.qid ?? null,
    workDate: row.work_date.slice(0, 10),
  };
}

/** Staff × day matrix for the attendance listing period — reuses roster matrix helpers. */
export function buildAttendanceMatrix(rows: AttendanceListingSource[], dateFrom: string, dateTo: string) {
  return buildRosterMatrix(rows.map(toAttendanceMatrixRow), dateFrom, dateTo);
}

export function attendanceGridTone(row: AttendanceListingSource): AttendanceGridTone {
  const status = resolveHoursBasedAttendanceStatus(row);
  if (status === "missed_punch" || row.missed_punch) return "missed_punch";
  if (status === "weekly_off") return "weekly_off";
  if (LEAVE_KEYS.has(status)) return "leave";
  if (status === "absent") return "absent";
  if (status === "unscheduled") return "unscheduled";
  if (hasLatePunch(row.late_minutes) || status === "late") return "late";
  if (status === "present" || status === "overtime") return "present";
  return "other";
}

/** Soft cell tint matching list-row status colors where possible. */
export function attendanceGridCellClass(tone: AttendanceGridTone): string {
  switch (tone) {
    case "late":
      return "bg-rose-500/10 text-rose-800 dark:text-rose-200";
    case "missed_punch":
      return "bg-amber-400/25 text-amber-950 dark:text-amber-100";
    case "weekly_off":
    case "absent":
    case "leave":
      return "bg-sky-500/20 text-sky-900 dark:text-sky-100";
    case "unscheduled":
      return "bg-zinc-500/10 text-zinc-800 dark:text-zinc-200";
    default:
      return "";
  }
}

export type AttendanceGridCellContent = {
  tone: AttendanceGridTone;
  primary: string;
  secondary: string | null;
  meta: string | null;
  statusLabel: string;
};

/** Compact cell copy: punches stacked, hours/late/off as meta. */
export function attendanceGridCellContent(row: AttendanceListingSource): AttendanceGridCellContent {
  const tone = attendanceGridTone(row);
  const statusLabel = getAttendanceStatusDisplay(row).label;
  const hours = resolveTotalHoursWorked(row);
  const late = formatLatePunch(row.late_minutes);

  if (tone === "weekly_off" || tone === "leave" || tone === "absent" || tone === "unscheduled") {
    return { tone, primary: statusLabel, secondary: null, meta: null, statusLabel };
  }

  const inn = formatAttendanceGridPunch(row.actual_in) || "—";
  const out = formatAttendanceGridPunch(row.actual_out) || "—";
  const metaParts: string[] = [];
  if (hours != null) metaParts.push(`${formatHoursValue(hours)}h`);
  if (late !== "—") metaParts.push(`L${late}`);

  return {
    tone,
    primary: inn,
    secondary: out,
    meta: metaParts.length ? metaParts.join(" · ") : null,
    statusLabel,
  };
}

export { isWeekendYmd, rosterMatrixCellKey, rosterMonthSpans };
