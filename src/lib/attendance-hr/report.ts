import { formatLocationLabel, formatLocationName, rosterSheetLabel } from "@/lib/locations/normalize";
import { breakMinutesForLocation, expectedShiftMinutes, normalizeAttendanceEmploymentRole } from "@/lib/attendance-hr/shift-policy";
import { resolveHoursBasedAttendanceStatus } from "@/lib/attendance-display";
import {
  formatFlexibleCrossSiteDeviceUserLabel,
  formatFlexibleCrossSiteLocationLabel,
} from "@/lib/attendance-hr/flexible-cross-site";
import { resolveListingLateMinutes } from "@/lib/attendance-hr/late-punch";
import { suppressAbsentWhenPunchedSameDay } from "@/lib/attendance-hr/punch-over-absent";
import {
  attendanceSharedKpiFlags,
  computeSharedAttendanceKpis,
  type AttendanceSharedKpis,
} from "@/lib/attendance-hr/shared-kpis";
import { isActiveRosterStaff, isJokerStaffStatus } from "@/lib/staff-status";

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
  /**
   * On-duty roster assignment for this staff+day (not week-off).
   * Used so punchless jokers stay Absent when rostered even if shift times are blank.
   */
  has_roster_assignment?: boolean;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  missed_punch: boolean;
  punch_count: number;
  worked_minutes: number | null;
  employment_type: string | null;
  staff_name: string | null;
  /** staff.department when mapped — export / employee summary. */
  department?: string | null;
  /** staff.job_title when mapped — export / employee summary. */
  job_title?: string | null;
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
  /** staff.hire_date from the people directory. Days before this are not absences. */
  hire_date?: string | null;
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
  if (status === "present" || status === "late" || status === "overtime" || status === "short_hours") score += 10;
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
    // Incomplete sides → Missed punch only after Qatar day close (open day stays Working).
    const incomplete = Boolean(actualIn) !== Boolean(actualOut);
    const late = resolveListingLateMinutes({
      actualIn,
      rosterScheduledIn: scheduledIn,
      reportingTimeMinutes: winner.location_reporting_time_minutes,
      bufferMinutes: winner.location_buffer_minutes,
      lateFromShiftStart: Boolean(winner.flexible_attendance),
    });
    let status = winner.status;
    if (incomplete || (actualIn && actualOut)) {
      status = resolveHoursBasedAttendanceStatus({
        status: winner.status,
        missed_punch: incomplete,
        actual_in: actualIn,
        actual_out: actualOut,
        worked_minutes: worked,
        late_minutes: late,
        expected_minutes: winner.expected_minutes,
        employment_type: winner.employment_type,
        flexible_attendance: winner.flexible_attendance,
        work_date: winner.work_date,
        scheduled_in: scheduledIn,
        scheduled_out: scheduledOut,
        hire_date: winner.hire_date,
        sitePolicy: {
          permanentHours: winner.permanent_hours,
          secondmentHours: winner.secondment_hours,
          jokerHours: winner.joker_hours,
        },
      });
    }
    const missed = status === "missed_punch";
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
      has_roster_assignment:
        ranked.some((r) => r.has_roster_assignment) || Boolean(scheduledIn || scheduledOut),
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
  hasRosterAssignment: boolean;
  reporting_time_minutes: number | null;
  overtime_minutes: number;
  late_minutes: number;
  worked_minutes: number | null;
  break_minutes: number;
  expected_minutes: number | null;
  employment_type: string | null;
  flexible_attendance: boolean;
  hire_date: string | null;
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
    hasRosterAssignment: Boolean(
      row.has_roster_assignment ?? (row.scheduled_in || row.scheduled_out),
    ),
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
    hire_date: row.hire_date ?? null,
    status: row.status,
    missed_punch: row.missed_punch,
  };
}

export type AttendanceHrReportKpis = AttendanceSharedKpis;

/** Stable staff identity for KPI unique-staff and attendance grid rows. */
export function attendanceHrIdentityKey(row: AttendanceHrReportRow): string {
  if (row.staff_id) return `staff:${row.staff_id}`;
  if (row.biometric_user_id) return `bio:${row.location_id}:${row.biometric_user_id}`;
  return `row:${row.id}`;
}

/**
 * Counts for the HR reports KPI strip. Uses the same filtered rows as the table.
 * Staff = distinct mapped employees only — unmapped biometric identities must not inflate this tile.
 * Definitions live in {@link computeSharedAttendanceKpis} (shared with Dashboard).
 */
