import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import {
  expectedShiftMinutes,
  normalizeAttendanceEmploymentRole,
  type SiteShiftPolicyOverrides,
} from "@/lib/attendance-hr/shift-policy";
import { formatLocationRecord } from "@/lib/locations/normalize";

export type AttendanceSummaryRow = {
  id: string;
  location_id: string;
  staff_id: string | null;
  biometric_user_id?: string | null;
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
  worked_minutes?: number | null;
  break_minutes?: number | null;
  /** Expected net daily minutes from site working hours + employment type. */
  expected_minutes?: number | null;
  employment_type?: string | null;
  staff: { full_name?: string; employee_code?: string } | null;
  location: { code: string; name: string; region: string | null } | null;
};

export type AttendanceStatusDisplay = {
  label: string;
  badgeClass: string;
  /** Soft full-row tint for Weekly off / Missed punch only; empty for all other statuses. */
  rowClass: string;
};

export function formatLocationLabel(
  loc: { code?: string | null; name: string; region: string | null } | null | undefined,
): string {
  return formatLocationRecord(loc);
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

/** Roster reporting time (shift start), e.g. 10:00 AM (Qatar). */
export function formatReportingTime12h(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: QATAR_TZ,
  });
}

/** Clock hours: last check-out − first check-in. Break is not deducted. */
export function computeHoursWorked(actualIn: string | null, actualOut: string | null): number | null {
  if (!actualIn || !actualOut) return null;
  const ms = new Date(actualOut).getTime() - new Date(actualIn).getTime();
  if (ms < 0) return null;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/**
 * Total hours worked for the listing: last check-out − first check-in.
 * Prefer punch timestamps so a stale net (break-deducted) worked_minutes cannot hide clock time.
 */
export function resolveTotalHoursWorked(row: {
  actual_in: string | null;
  actual_out: string | null;
  worked_minutes?: number | null;
  break_minutes?: number | null;
}): number | null {
  const clock = computeHoursWorked(row.actual_in, row.actual_out);
  if (clock != null) return clock;
  if (row.worked_minutes != null && Number.isFinite(Number(row.worked_minutes))) {
    const mins = Number(row.worked_minutes);
    if (mins >= 0) return Math.round((mins / 60) * 100) / 100;
  }
  return null;
}

/** OT minutes = max(0, clock hours − expected). Prefer expected when known so UI never shows legacy −8. */
export function resolveOvertimeMinutes(row: {
  actual_in?: string | null;
  actual_out?: string | null;
  worked_minutes?: number | null;
  break_minutes?: number | null;
  overtime_minutes?: number | null;
  expected_minutes?: number | null;
  employment_type?: string | null;
  sitePolicy?: SiteShiftPolicyOverrides | null;
  status?: string | null;
}): number {
  const expected = resolveExpectedWorkMinutes(row);
  const workedHours = resolveTotalHoursWorked({
    actual_in: row.actual_in ?? null,
    actual_out: row.actual_out ?? null,
    worked_minutes: row.worked_minutes,
    break_minutes: row.break_minutes,
  });
  if (expected != null && workedHours != null) {
    const workedMinutes = Math.round(workedHours * 60);
    return Math.max(0, workedMinutes - expected);
  }
  const stored = Number(row.overtime_minutes ?? 0);
  if (Number.isFinite(stored) && stored > 0) return Math.round(stored);
  if (row.status === "overtime") return Math.max(0, Math.round(stored));
  return 0;
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

/** Overtime Yes only when resolved OT minutes are positive (1-minute epsilon). */
export function hasOvertime(row: {
  actual_in?: string | null;
  actual_out?: string | null;
  worked_minutes?: number | null;
  break_minutes?: number | null;
  overtime_minutes?: number | null;
  expected_minutes?: number | null;
  employment_type?: string | null;
  sitePolicy?: SiteShiftPolicyOverrides | null;
  status?: string | null;
}): boolean {
  return resolveOvertimeMinutes(row) > 0;
}

/** Roster late punch: first check-in after roster start + reporting + buffer, from stored late_minutes. */
export function formatLatePunch(lateMinutes: number | null | undefined): string {
  const mins = Number(lateMinutes ?? 0);
  if (!Number.isFinite(mins) || mins <= 0) return "No";
  return String(Math.round(mins));
}

export function hasLatePunch(lateMinutes: number | null | undefined): boolean {
  const mins = Number(lateMinutes ?? 0);
  return Number.isFinite(mins) && mins > 0;
}

const LATE_PUNCH_CELL = "font-semibold text-rose-700 dark:text-rose-300";
const LATE_PUNCH_ROW = "[&>td]:bg-rose-500/10 hover:[&>td]:bg-rose-500/15";

export function latePunchCellClass(lateMinutes: number | null | undefined): string {
  return hasLatePunch(lateMinutes) ? LATE_PUNCH_CELL : "";
}

export function latePunchRowClass(lateMinutes: number | null | undefined): string {
  return hasLatePunch(lateMinutes) ? LATE_PUNCH_ROW : "";
}

const MISSED_PUNCH_BADGE = "border-amber-500/50 bg-amber-500/20 text-amber-800 dark:text-amber-200";
const MISSING_PUNCH_BADGE = "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300";
const LATE_BADGE = "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300";
const COMPLETE_BADGE = "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
const WEEKLY_OFF_BADGE = "border-sky-500/50 bg-sky-500/15 text-sky-800 dark:text-sky-200";

/** Full-row tints only for Weekly off + Missed punch — `<tr>` bg is unreliable with border-collapse. */
const MISSED_PUNCH_ROW = "[&>td]:bg-amber-400/25 hover:[&>td]:bg-amber-400/35";
const WEEKLY_OFF_ROW = "[&>td]:bg-sky-500/20 hover:[&>td]:bg-sky-500/30";
const NO_ROW_TINT = "";

const STATUS_ALIASES: Record<string, string> = {
  week_off: "weekly_off",
  weekoff: "weekly_off",
  off: "weekly_off",
  misspunch: "missed_punch",
  missedpunch: "missed_punch",
  // Under-expected hours → Late (product: keep Late, do not show Short hours)
  short_hours: "late",
  short_hour: "late",
  shorthours: "late",
  hours_missed: "late",
  incomplete_hours: "late",
};

const NAMED_STATUS_DISPLAY: Record<string, AttendanceStatusDisplay> = {
  weekly_off: {
    label: "Weekly off",
    badgeClass: WEEKLY_OFF_BADGE,
    rowClass: WEEKLY_OFF_ROW,
  },
  missed_punch: {
    label: "Missed punch",
    badgeClass: MISSED_PUNCH_BADGE,
    rowClass: MISSED_PUNCH_ROW,
  },
  late: {
    label: "Late",
    badgeClass: LATE_BADGE,
    rowClass: NO_ROW_TINT,
  },
  public_holiday: {
    label: "Public holiday",
    badgeClass: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    rowClass: NO_ROW_TINT,
  },
  annual_leave: {
    label: "Annual leave",
    badgeClass: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    rowClass: NO_ROW_TINT,
  },
  sick_leave: {
    label: "Sick leave",
    badgeClass: "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300",
    rowClass: NO_ROW_TINT,
  },
  unpaid_leave: {
    label: "Unpaid leave",
    badgeClass: "border-slate-400/50 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    rowClass: NO_ROW_TINT,
  },
  unscheduled: {
    label: "Unscheduled",
    badgeClass: "border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
    rowClass: NO_ROW_TINT,
  },
  review_required: {
    label: "Review required",
    badgeClass: LATE_BADGE,
    rowClass: NO_ROW_TINT,
  },
  present: {
    label: "Present",
    badgeClass: COMPLETE_BADGE,
    rowClass: NO_ROW_TINT,
  },
};

const PROTECTED_STATUS_KEYS = new Set([
  "weekly_off",
  "public_holiday",
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
  "unscheduled",
  "review_required",
  "absent",
  "missed_punch",
]);

function normalizeAttendanceStatusKey(status: string): string {
  const raw = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return STATUS_ALIASES[raw] ?? raw;
}

/** Resolve expected net minutes from employment type + optional site hour overrides. */
export function resolveExpectedWorkMinutes(input: {
  expected_minutes?: number | null;
  employment_type?: string | null;
  sitePolicy?: SiteShiftPolicyOverrides | null;
}): number | null {
  if (input.expected_minutes != null && Number.isFinite(Number(input.expected_minutes))) {
    const n = Math.round(Number(input.expected_minutes));
    return n > 0 ? n : null;
  }
  const role = normalizeAttendanceEmploymentRole(input.employment_type);
  const minutes = expectedShiftMinutes(role, input.sitePolicy ?? null);
  return minutes > 0 ? minutes : null;
}

/**
 * Prefer hours-vs-expected as the primary status when both punches exist.
 * Keeps roster / leave / missed-punch statuses intact. Late alone does not win
 * when clock hours meet the site expected daily length.
 */
export function resolveHoursBasedAttendanceStatus(
  row: {
    status: string;
    missed_punch?: boolean;
    actual_in?: string | null;
    actual_out?: string | null;
    worked_minutes?: number | null;
    break_minutes?: number | null;
    expected_minutes?: number | null;
    employment_type?: string | null;
    sitePolicy?: SiteShiftPolicyOverrides | null;
  },
): string {
  const statusKey = normalizeAttendanceStatusKey(row.status);
  if (PROTECTED_STATUS_KEYS.has(statusKey)) return statusKey;

  const hasIn = Boolean(row.actual_in);
  const hasOut = Boolean(row.actual_out);
  if (row.missed_punch || hasIn !== hasOut) return "missed_punch";
  if (!hasIn && !hasOut) {
    return statusKey === "absent" ? "absent" : statusKey || "absent";
  }

  const expected = resolveExpectedWorkMinutes(row);
  const workedHours = resolveTotalHoursWorked({
    actual_in: row.actual_in ?? null,
    actual_out: row.actual_out ?? null,
    worked_minutes: row.worked_minutes,
    break_minutes: row.break_minutes,
  });
  if (expected != null && workedHours != null) {
    const workedMinutes = Math.round(workedHours * 60);
    // Under expected clock hours → Late (not Short hours)
    return workedMinutes >= expected ? "present" : "late";
  }

  if (statusKey === "incomplete" && hasIn && hasOut) return "late";
  if (statusKey === "late" || statusKey === "early_leave" || statusKey === "early_departure" || statusKey === "overtime") {
    return statusKey === "early_leave" ? "early_departure" : statusKey;
  }
  if (statusKey === "present" || statusKey === "complete") return "present";
  return statusKey || "present";
}

export function getAttendanceStatusDisplay(
  row: Pick<AttendanceSummaryRow, "status" | "missed_punch" | "actual_in" | "actual_out"> & {
    worked_minutes?: number | null;
    break_minutes?: number | null;
    expected_minutes?: number | null;
    employment_type?: string | null;
    sitePolicy?: SiteShiftPolicyOverrides | null;
  },
): AttendanceStatusDisplay {
  const statusKey = resolveHoursBasedAttendanceStatus(row);
  const named = NAMED_STATUS_DISPLAY[statusKey];
  if (named) return named;

  const hasIn = Boolean(row.actual_in);
  const hasOut = Boolean(row.actual_out);

  if (row.missed_punch || hasIn !== hasOut) {
    return NAMED_STATUS_DISPLAY.missed_punch;
  }

  if (statusKey === "absent" || (!hasIn && !hasOut)) {
    return { label: "Absent", badgeClass: MISSING_PUNCH_BADGE, rowClass: NO_ROW_TINT };
  }

  if (statusKey === "late" || statusKey === "early_leave" || statusKey === "early_departure") {
    return {
      label: statusKey === "late" ? "Late" : "Early Leave",
      badgeClass: LATE_BADGE,
      rowClass: NO_ROW_TINT,
    };
  }

  if (statusKey === "incomplete") {
    return hasIn && hasOut ? NAMED_STATUS_DISPLAY.late : NAMED_STATUS_DISPLAY.missed_punch;
  }

  return NAMED_STATUS_DISPLAY.present;
}

export function attendanceDateRange(preset: "week" | "month", todayYmd?: string): { from: string; to: string } {
  if (preset === "week") {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }
  const today = todayYmd ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
  const bounds = defaultPayrollPeriod(today);
  return { from: bounds.dateFrom, to: bounds.dateTo };
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
    if (display.label === "Present" || display.label === "Complete") complete++;
    else if (display.label === "Incomplete" || display.label === "Missed punch") {
      incomplete++;
    } else if (display.label === "Missing Punch" || display.label === "Absent") missingPunch++;
    else if (display.label === "Late" || display.label === "Early Leave") late++;

    if (row.status === "absent" || display.label === "Absent") absent++;
    if (hasOvertime(row)) overtime++;

    const hours = resolveTotalHoursWorked(row);
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
  deviceUserId?: string | null;
  work_date: string;
  actual_in: string | null;
  actual_out: string | null;
  scheduled_in?: string | null;
  overtime_minutes: number;
  late_minutes?: number | null;
  worked_minutes?: number | null;
  break_minutes?: number | null;
  expected_minutes?: number | null;
  employment_type?: string | null;
  status: string;
  missed_punch: boolean;
};

export const ATTENDANCE_LISTING_COLUMNS = [
  "Location",
  "User Name",
  "Device User ID",
  "Date",
  "Reporting time",
  "First Check-In",
  "Last Check-Out",
  "Total Hours Worked",
  "Late punch",
  "Overtime",
  "Overtime Hours",
  "Status",
] as const;

export type AttendanceListingCells = {
  location: string;
  userName: string;
  deviceUserId: string;
  date: string;
  reportingTime: string;
  firstCheckIn: string;
  lastCheckOut: string;
  totalHours: string;
  latePunch: string;
  overtime: string;
  overtimeHours: string;
  status: string;
};

export function toAttendanceListingSource(row: AttendanceSummaryRow): AttendanceListingSource {
  return {
    id: row.id,
    locationLabel: formatLocationLabel(row.location),
    userName: row.staff?.full_name ?? "—",
    deviceUserId: row.biometric_user_id ?? null,
    work_date: row.work_date,
    actual_in: row.actual_in,
    actual_out: row.actual_out,
    scheduled_in: row.scheduled_in,
    overtime_minutes: row.overtime_minutes,
    late_minutes: row.late_minutes ?? 0,
    worked_minutes: row.worked_minutes ?? null,
    break_minutes: row.break_minutes ?? null,
    expected_minutes: row.expected_minutes ?? null,
    employment_type: row.employment_type ?? null,
    status: row.status,
    missed_punch: row.missed_punch,
  };
}

export function attendanceListingCells(row: AttendanceListingSource): AttendanceListingCells {
  const hours = resolveTotalHoursWorked(row);
  const otMinutes = resolveOvertimeMinutes(row);
  const ot = otMinutes > 0;
  const status = getAttendanceStatusDisplay(row);
  return {
    location: row.locationLabel,
    userName: row.userName,
    deviceUserId: row.deviceUserId?.trim() || "—",
    date: formatWorkDateDdMmYyyy(row.work_date),
    reportingTime: formatReportingTime12h(row.scheduled_in) || "—",
    firstCheckIn: formatPunchTime12h(row.actual_in) || "—",
    lastCheckOut: formatPunchTime12h(row.actual_out) || "—",
    totalHours: formatHoursValue(hours),
    latePunch: formatLatePunch(row.late_minutes),
    overtime: ot ? "Yes" : "No",
    overtimeHours: ot ? formatOvertimeHours(otMinutes) : "—",
    status: status.label,
  };
}

export function attendanceListingExportObjects(rows: AttendanceListingSource[]) {
  return rows.map((row) => {
    const cells = attendanceListingCells(row);
    return {
      Location: cells.location,
      "User Name": cells.userName,
      "Device User ID": cells.deviceUserId,
      Date: cells.date,
      "Reporting time": cells.reportingTime,
      "First Check-In": cells.firstCheckIn,
      "Last Check-Out": cells.lastCheckOut,
      "Total Hours Worked": cells.totalHours,
      "Late punch": cells.latePunch,
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
      cells.deviceUserId,
      cells.date,
      cells.reportingTime,
      cells.firstCheckIn,
      cells.lastCheckOut,
      cells.totalHours,
      cells.latePunch,
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
