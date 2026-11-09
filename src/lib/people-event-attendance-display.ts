import {
  getAttendanceStatusDisplay,
  type AttendanceListingSource,
  type AttendanceSummaryRow,
} from "@/lib/attendance-display";
import { mayFillRosterDevicePunches } from "@/lib/attendance-hr/roster-punch-fill";
import { normalizeLabel } from "@/lib/fec-departments";
import {
  buildAttendanceTrend,
  previousEqualRange,
  type DayTrendPoint,
} from "@/lib/people-event-attendance-overview";
import type { PeopleEventAttendanceRow } from "@/lib/people-event-workforce.functions";

/** Event-role option used by the Event Attendance Role filter. */
export type EventAttendanceRoleOption = {
  id: string;
  code: string;
  name: string;
};

/**
 * Match an attendance row to a selected event role.
 * Prefer `event_role_id`; fall back to denormalized `role_label` vs role code/name.
 */
export function eventAttendanceRowMatchesRole(
  row: PeopleEventAttendanceRow,
  roleId: string | null | undefined,
  roles: readonly EventAttendanceRoleOption[],
): boolean {
  if (!roleId) return true;
  if (row.eventRoleId && row.eventRoleId === roleId) return true;
  const role = roles.find((r) => r.id === roleId);
  if (!role) return false;
  const label = normalizeLabel(row.roleLabel);
  if (!label) return false;
  return label === normalizeLabel(role.code) || label === normalizeLabel(role.name);
}

export function filterEventAttendanceRowsByRole(
  rows: PeopleEventAttendanceRow[],
  roleId: string | null | undefined,
  roles: readonly EventAttendanceRoleOption[],
): PeopleEventAttendanceRow[] {
  if (!roleId) return rows;
  return rows.filter((row) => eventAttendanceRowMatchesRole(row, roleId, roles));
}

/** Same gate as Fill missed punches — Head of Operations / regional_ops only (not general admin). */
export function mayModifyEventMissedPunch(input: {
  roles: readonly string[];
  jobTitle?: string | null;
}): boolean {
  return mayFillRosterDevicePunches(input);
}

/** Event name first (FEC Location column); site as secondary when present. */
export function eventAttendanceLocationLabel(row: PeopleEventAttendanceRow): string {
  const event = row.eventName?.trim() || "Event";
  const site = row.locationName?.trim();
  return site ? `${event} · ${site}` : event;
}

/** Short location / site code for purple table badges (e.g. "VM"). */
export function eventAttendanceLocationBadge(row: PeopleEventAttendanceRow): string {
  const site = row.locationName?.trim() ?? "";
  if (site.includes("·")) {
    const code = site.split("·")[0]?.trim() ?? "";
    if (code) return code.slice(0, 4).toUpperCase();
  }
  if (site) {
    const first = site.split(/\s+/)[0] ?? "";
    if (first.length > 0 && first.length <= 4) return first.toUpperCase();
    return site.slice(0, 2).toUpperCase();
  }
  const event = row.eventName?.trim() ?? "";
  if (event) return event.slice(0, 2).toUpperCase();
  return "EV";
}

/** Map People event attendance → FEC AttendanceRecordsTable source. */
export function toEventAttendanceListingSource(
  row: PeopleEventAttendanceRow,
): AttendanceListingSource {
  const code = row.employeeCode?.trim();
  const name = row.staffName?.trim();
  return {
    id: row.id,
    locationId: row.locationId ?? undefined,
    locationLabel: eventAttendanceLocationLabel(row),
    userName: code && name ? `${code} · ${name}` : name || code || "—",
    deviceUserId: row.biometricUserId ?? row.employeeCode,
    employeeCode: row.employeeCode,
    work_date: row.workDate,
    actual_in: row.actualIn,
    actual_out: row.actualOut,
    scheduled_in: row.scheduledIn,
    scheduled_out: row.scheduledOut,
    overtime_minutes: row.overtimeMinutes,
    late_minutes: row.lateMinutes,
    worked_minutes: row.workedMinutes,
    status: row.status,
    missed_punch: row.missedPunch,
  };
}

