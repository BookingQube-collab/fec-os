import { formatLocationLabel, formatLocationName, rosterSheetLabel } from "@/lib/locations/normalize";
import { breakMinutesForLocation, expectedShiftMinutes, normalizeAttendanceEmploymentRole } from "@/lib/attendance-hr/shift-policy";
import { resolveHoursBasedAttendanceStatus } from "@/lib/attendance-display";
import {
  formatFlexibleCrossSiteDeviceUserLabel,
  formatFlexibleCrossSiteLocationLabel,
} from "@/lib/attendance-hr/flexible-cross-site";
import { resolveListingLateMinutes } from "@/lib/attendance-hr/late-punch";
import { isActiveRosterStaff } from "@/lib/staff-status";

export type AttendanceHrReportRow = {
  id: string;
  location_id: string;
  staff_id: string | null;
  biometric_user_id: string | null;
  /** attendance_devices.id when known on the daily summary. */
  device_id?: string | null;
  work_date: string;
  status: string;
  actual_in: string | null;
  actual_out: string | null;
  scheduled_in?: string | null;
  scheduled_out?: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  missed_punch: boolean;
  punch_count: number;
  worked_minutes: number | null;
  employment_type: string | null;
  staff_name: string | null;
  /** Name on device from attendance_biometric_users (mapping page). */
  device_name?: string | null;
  /** attendance_biometric_users.id for inline map; null when no mapping row. */
  biometric_mapping_id?: string | null;
  employee_code: string | null;
  qid: string | null;
  location_code: string | null;
  location_name: string | null;
  location_region: string | null;
  /** Explicit site break override when set on attendance_site_settings. */
  location_break_minutes?: number | null;
  /** Minutes before roster start for the reporting clock. */
  location_reporting_time_minutes?: number | null;
  /** Site late buffer after the reporting clock. */
  location_buffer_minutes?: number | null;
  /** Expected net daily minutes from site working hours for this staff employment type. */
  expected_minutes?: number | null;
  permanent_hours?: number | null;
  secondment_hours?: number | null;
  joker_hours?: number | null;
  /** staff.flexible_attendance — listing collapses multi-site same-day rows. */
  flexible_attendance?: boolean;
  /** Flexible or MULTIPLE SITES — same-day cross-site collapse / punch enrich. */
  cross_site_day_merge?: boolean;
  /** Location of the earliest usable punch (check-in site). */
  check_in_location_id?: string | null;
  check_out_location_id?: string | null;
  check_in_location_code?: string | null;
  check_out_location_code?: string | null;
  check_in_location_label?: string | null;
  check_out_location_label?: string | null;
  /** Device user id on the check-in / check-out punch (flexible cross-site). */
  check_in_biometric_user_id?: string | null;
  check_out_biometric_user_id?: string | null;
};

export function isAttendanceHrUnmappedSearch(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  return q === "unmapped" || q === "غير مرتبط";
}

export function attendanceHrStaffMatches(
  row: {
    staff_name?: string | null;
    device_name?: string | null;
    employee_code?: string | null;
    qid?: string | null;
    biometric_user_id?: string | null;
  },
  raw: string,
): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  if (isAttendanceHrUnmappedSearch(q)) return !row.staff_name;
  const compact = q.replace(/\s+/g, "");
  const fields = [
    row.staff_name ?? "",
    row.device_name ?? "",
    row.employee_code ?? "",
    row.qid ?? "",
    row.biometric_user_id ?? "",
  ];
  return fields.some((field) => {
    const value = field.toLowerCase();
    return value.includes(q) || value.replace(/\s+/g, "").includes(compact);
  });
}

export function formatAttendanceHrLocation(code?: string | null, name?: string | null): string {
  const c = code?.trim() ?? "";
  const n = name?.trim() ?? "";
  if (!c && !n) return "";
  const resolved = c ? rosterSheetLabel(c, n || null) : n;
  return formatLocationLabel(c, resolved);
}

/** Mapped staff name, else name-on-device, else the unmapped label. */
export function attendanceHrDisplayStaffName(
  row: Pick<AttendanceHrReportRow, "staff_name" | "device_name">,
  unmapped = "Unmapped",
): string {
  return row.staff_name?.trim() || row.device_name?.trim() || unmapped;
}

export function attendanceHrExportStaffName(
  row: Pick<AttendanceHrReportRow, "staff_name" | "device_name">,
  unmapped = "Unmapped",
): string {
  return attendanceHrDisplayStaffName(row, unmapped);
}

