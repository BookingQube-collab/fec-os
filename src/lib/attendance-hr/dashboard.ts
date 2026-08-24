import { CANONICAL_LOCATION_CODES } from "@/lib/locations/normalize";
import { isActiveRosterStaff } from "@/lib/staff-status";

import { assignAttendanceDate, calculateDailyAttendance } from "./calculate";
import { DEFAULT_SHIFT } from "./constants";
import { subjectKey } from "./hash";
import { enumerateYmd, monthBounds } from "./roster-period";

export { enumerateYmd, monthBounds };

export type AttendanceDashboardDayRow = {
  location_id: string;
  staff_id: string | null;
  biometric_user_id: string | null;
  work_date?: string;
  actual_in: string | null;
  actual_out: string | null;
  status: string;
  late_minutes: number;
  missed_punch: boolean;
  punch_count: number;
};

export type AttendanceDashboardSite = {
  locationId: string;
  code: string;
  name: string;
  region: string | null;
  in: number;
  out: number;
  late: number;
};

export type AttendanceDashboardPunch = {
  location_id: string;
  staff_id: string | null;
  biometric_user_id: string;
  device_id: string;
  punch_at: string;
  probable_duplicate?: boolean | null;
  excluded_from_calc?: boolean | null;
  attendance_date?: string | null;
};

export type RosterStaffRow = {
  id: string;
  location_id: string;
  status: string | null;
};