export function computeAttendanceHrReportKpis(rows: AttendanceHrReportRow[]): AttendanceHrReportKpis {
  return computeSharedAttendanceKpis(
    rows.map((row) => {
      const listing = attendanceHrToListingSource(row);
      return {
        staff_id: row.staff_id,
        status: listing.status,
        missed_punch: listing.missed_punch,
        actual_in: listing.actual_in,
        actual_out: listing.actual_out,
        late_minutes: listing.late_minutes,
        worked_minutes: listing.worked_minutes,
        break_minutes: listing.break_minutes,
        expected_minutes: listing.expected_minutes,
        employment_type: listing.employment_type,
        flexible_attendance: listing.flexible_attendance,
        work_date: listing.work_date,
        scheduled_in: listing.scheduled_in,
        scheduled_out: listing.scheduled_out,
        hasRosterAssignment: listing.hasRosterAssignment,
        hire_date: listing.hire_date,
      };
    }),
  );
}

/** True when the daily row is linked to a real staff record (not a bare device user). */
export function isMappedAttendanceHrRow(row: Pick<AttendanceHrReportRow, "staff_id">): boolean {
  return Boolean(row.staff_id);
}

/**
 * Month grid is a mapped-staff roster. Fall back to list when the grid would hide
 * rows the KPI strip / filters still count:
 * - Missed punch / Unscheduled / Incomplete drill-downs (force list — unmapped
 *   device users need the mapping table, not the roster matrix), or
 * - every match is unmapped, or
 * - another KPI card mixes mapped + unmapped (e.g. Late with orphan punches).
 */
export function attendanceHrReportsUseListView(
  viewMode: "grid" | "list",
  mappedRowCount: number,
  listingRowCount: number,
  options?: boolean | {
    /** Missed punch / Unscheduled / Incomplete — always list so device rows stay visible. */
    forceList?: boolean;
    /** Other KPI cards: list only when unmapped matches would be dropped. */
    preferListIfUnmappedHidden?: boolean;
  },
): boolean {
  // Legacy 4th-arg boolean = preferListIfUnmappedHidden (tests + older call sites).
  const opts =
    typeof options === "boolean"
      ? { preferListIfUnmappedHidden: options }
      : options ?? {};
  if (viewMode === "list" || opts.forceList) return true;
  if (opts.preferListIfUnmappedHidden && listingRowCount > mappedRowCount) return true;
  if (mappedRowCount > 0) return false;
  return listingRowCount > 0;
}

/** KPI / status filters that must use the list (unmapped device rows + map controls). */
export function attendanceHrFilterForcesListView(
  kpiFilter: AttendanceHrKpiFilter | null | undefined,
  status: string | null | undefined,
): boolean {
  if (kpiFilter === "missed_punch" || kpiFilter === "unscheduled") return true;
  return status === "missed_punch" || status === "unscheduled" || status === "incomplete";
}

/** Evidence that an exited person still belongs on the attendance listing for that day. */
export type AttendanceHrListingEvidence = {
  /** Device punches or timed in/out on the daily row. */
  hasPunches?: boolean;
  /** Shift roster assignment (or week-off) on that staff + date. */
  hasRoster?: boolean;
  /**
   * Soft-deleted merge archives (`staff.deleted_at`) stay out — keepers already hold
   * the canonical person-day. Real exits keep `deleted_at` null.
   */
  deletedAt?: string | null;
};

/**
 * Attendance listing keeps active / on_leave / serving_notice / joker staff.
 * Unmapped punches (no staff_id) stay visible (orphans collapsed separately when mapped).
 * Exited staff (`terminated` / `inactive` / resigned / contract finished / …) stay visible
 * when they punched or still have a roster row in range — do not hide punched history.
 * Soft-deleted merge duplicates never appear.
 */