/** Site label for the people-style attendance listing: code plus live name, or in → out codes. */
export function attendanceHrListingLocation(
  row: Pick<
    AttendanceHrReportRow,
    | "location_code"
    | "location_name"
    | "location_region"
    | "check_in_location_code"
    | "check_out_location_code"
  >,
): string {
  const inCode = row.check_in_location_code?.trim() || "";
  const outCode = row.check_out_location_code?.trim() || "";
  if (inCode && outCode && inCode !== outCode) {
    return formatFlexibleCrossSiteLocationLabel(inCode, outCode) ?? inCode;
  }
  const liveName = formatLocationName(row.location_name, row.location_region);
  const name = liveName || rosterSheetLabel(row.location_code ?? "", row.location_name);
  return formatLocationLabel(row.location_code || inCode || outCode, name);
}

/**
 * Device User ID cell: `UA-DM 35 → INF-CC 24` for cross-site flexible days;
 * otherwise the single biometric user id (never blank when either side has an id).
 */
export function attendanceHrListingDeviceUserId(
  row: Pick<
    AttendanceHrReportRow,
    | "biometric_user_id"
    | "check_in_location_code"
    | "check_out_location_code"
    | "check_in_biometric_user_id"
    | "check_out_biometric_user_id"
  >,
): string | null {
  const inId = row.check_in_biometric_user_id?.trim() || row.biometric_user_id?.trim() || "";
  const outId = row.check_out_biometric_user_id?.trim() || row.biometric_user_id?.trim() || "";
  const inCode = row.check_in_location_code?.trim() || "";
  const outCode = row.check_out_location_code?.trim() || "";
  const formatted = formatFlexibleCrossSiteDeviceUserLabel(inCode, inId, outCode, outId);
  return formatted || inId || outId || row.biometric_user_id?.trim() || null;
}

function flexibleDayRowScore(row: AttendanceHrReportRow): number {
  let score = 0;
  score += Math.min(Number(row.punch_count) || 0, 20) * 100;
  if (row.actual_in) score += 50;
  if (row.actual_out) score += 40;
  if (row.worked_minutes != null && Number(row.worked_minutes) > 0) score += 30;
  const status = String(row.status ?? "").toLowerCase();
  if (status && status !== "absent") score += 20;
  if (status === "present" || status === "late" || status === "overtime") score += 10;
  return score;
}

function earlierIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Safety net: one row per staff+date for flexible / multisite staff when multi-site
 * summaries still exist (stale ABSENT fillers). Prefer the punched / timed row;
 * merge earliest in + latest out across the group.
 */