export function qatarTodayYmd(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

export function pickDashboardPeriod(input: {
  dateFrom?: string | null;
  dateTo?: string | null;
  month?: string | null;
  date?: string | null;
  today: string;
  latestPunchDate: string | null;
}): { dateFrom: string; dateTo: string; month: string; usedImportedPeriod: boolean } {
  if (input.dateFrom && input.dateTo) {
    return {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      month: input.dateFrom.slice(0, 7),
      usedImportedPeriod: true,
    };
  }
  if (input.date) {
    return { dateFrom: input.date, dateTo: input.date, month: input.date.slice(0, 7), usedImportedPeriod: false };
  }
  if (input.month && /^\d{4}-\d{2}$/.test(input.month)) {
    return { ...monthBounds(input.month), month: input.month, usedImportedPeriod: false };
  }
  if (input.latestPunchDate) {
    const month = input.latestPunchDate.slice(0, 7);
    return { ...monthBounds(month), month, usedImportedPeriod: true };
  }
  const month = input.today.slice(0, 7);
  return { ...monthBounds(month), month, usedImportedPeriod: false };
}

/** @deprecated single-day helper kept for tests; prefer pickDashboardPeriod */
export function pickDashboardDate(input: {
  requested?: string | null;
  today: string;
  todayPunchCount: number;
  latestPunchDate: string | null;
}): { date: string; usedLatestPunch: boolean } {
  const requested = input.requested?.trim();
  if (requested) return { date: requested, usedLatestPunch: false };
  if (input.todayPunchCount > 0) return { date: input.today, usedLatestPunch: false };
  if (input.latestPunchDate) return { date: input.latestPunchDate, usedLatestPunch: true };
  return { date: input.today, usedLatestPunch: false };
}

export function punchWorkDate(punch: Pick<AttendanceDashboardPunch, "attendance_date" | "punch_at">): string {
  const dated = punch.attendance_date ? String(punch.attendance_date).slice(0, 10) : "";
  if (dated) return dated;
  return assignAttendanceDate(punch.punch_at, DEFAULT_SHIFT);
}

export function isCheckedIn(row: Pick<AttendanceDashboardDayRow, "actual_in" | "punch_count">): boolean {
  return Boolean(row.actual_in) || Number(row.punch_count) > 0;
}

export function isCheckedOut(row: Pick<AttendanceDashboardDayRow, "actual_out">): boolean {
  return Boolean(row.actual_out);
}

/** Mapped staff with in and out (complete). Unmapped never count as Present. */
export function isMappedPresent(row: AttendanceDashboardDayRow): boolean {
  return Boolean(row.staff_id) && isCheckedIn(row) && !row.missed_punch && row.status !== "absent";
}

export function isMappedMissed(row: AttendanceDashboardDayRow): boolean {
  return Boolean(row.staff_id) && Boolean(row.missed_punch);
}

export function isMappedLate(row: AttendanceDashboardDayRow): boolean {
  return Boolean(row.staff_id) && Number(row.late_minutes) > 0;
}

export function isMappedAbsent(row: AttendanceDashboardDayRow): boolean {
  return Boolean(row.staff_id) && row.status === "absent";
}

/** Active / on_leave / blank roster, not terminated. Scope to home site or attached work sites. */
export function countRosterEmployees(
  staff: RosterStaffRow[],
  options?: { locationId?: string | null; workStaffIds?: Iterable<string> },
): number {
  return expectedStaffIds(staff, options).length;
}

export function expectedStaffIds(
  staff: RosterStaffRow[],
  options?: { locationId?: string | null; workStaffIds?: Iterable<string> },
): string[] {
  const locationId = options?.locationId ?? null;
  const workIds = new Set(options?.workStaffIds ?? []);
  const ids: string[] = [];
  for (const row of staff) {
    if (!isActiveRosterStaff(row.status)) continue;
    if (locationId && row.location_id !== locationId && !workIds.has(row.id)) continue;
    ids.push(row.id);
  }
  return ids;
}

export function orderCanonicalLocations<T extends { id: string; code: string }>(locations: T[]): T[] {
  const byCode = new Map(locations.map((loc) => [loc.code, loc]));
  const ordered: T[] = [];
  for (const code of CANONICAL_LOCATION_CODES) {
    const loc = byCode.get(code);
    if (loc) ordered.push(loc);
  }
  for (const loc of locations) {
    if (!ordered.some((row) => row.id === loc.id)) ordered.push(loc);
  }
  return ordered;
}

export function mergeAttendanceSites(
  rosterLocations: Array<{ id: string; code: string; name: string; region?: string | null; status?: string | null }>,
  settings: Array<{ location_id: string }>,
): Array<{ id: string; code: string; name: string; region: string | null }> {
  const byId = new Map(rosterLocations.map((loc) => [loc.id, loc]));
  for (const setting of settings) {
    if (!byId.has(setting.location_id)) {
      byId.set(setting.location_id, {
        id: setting.location_id,
        code: setting.location_id,
        name: setting.location_id,
        region: null,
      });
    }
  }
  return orderCanonicalLocations([...byId.values()]).map((loc) => ({
    id: loc.id,
    code: loc.code,
    name: loc.name,
    region: loc.region ?? null,
  }));
}

export function summaryToDayRow(row: {
  location_id: string;
  staff_id?: string | null;
  biometric_user_id?: string | null;
  work_date?: string | null;
  actual_in?: string | null;
  actual_out?: string | null;
  status?: string | null;
  late_minutes?: number | null;
  missed_punch?: boolean | null;
  punch_count?: number | null;
}): AttendanceDashboardDayRow {
  return {
    location_id: row.location_id,
    staff_id: row.staff_id ?? null,
    biometric_user_id: row.biometric_user_id ?? null,
    work_date: row.work_date ? String(row.work_date).slice(0, 10) : undefined,
    actual_in: row.actual_in ?? null,
    actual_out: row.actual_out ?? null,
    status: String(row.status ?? ""),
    late_minutes: Number(row.late_minutes ?? 0),
    missed_punch: Boolean(row.missed_punch),
    punch_count: Number(row.punch_count ?? 0),
  };
}

export function dayRowsFromPunches(punches: AttendanceDashboardPunch[], workDate: string): AttendanceDashboardDayRow[] {
  return dayRowsFromPunchesInRange(punches, workDate, workDate);
}

export function dayRowsFromPunchesInRange(
  punches: AttendanceDashboardPunch[],
  dateFrom: string,
  dateTo: string,
): AttendanceDashboardDayRow[] {
  const groups = new Map<string, AttendanceDashboardPunch[]>();
  for (const punch of punches) {
    const day = punchWorkDate(punch);
    if (day < dateFrom || day > dateTo) continue;
    const subject = subjectKey(punch.staff_id, punch.device_id, punch.biometric_user_id);
    const key = `${punch.location_id}|${subject}|${day}`;
    const list = groups.get(key) ?? [];
    list.push(punch);
    groups.set(key, list);
  }

  const rows: AttendanceDashboardDayRow[] = [];
  for (const [key, list] of groups) {
    const sample = list[0];
    const workDate = key.split("|").at(-1) ?? dateFrom;
    const calc = calculateDailyAttendance(
      list.map((punch) => ({
        punchAt: punch.punch_at,
        probableDuplicate: Boolean(punch.probable_duplicate),
        excludedFromCalc: Boolean(punch.excluded_from_calc),
      })),
      { workDate, scheduled: Boolean(sample.staff_id), shift: DEFAULT_SHIFT },
    );
    rows.push({
      location_id: sample.location_id,
      staff_id: sample.staff_id,
      biometric_user_id: sample.biometric_user_id,
      work_date: workDate,
      actual_in: calc.actualIn,
      actual_out: calc.actualOut,
      status: calc.status,
      late_minutes: calc.lateMinutes,
      missed_punch: calc.missedPunch,
      punch_count: calc.validPunchCount,
    });
  }
  return rows;
}

/** Expected staff with no punch row on a date become Absent (no invented punches). */
export function buildAbsentRowsForPeriod(input: {
  locationId: string;
  dates: string[];
  expectedStaffIds: string[] | ReadonlyMap<string, readonly string[]>;
  existing: AttendanceDashboardDayRow[];
}): AttendanceDashboardDayRow[] {
  const covered = new Set<string>();
  for (const row of input.existing) {
    if (row.location_id !== input.locationId || !row.staff_id) continue;
    const day = row.work_date;
    if (day) covered.add(`${row.staff_id}|${day}`);
  }
  const idsForDay = (day: string): readonly string[] => {
    if (Array.isArray(input.expectedStaffIds)) return input.expectedStaffIds;
    return input.expectedStaffIds.get(day) ?? [];
  };
  const rows: AttendanceDashboardDayRow[] = [];
  for (const day of input.dates) {
    for (const staffId of idsForDay(day)) {
      if (covered.has(`${staffId}|${day}`)) continue;
      rows.push({
        location_id: input.locationId,
        staff_id: staffId,
        biometric_user_id: null,
        work_date: day,
        actual_in: null,
        actual_out: null,
        status: "absent",
        late_minutes: 0,
        missed_punch: false,
        punch_count: 0,
      });
      covered.add(`${staffId}|${day}`);
    }
  }
  return rows;
}

export function aggregateDashboardPeriod(
  rows: AttendanceDashboardDayRow[],
  sites: Array<{ id: string; code: string; name: string; region?: string | null }>,
  kpiLocationId?: string | null,
): {
  present: number;
  absent: number;
  late: number;
  missedPunches: number;
  bySite: AttendanceDashboardSite[];
} {
  const kpiRows = kpiLocationId ? rows.filter((row) => row.location_id === kpiLocationId) : rows;
  return {
    present: kpiRows.filter(isMappedPresent).length,
    absent: kpiRows.filter(isMappedAbsent).length,
    late: kpiRows.filter(isMappedLate).length,
    missedPunches: kpiRows.filter(isMappedMissed).length,
    bySite: sites.map((site) => {
      const siteRows = rows.filter((row) => row.location_id === site.id);
      return {
        locationId: site.id,
        code: site.code,
        name: site.name,
        region: site.region ?? null,
        in: siteRows.filter(isCheckedIn).length,
        out: siteRows.filter(isCheckedOut).length,
        late: siteRows.filter(isMappedLate).length,
      };
    }),
  };
}

export const aggregateDashboardDay = aggregateDashboardPeriod;

export type AttendanceWatchlistLeader = {
  id: string;
  count: number;
  locationId: string | null;
};

export type AttendanceWatchlistEntry = {
  id: string;
  count: number;
  name: string;
  locationId: string | null;
  locationName: string | null;
  locationRegion: string | null;
  locationCode: string | null;
};

export function frequentExceptionLeaders(
  rows: Array<{
    staff_id: string | null;
    location_id?: string | null;
    biometric_user_id?: string | null;
    late_minutes?: number | null;
    missed_punch?: boolean | null;
  }>,
  kind: "late" | "missed",
  limit = 8,
): AttendanceWatchlistLeader[] {
  const counts = new Map<string, number>();
  const locCounts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.staff_id) continue;
    const hit = kind === "late" ? Number(row.late_minutes) > 0 : Boolean(row.missed_punch);
    if (!hit) continue;
    counts.set(row.staff_id, (counts.get(row.staff_id) ?? 0) + 1);
    const locationId = row.location_id?.trim();
    if (!locationId) continue;
    const byLoc = locCounts.get(row.staff_id) ?? new Map<string, number>();
    byLoc.set(locationId, (byLoc.get(locationId) ?? 0) + 1);
    locCounts.set(row.staff_id, byLoc);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => {
      const byLoc = locCounts.get(id);
      const locationId = byLoc
        ? [...byLoc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
        : null;
      return { id, count, locationId };
    });
}