export function attendanceHrIncludesStaffInListing(
  staffId: string | null | undefined,
  staffStatus: string | null | undefined,
  evidence?: AttendanceHrListingEvidence,
): boolean {
  if (!staffId) return true;
  if (evidence?.deletedAt) return false;
  if (isJokerStaffStatus(staffStatus)) return true;
  if (isActiveRosterStaff(staffStatus)) return true;
  return Boolean(evidence?.hasPunches || evidence?.hasRoster);
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

/** KPI strip keys that filter the reports table when clicked. */
export type AttendanceHrKpiFilter =
  | "total"
  | "staff"
  | "present"
  | "absent"
  | "late"
  | "missed_punch"
  | "unscheduled";

/**
 * Match a row to a KPI-strip filter using the same rules as
 * {@link computeAttendanceHrReportKpis}. `total` / `staff` keep every row.
 */
export function attendanceHrRowMatchesKpiFilter(
  row: AttendanceHrReportRow,
  filter: AttendanceHrKpiFilter | null | undefined,
): boolean {
  if (!filter || filter === "total" || filter === "staff") return true;
  const listing = attendanceHrToListingSource(row);
  const flags = attendanceSharedKpiFlags({
    staff_id: row.staff_id,
    status: listing.status,
    missed_punch: listing.missed_punch,
    actual_in: listing.actual_in,
    actual_out: listing.actual_out,
    late_minutes: listing.late_minutes,
    worked_minutes: listing.worked_minutes,
    break_minutes: listing.break_minutes,
    expected_minutes: listing.expected_minutes,
    employment_type: listing.employment_type,
    flexible_attendance: listing.flexible_attendance,
    work_date: listing.work_date,
    scheduled_in: listing.scheduled_in,
    scheduled_out: listing.scheduled_out,
    hasRosterAssignment: listing.hasRosterAssignment,
    hire_date: listing.hire_date,
  });
  switch (filter) {
    case "present":
      return flags.present;
    case "absent":
      return flags.absent;
    case "late":
      return flags.late;
    case "missed_punch":
      return flags.missedPunch;
    case "unscheduled":
      return flags.unscheduled;
    default:
      return true;
  }
}

function roamingRowHasUsablePunch(row: {
  actual_in?: unknown;
  actual_out?: unknown;
  punch_count?: unknown;
}): boolean {
  if (row.actual_in || row.actual_out) return true;
  return Number(row.punch_count ?? 0) > 0;
}

function roamingRowLooksAbsent(row: { status?: unknown }): boolean {
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return !status || status === "absent";
}

/**
 * Fix false ABSENT person-days for roaming / multisite staff when:
 * - any of their roster sites marks the day as week-off / rest → set status
 *   to weekly_off (do not drop — blank cells hide the rest day on the grid), or
 * - the roster has them on duty only at a different location → drop the
 *   punch-less ABSENT filler at this row's site (covered at the move site), or
 * - under a site chip, sibling punch-less ABSENT from another site was merged in
 *   (e.g. ABSENT CAR-AP while viewing INF-CC) → drop it; that Absent belongs on
 *   the destination site's own filter, not as a false cell here.
 * Keeps leave / punched / already-off / Present, and keeps punch-less ABSENT at
 * the site where they are actually rostered on duty (All locations + that site).
 */
export function suppressRoamingFalseAbsentForRosterElsewhere(input: {
  rows: Array<Record<string, unknown>>;
  roster: ListingGapRosterDay[];
  crossSiteStaffIds: ReadonlySet<string>;
  locationId?: string | null;
}): Array<Record<string, unknown>> {
  if (input.rows.length === 0) return input.rows;
  // Any staff: punch-less Absent must not sit beside a punched sibling the same day
  // (Ronald KDS Absent + INF Present; Agnes stale Absent after punches landed).
  const rows = suppressAbsentWhenPunchedSameDay(input.rows);
  if (!input.crossSiteStaffIds.size) return rows;

  /** staffId|day → location ids with on-duty (non week-off) roster that day. */
  const onDutyLocsByStaffDay = new Map<string, Set<string>>();
  /** staffId|day → location ids that uploaded rest/off that day. */
  const weekOffLocsByStaffDay = new Map<string, Set<string>>();
  for (const r of input.roster) {
    const staffId = String(r.staff_id ?? "").trim();
    const day = String(r.work_date ?? "").slice(0, 10);
    const loc = String(r.location_id ?? "").trim();
    if (!staffId || !day || !loc) continue;
    if (!input.crossSiteStaffIds.has(staffId)) continue;
    const key = `${staffId}|${day}`;
    if (r.is_week_off) {
      const locs = weekOffLocsByStaffDay.get(key) ?? new Set<string>();
      locs.add(loc);
      weekOffLocsByStaffDay.set(key, locs);
      continue;
    }
    const locs = onDutyLocsByStaffDay.get(key) ?? new Set<string>();
    locs.add(loc);
    onDutyLocsByStaffDay.set(key, locs);
  }
  const filterLoc = input.locationId?.trim() || "";
  if (onDutyLocsByStaffDay.size === 0 && weekOffLocsByStaffDay.size === 0 && !filterLoc) {
    return rows;
  }
  // Under a location filter we still walk rows to drop other-site Absents even
  // when on-duty / weekOff maps are empty (stale sibling ABSENT only).

  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    if (!staffId || !input.crossSiteStaffIds.has(staffId)) {
      out.push(row);
      continue;
    }
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!day || roamingRowHasUsablePunch(row) || !roamingRowLooksAbsent(row)) {
      out.push(row);
      continue;
    }
    const key = `${staffId}|${day}`;
    const weekOffLocs = weekOffLocsByStaffDay.get(key);
    // Rest/off on any roster site wins — show weekly_off, never Absent.
    if (weekOffLocs && weekOffLocs.size > 0) {
      const loc = String(row.location_id ?? "").trim();
      const weekOffAtRow = Boolean(loc && weekOffLocs.has(loc));
      // All locations: keep Off at the site that uploaded rest; drop home fillers
      // (Ma luz KDS absent + INF rest → one Off cell, not a duplicate home Off).
      if (!filterLoc && loc && !weekOffAtRow) {
        continue;
      }
      out.push({
        ...row,
        status: "weekly_off",
        missed_punch: false,
        late_minutes: 0,
        worked_minutes: 0,
      });
      continue;
    }
    const loc = String(row.location_id ?? "").trim();
    // Under a site chip: never surface punch-less ABSENT from another site
    // (Mani/Maanaliza: ABSENT CAR-AP must not appear on the INF-CC report).
    // Destination-site Absent is valid on All locations and on that destination filter.
    if (filterLoc && loc && loc !== filterLoc) {
      continue;
    }
    const onDutyLocs = onDutyLocsByStaffDay.get(key);
    const onDutyAtRowSite = Boolean(loc && onDutyLocs?.has(loc));
    const onDutyOnlyElsewhere = Boolean(
      onDutyLocs &&
        onDutyLocs.size > 0 &&
        !onDutyAtRowSite &&
        [...onDutyLocs].some((l) => l !== loc),
    );
    // Home / wrong-site punch-less ABSENT while rostered on duty only elsewhere → drop.
    // Keep when this row's site is an on-duty roster site (true Absent, visible under
    // All locations and under that site's chip).
    if (onDutyOnlyElsewhere) {
      continue;
    }
    out.push(row);
  }
  return out;
}