export function collapseFlexibleAttendanceReportRows(
  rows: AttendanceHrReportRow[],
): AttendanceHrReportRow[] {
  const flexibleGroups = new Map<string, AttendanceHrReportRow[]>();
  const passthrough: AttendanceHrReportRow[] = [];

  for (const row of rows) {
    const merge = Boolean(row.flexible_attendance || row.cross_site_day_merge);
    if (!merge || !row.staff_id) {
      passthrough.push(row);
      continue;
    }
    const key = `${row.staff_id}|${String(row.work_date).slice(0, 10)}`;
    const list = flexibleGroups.get(key) ?? [];
    list.push(row);
    flexibleGroups.set(key, list);
  }

  const collapsed: AttendanceHrReportRow[] = [];
  for (const group of flexibleGroups.values()) {
    if (group.length === 1) {
      collapsed.push(group[0]!);
      continue;
    }
    const ranked = [...group].sort((a, b) => flexibleDayRowScore(b) - flexibleDayRowScore(a));
    const winner = ranked[0]!;
    let actualIn = winner.actual_in;
    let actualOut = winner.actual_out;
    let worked = winner.worked_minutes;
    let punchCount = winner.punch_count;
    let overtime = winner.overtime_minutes;
    // Roster shift times: keep winner's when set, else first sibling with times.
    let scheduledIn = winner.scheduled_in ?? null;
    let scheduledOut = winner.scheduled_out ?? null;
    for (const row of ranked.slice(1)) {
      actualIn = earlierIso(actualIn, row.actual_in);
      actualOut = laterIso(actualOut, row.actual_out);
      if (row.worked_minutes != null && (worked == null || Number(row.worked_minutes) > Number(worked))) {
        worked = row.worked_minutes;
      }
      punchCount = Math.max(Number(punchCount) || 0, Number(row.punch_count) || 0);
      overtime = Math.max(Number(overtime) || 0, Number(row.overtime_minutes) || 0);
      if (!scheduledIn && row.scheduled_in) scheduledIn = row.scheduled_in;
      if (!scheduledOut && row.scheduled_out) scheduledOut = row.scheduled_out;
    }
    // Hours from merged clock span so stale worked_minutes cannot zero-out a real in/out pair.
    if (actualIn && actualOut) {
      const mins = Math.round(
        (new Date(actualOut).getTime() - new Date(actualIn).getTime()) / 60_000,
      );
      if (Number.isFinite(mins) && mins >= 0) worked = mins;
    }
    // Missed punch only when a side is actually missing — never OR stale ABSENT siblings.
    const missed = Boolean(actualIn) !== Boolean(actualOut);
    const late = resolveListingLateMinutes({
      actualIn,
      rosterScheduledIn: scheduledIn,
      reportingTimeMinutes: winner.location_reporting_time_minutes,
      bufferMinutes: winner.location_buffer_minutes,
      lateFromShiftStart: Boolean(winner.flexible_attendance),
    });
    let status = winner.status;
    if (missed) status = "missed_punch";
    else if (actualIn && actualOut) {
      status = resolveHoursBasedAttendanceStatus({
        status: winner.status,
        missed_punch: false,
        actual_in: actualIn,
        actual_out: actualOut,
        worked_minutes: worked,
        late_minutes: late,
        expected_minutes: winner.expected_minutes,
        employment_type: winner.employment_type,
        flexible_attendance: winner.flexible_attendance,
        sitePolicy: {
          permanentHours: winner.permanent_hours,
          secondmentHours: winner.secondment_hours,
          jokerHours: winner.joker_hours,
        },
      });
    }
    // In/out site + device user: prefer the row that owns earliest in / latest out.
    const inOwner =
      [...ranked]
        .filter((r) => r.actual_in)
        .sort(
          (a, b) =>
            new Date(a.actual_in!).getTime() - new Date(b.actual_in!).getTime(),
        )[0] ?? winner;
    const outOwner =
      [...ranked]
        .filter((r) => r.actual_out)
        .sort(
          (a, b) =>
            new Date(b.actual_out!).getTime() - new Date(a.actual_out!).getTime(),
        )[0] ?? inOwner;
    const checkInCode =
      inOwner.check_in_location_code ?? inOwner.location_code ?? winner.check_in_location_code ?? null;
    const checkOutCode =
      outOwner.check_out_location_code ?? outOwner.location_code ?? winner.check_out_location_code ?? null;
    const checkInBio =
      inOwner.check_in_biometric_user_id ??
      inOwner.biometric_user_id ??
      winner.check_in_biometric_user_id ??
      winner.biometric_user_id ??
      null;
    const checkOutBio =
      outOwner.check_out_biometric_user_id ??
      outOwner.biometric_user_id ??
      winner.check_out_biometric_user_id ??
      winner.biometric_user_id ??
      null;
    collapsed.push({
      ...winner,
      status,
      actual_in: actualIn,
      actual_out: actualOut,
      scheduled_in: scheduledIn,
      scheduled_out: scheduledOut,
      worked_minutes: worked,
      punch_count: punchCount,
      overtime_minutes: overtime,
      late_minutes: late,
      missed_punch: missed,
      check_in_location_code: checkInCode,
      check_out_location_code: checkOutCode,
      check_in_biometric_user_id: checkInBio,
      check_out_biometric_user_id: checkOutBio,
      biometric_user_id: checkInBio ?? checkOutBio ?? winner.biometric_user_id,
    });
  }

  return [...passthrough, ...collapsed].sort((a, b) => {
    const dateCmp = String(b.work_date).localeCompare(String(a.work_date));
    if (dateCmp !== 0) return dateCmp;
    return String(a.staff_name ?? a.id).localeCompare(String(b.staff_name ?? b.id), undefined, {
      sensitivity: "base",
    });
  });
}

