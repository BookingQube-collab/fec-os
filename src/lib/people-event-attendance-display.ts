import type {
  AttendanceListingSource,
  AttendanceSummaryRow,
} from "@/lib/attendance-display";
import { mayFillRosterDevicePunches } from "@/lib/attendance-hr/roster-punch-fill";
import type { PeopleEventAttendanceRow } from "@/lib/people-event-workforce.functions";

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

/** Map People event attendance → FEC AttendanceRecordsTable source. */
export function toEventAttendanceListingSource(
  row: PeopleEventAttendanceRow,
): AttendanceListingSource {
  return {
    id: row.id,
    locationId: row.locationId ?? undefined,
    locationLabel: eventAttendanceLocationLabel(row),
    userName: row.staffName ?? "—",
    deviceUserId: row.biometricUserId,
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