export type ListingGapRosterDay = {
  staff_id: string;
  location_id: string;
  work_date: string;
  is_week_off: boolean;
};

export type ListingGapPunchDay = {
  staff_id: string;
  location_id: string;
  work_date: string;
};

export type ListingGapLeaveDay = {
  staff_id: string;
  location_id: string;
  work_date: string;
  leave_type: string;
};

/**
 * staff_id|work_date keys for person-days that touched a site via roster and/or punch.
 * Used under a location chip so pure other-site-only days (e.g. Katrina UA-DM while
 * viewing INF-CC) stay out of listing + KPI totals.
 */
export function staffDaysTouchingLocation(input: {
  locationId: string;
  roster: readonly ListingGapRosterDay[];
  punchDays?: readonly ListingGapPunchDay[];
}): Set<string> {
  const out = new Set<string>();
  const loc = input.locationId.trim();
  if (!loc) return out;
  for (const row of input.roster) {
    const staffId = String(row.staff_id ?? "").trim();
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !day) continue;
    if (String(row.location_id ?? "").trim() !== loc) continue;
    out.add(`${staffId}|${day}`);
  }
  for (const row of input.punchDays ?? []) {
    const staffId = String(row.staff_id ?? "").trim();
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !day) continue;
    if (String(row.location_id ?? "").trim() !== loc) continue;
    out.add(`${staffId}|${day}`);
  }
  return out;
}

/**
 * Site chip: keep same-site summaries, plus other-site sibling rows only when that
 * staff|day touched the selected location (roster/punch) — preserves journey labels
 * like UA-DM → INF-CC without importing pure other-site-only days.
 */
export function filterAttendanceRowsToLocationTouches(input: {
  rows: Array<Record<string, unknown>>;
  locationId: string | null | undefined;
  touchedStaffDays: ReadonlySet<string>;
}): Array<Record<string, unknown>> {
  const loc = input.locationId?.trim() || "";
  if (!loc) return input.rows;
  return input.rows.filter((row) => {
    const rowLoc = String(row.location_id ?? "").trim();
    if (rowLoc === loc) return true;
    const staffId = typeof row.staff_id === "string" ? row.staff_id.trim() : "";
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !day) return false;
    return input.touchedStaffDays.has(`${staffId}|${day}`);
  });
}

const LISTING_GAP_LEAVE_STATUSES = new Set([
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
  "comp_off",
]);