export function enrichWatchlistEntries(
  leaders: AttendanceWatchlistLeader[],
  staff: Array<{ id: string; full_name?: string | null; location_id?: string | null }>,
  sites: Array<{ id: string; code: string; name: string; region?: string | null }>,
): AttendanceWatchlistEntry[] {
  const staffById = new Map(staff.map((row) => [row.id, row]));
  const siteById = new Map(sites.map((site) => [site.id, site]));
  return leaders.map((row) => {
    const person = staffById.get(row.id);
    const preferredIds = [row.locationId, person?.location_id ?? null];
    let locationId: string | null = null;
    let site: { id: string; code: string; name: string; region?: string | null } | undefined;
    for (const candidate of preferredIds) {
      if (!candidate) continue;
      const found = siteById.get(candidate);
      if (found) {
        locationId = candidate;
        site = found;
        break;
      }
    }
    return {
      id: row.id,
      count: row.count,
      name: person?.full_name?.trim() || row.id.slice(0, 8),
      locationId,
      locationName: site?.name ?? null,
      locationRegion: site?.region ?? null,
      locationCode: site?.code ?? null,
    };
  });
}

/** Site name plus mall/region, matching Attendance by site. Never invents a venue. */
export function formatWatchlistLocation(
  entry: Pick<AttendanceWatchlistEntry, "locationName" | "locationRegion" | "locationCode">,
): string | null {
  const name = entry.locationName?.trim() || null;
  const region = entry.locationRegion?.trim() || null;
  const code = entry.locationCode?.trim() || null;
  if (name && region) return `${name} · ${region}`;
  return name || code || null;
}