/** Shape needed by computeAttendanceKpis / buildAttendanceCsv. */
export function toEventAttendanceSummaryRow(row: PeopleEventAttendanceRow): AttendanceSummaryRow {
  return {
    id: row.id,
    location_id: row.locationId ?? "",
    staff_id: row.staffId,
    biometric_user_id: row.biometricUserId,
    work_date: row.workDate,
    status: row.status,
    late_minutes: row.lateMinutes,
    early_leave_minutes: row.earlyLeaveMinutes,
    overtime_minutes: row.overtimeMinutes,
    missed_punch: row.missedPunch,
    actual_in: row.actualIn,
    actual_out: row.actualOut,
    scheduled_in: row.scheduledIn,
    scheduled_out: row.scheduledOut,
    worked_minutes: row.workedMinutes,
    staff: {
      full_name: row.staffName ?? undefined,
      employee_code: row.employeeCode ?? undefined,
    },
    location: row.locationName
      ? { code: "", name: row.locationName, region: null }
      : null,
  };
}

export function isEventMissedPunchRow(row: PeopleEventAttendanceRow): boolean {
  return (
    row.missedPunch ||
    row.status === "missed_punch" ||
    row.status === "incomplete" ||
    Boolean(row.actualIn) !== Boolean(row.actualOut)
  );
}

/** Mockup status model for records KPIs / donut: Complete · Late · Missing Punch. */
export type EventAttendanceStatusBucket = "complete" | "late" | "missing";

export function classifyEventAttendanceStatusBucket(
  row: PeopleEventAttendanceRow,
): EventAttendanceStatusBucket {
  if (isEventMissedPunchRow(row)) return "missing";
  const display = getAttendanceStatusDisplay(toEventAttendanceSummaryRow(row));
  if (display.label === "Late" || display.label === "Early Leave") return "late";
  if (
    display.label === "Absent" ||
    display.label === "Missing Punch" ||
    display.label === "Not started"
  ) {
    return "missing";
  }
  return "complete";
}

export type EventAttendancePageKpis = {
  totalRecords: number;
  staffWithAttendance: number;
  complete: number;
  missingPunch: number;
  overtimeHours: number;
  lateEarlyLeave: number;
  completePct: number;
  missingPct: number;
  latePct: number;
  totalDeltaPct: number | null;
  staffDeltaPct: number | null;
  avgAttendancePct: number;
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function countStatusBuckets(rows: PeopleEventAttendanceRow[]) {
  let complete = 0;
  let late = 0;
  let missing = 0;
  const staffIds = new Set<string>();
  let overtimeMinutes = 0;

  for (const row of rows) {
    if (row.staffId) staffIds.add(row.staffId);
    const bucket = classifyEventAttendanceStatusBucket(row);
    if (bucket === "complete") complete += 1;
    else if (bucket === "late") late += 1;
    else missing += 1;
    const ot = Number(row.overtimeMinutes ?? 0);
    if (Number.isFinite(ot) && ot > 0) overtimeMinutes += ot;
  }

  return {
    complete,
    late,
    missing,
    staffWithAttendance: staffIds.size,
    overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
    total: complete + late + missing,
  };
}

export function buildEventAttendancePageKpis(input: {
  rows: PeopleEventAttendanceRow[];
  previousRows: PeopleEventAttendanceRow[];
}): EventAttendancePageKpis {
  const current = countStatusBuckets(input.rows);
  const previous = countStatusBuckets(input.previousRows);
  const attended = current.complete + current.late;

  return {
    totalRecords: current.total,
    staffWithAttendance: current.staffWithAttendance,
    complete: current.complete,
    missingPunch: current.missing,
    overtimeHours: current.overtimeHours,
    lateEarlyLeave: current.late,
    completePct: pct(current.complete, current.total),
    missingPct: pct(current.missing, current.total),
    latePct: pct(current.late, current.total),
    totalDeltaPct: deltaPct(current.total, previous.total),
    staffDeltaPct: deltaPct(current.staffWithAttendance, previous.staffWithAttendance),
    avgAttendancePct: pct(attended, current.total),
  };
}

export function buildEventAttendanceStatusCounts(rows: PeopleEventAttendanceRow[]) {
  return countStatusBuckets(rows);
}

export function buildEventAttendanceTrendForRange(
  rows: PeopleEventAttendanceRow[],
  dateFrom: string,
  dateTo: string,
  locale = "en",
): DayTrendPoint[] {
  if (!dateFrom || !dateTo) return [];
  return buildAttendanceTrend(rows, dateFrom, dateTo, locale);
}

export { previousEqualRange, buildAttendanceTrend };
export type { DayTrendPoint };