/**
 * Listing reads attendance_daily_summary only. Process can skip a person-day
 * (flexible cross-site "covered" without a mapped write) so roster / raw-punch
 * / leave days vanish. Append synthetic shells; enrich attaches shift times,
 * leave, and punches.
 */
export function appendMissingRosterAndPunchSummaryRows(input: {
  rows: Array<Record<string, unknown>>;
  roster: ListingGapRosterDay[];
  punchDays: ListingGapPunchDay[];
  leaveDays?: ListingGapLeaveDay[];
  locationId?: string | null;
}): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  for (const row of input.rows) {
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    const day = String(row.work_date ?? "").slice(0, 10);
    if (staffId && day) seen.add(`${staffId}|${day}`);
  }

  const locationId = input.locationId ?? null;
  const pending = new Map<
    string,
    {
      location_id: string;
      is_week_off: boolean;
      leave_type: string | null;
      /** Raw punches exist — keep through suppressAbsentWithoutOnDutyRoster until enrich attaches times. */
      from_punch: boolean;
    }
  >();

  for (const r of input.roster) {
    const staffId = String(r.staff_id ?? "").trim();
    const day = String(r.work_date ?? "").slice(0, 10);
    const loc = String(r.location_id ?? "").trim();
    if (!staffId || !day || !loc) continue;
    if (locationId && loc !== locationId) continue;
    const key = `${staffId}|${day}`;
    if (seen.has(key)) continue;
    const prev = pending.get(key);
    if (!prev) {
      pending.set(key, {
        location_id: loc,
        is_week_off: Boolean(r.is_week_off),
        leave_type: null,
        from_punch: false,
      });
    } else if (r.is_week_off && !prev.is_week_off && !prev.leave_type) {
      pending.set(key, {
        location_id: loc,
        is_week_off: true,
        leave_type: null,
        from_punch: prev.from_punch,
      });
    }
  }

  for (const leave of input.leaveDays ?? []) {
    const staffId = String(leave.staff_id ?? "").trim();
    const day = String(leave.work_date ?? "").slice(0, 10);
    const loc = String(leave.location_id ?? "").trim();
    const leaveType = String(leave.leave_type ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (!staffId || !day || !loc || !LISTING_GAP_LEAVE_STATUSES.has(leaveType)) continue;
    if (locationId && loc !== locationId) continue;
    const key = `${staffId}|${day}`;
    if (seen.has(key)) continue;
    // Leave wins over roster week-off / absent shells for the same person-day.
    pending.set(key, {
      location_id: loc,
      is_week_off: false,
      leave_type: leaveType,
      from_punch: false,
    });
  }

  for (const p of input.punchDays) {
    const staffId = String(p.staff_id ?? "").trim();
    const day = String(p.work_date ?? "").slice(0, 10);
    const loc = String(p.location_id ?? "").trim();
    if (!staffId || !day || !loc) continue;
    if (locationId && loc !== locationId) continue;
    const key = `${staffId}|${day}`;
    if (seen.has(key)) continue;
    const prev = pending.get(key);
    if (!prev) {
      pending.set(key, {
        location_id: loc,
        is_week_off: false,
        leave_type: null,
        from_punch: true,
      });
      continue;
    }
    // Punch evidence on a roster Absent shell — do not drop before enrich hydrates times.
    if (!prev.leave_type) {
      pending.set(key, { ...prev, from_punch: true, location_id: prev.location_id || loc });
    }
  }

  if (pending.size === 0) return input.rows;

  const extras: Array<Record<string, unknown>> = [];
  for (const [key, meta] of pending) {
    const sep = key.lastIndexOf("|");
    const staffId = key.slice(0, sep);
    const workDate = key.slice(sep + 1);
    const status = meta.leave_type
      ? meta.leave_type
      : meta.is_week_off
        ? "weekly_off"
        : "absent";
    extras.push({
      id: `gap:${staffId}:${workDate}:${meta.location_id}`,
      location_id: meta.location_id,
      staff_id: staffId,
      work_date: workDate,
      status,
      actual_in: null,
      actual_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      missed_punch: false,
      // Hint for suppressAbsentWithoutOnDutyRoster (rowHasUsablePunch) until enrich fills times.
      punch_count: meta.from_punch ? 1 : 0,
      worked_minutes: meta.is_week_off || meta.leave_type ? 0 : null,
      biometric_user_id: null,
      device_id: null,
      subject_key: `staff:${staffId}`,
    });
  }
  return [...input.rows, ...extras];
}