export function attendanceHrToListingSource(
  row: AttendanceHrReportRow,
  unmapped = "Unmapped",
): {
  id: string;
  staffKey: string;
  locationId: string;
  locationLabel: string;
  userName: string;
  userNameUnmapped: boolean;
  deviceUserId: string | null;
  deviceName: string | null;
  biometricMappingId: string | null;
  employeeCode: string | null;
  qid: string | null;
  work_date: string;
  actual_in: string | null;
  actual_out: string | null;
  scheduled_in: string | null;
  scheduled_out: string | null;
  reporting_time_minutes: number | null;
  overtime_minutes: number;
  late_minutes: number;
  worked_minutes: number | null;
  break_minutes: number;
  expected_minutes: number | null;
  employment_type: string | null;
  flexible_attendance: boolean;
  status: string;
  missed_punch: boolean;
} {
  const mappedName = row.staff_name?.trim() ?? "";
  const deviceName = row.device_name?.trim() || null;
  const role = normalizeAttendanceEmploymentRole(row.employment_type);
  const expected =
    row.expected_minutes != null && Number.isFinite(Number(row.expected_minutes))
      ? Math.round(Number(row.expected_minutes))
      : expectedShiftMinutes(role, {
          permanentHours: row.permanent_hours,
          secondmentHours: row.secondment_hours,
          jokerHours: row.joker_hours,
        });
  return {
    id: row.id,
    staffKey: attendanceHrIdentityKey(row),
    locationId: row.location_id,
    locationLabel: attendanceHrListingLocation(row),
    userName: attendanceHrDisplayStaffName(row, unmapped),
    userNameUnmapped: !mappedName,
    deviceUserId: attendanceHrListingDeviceUserId(row),
    deviceName,
    biometricMappingId: row.biometric_mapping_id ?? null,
    employeeCode: row.employee_code,
    qid: row.qid,
    work_date: row.work_date,
    actual_in: row.actual_in,
    actual_out: row.actual_out,
    scheduled_in: row.scheduled_in ?? null,
    scheduled_out: row.scheduled_out ?? null,
    reporting_time_minutes:
      row.location_reporting_time_minutes != null &&
      Number.isFinite(Number(row.location_reporting_time_minutes))
        ? Number(row.location_reporting_time_minutes)
        : null,
    overtime_minutes: row.overtime_minutes,
    late_minutes: Number(row.late_minutes ?? 0),
    worked_minutes: row.worked_minutes,
    break_minutes: breakMinutesForLocation(row.location_code, row.location_break_minutes),
    expected_minutes: expected,
    employment_type: row.employment_type,
    flexible_attendance: Boolean(row.flexible_attendance),
    status: row.status,
    missed_punch: row.missed_punch,
  };
}

export type AttendanceHrReportKpis = {
  total: number;
  uniqueStaff: number;
  present: number;
  absent: number;
  late: number;
  missedPunch: number;
  unscheduled: number;
};

/** Stable staff identity for KPI unique-staff and attendance grid rows. */
export function attendanceHrIdentityKey(row: AttendanceHrReportRow): string {
  if (row.staff_id) return `staff:${row.staff_id}`;
  if (row.biometric_user_id) return `bio:${row.location_id}:${row.biometric_user_id}`;
  return `row:${row.id}`;
}

/**
 * Counts for the HR reports KPI strip. Uses the same filtered rows as the table.
 * Staff = distinct mapped employees only — unmapped biometric identities must not inflate this tile.
 */
export function computeAttendanceHrReportKpis(rows: AttendanceHrReportRow[]): AttendanceHrReportKpis {
  const mappedStaff = new Set<string>();
  let present = 0;
  let absent = 0;
  let late = 0;
  let missedPunch = 0;
  let unscheduled = 0;

  for (const row of rows) {
    if (row.staff_id) mappedStaff.add(String(row.staff_id));
    const listing = attendanceHrToListingSource(row);
    const resolved = resolveHoursBasedAttendanceStatus(listing);
    if (resolved === "present" || resolved === "overtime") present += 1;
    if (resolved === "absent") absent += 1;
    if (resolved === "late" || Number(row.late_minutes) > 0) late += 1;
    if (resolved === "missed_punch") missedPunch += 1;
    if (resolved === "unscheduled") unscheduled += 1;
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

/** True when the daily row is linked to a real staff record (not a bare device user). */
export function isMappedAttendanceHrRow(row: Pick<AttendanceHrReportRow, "staff_id">): boolean {
  return Boolean(row.staff_id);
}

/**
 * Default attendance listing hides staff who left (`terminated` / `inactive`).
 * Unmapped punches (no staff_id) stay visible. Matches dashboard roster via isActiveRosterStaff
 * (active, on_leave, serving_notice still show).
 */
export function attendanceHrIncludesStaffInListing(
  staffId: string | null | undefined,
  staffStatus: string | null | undefined,
): boolean {
  if (!staffId) return true;
  return isActiveRosterStaff(staffStatus);
}

/**
 * Reports site chip: every listed/KPI row must match the selected location_id,
 * or (flexible) the check-in / check-out punch site for that day.
 */
export function attendanceHrRowMatchesLocation(
  row: Pick<
    AttendanceHrReportRow,
    "location_id" | "check_in_location_id" | "check_out_location_id"
  >,
  locationId: string | null | undefined,
): boolean {
  if (!locationId) return true;
  if (row.location_id === locationId) return true;
  if (row.check_in_location_id === locationId) return true;
  if (row.check_out_location_id === locationId) return true;
  return false;
}
