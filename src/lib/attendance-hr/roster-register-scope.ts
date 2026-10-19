import { enumerateYmd } from "@/lib/attendance-hr/roster-period";
import {
  isActiveStaffStatus,
  isJokerStaffStatus,
  isOnLeaveStaffStatus,
  isServingNoticeStaffStatus,
} from "@/lib/staff-status";

export type RosterRegisterSource = "upload" | "amend" | "manual" | "copied";

export type RosterRegisterScopeFilters = {
  locationId?: string | null;
  staffId?: string | null;
  departmentId?: string | null;
  /** Departments to hide. Empty means every department stays on the roster. */
  excludedDepartmentIds?: readonly string[] | null;
  sourceUploadOnly?: boolean;
  source?: RosterRegisterSource | null;
  search?: string | null;
};

export type RosterStaffDepartmentLink = {
  staffId: string;
  departmentId: string;
};

export type RosterRegisterSearchRow = {
  staffName?: string | null;
  employeeCode?: string | null;
  qid?: string | null;
  locationCode?: string | null;
  workDate?: string | null;
  source?: string | null;
};

export type RosterMatrixStaff = {
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  qid: string | null;
};

export type RosterMatrixMonthSpan = {
  monthKey: string;
  startIdx: number;
  count: number;
};

export function rosterMatrixCellKey(staffId: string, workDate: string) {
  return `${staffId}|${workDate}`;
}

export function isWeekendYmd(ymd: string): boolean {
  const day = new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Consecutive date columns grouped by calendar month (YYYY-MM). */
export function rosterMonthSpans(dates: string[]): RosterMatrixMonthSpan[] {
  const spans: RosterMatrixMonthSpan[] = [];
  for (let i = 0; i < dates.length; i++) {
    const monthKey = dates[i]!.slice(0, 7);
    const last = spans[spans.length - 1];
    if (last && last.monthKey === monthKey) {
      last.count += 1;
    } else {
      spans.push({ monthKey, startIdx: i, count: 1 });
    }
  }
  return spans;
}

/**
 * An empty period still shows day columns when the viewer can add a shift.
 * People who cannot amend keep the text empty state.
 */
export function rosterEmptyPeriodShowsDayGrid(rowCount: number, canAmend: boolean): boolean {
  return rowCount === 0 && canAmend;
}

/** Plus control on a day that has no assignment yet. Hidden from people who cannot amend. */
export function rosterEmptyDayCanAdd(canAmend: boolean, entryCount: number): boolean {
  return canAmend && entryCount === 0;
}

/**
 * Direct reports to place on a team-scoped grid, including people with no
 * assignment in the period. Null is the company roster: do not add people
 * who have no shifts. Staff and search filters still apply.
 */
export type RosterStaffSiteAssignment = {
  staffId: string;
  homeLocationId?: string | null;
  extraLocationIds?: readonly (string | null | undefined)[] | null;
};

/** Home branch or an extra dedicated site. A shift row at some other site does not count. */
export function staffAssignedToRosterLocation(
  person: Omit<RosterStaffSiteAssignment, "staffId">,
  locationId: string,
): boolean {
  if (!locationId) return false;
  if (person.homeLocationId === locationId) return true;
  return (person.extraLocationIds ?? []).some((id) => id === locationId);
}

/**
 * Staff who belong on the grid for one selected site.
 * Null location means every person passed in (All locations).
 */
export function rosterStaffIdsAtLocation(
  people: readonly RosterStaffSiteAssignment[],
  locationId: string | null | undefined,
): string[] | null {
  if (!locationId) return null;
  return people
    .filter((person) => person.staffId && staffAssignedToRosterLocation(person, locationId))
    .map((person) => person.staffId);
}

/** Drop shift rows for people who are not assigned to the selected site. Null keeps every row. */
export function rosterRowsForAssignedStaff<T extends { staffId: string }>(
  rows: readonly T[],
  staffIdsAtLocation: ReadonlySet<string> | null,
): T[] {
  if (!staffIdsAtLocation) return [...rows];
  return rows.filter((row) => staffIdsAtLocation.has(row.staffId));
}

/**
 * Locations a Venue / Site Supervisor may read on the monthly roster.
 * A selected site must sit in the managed estate; All locations → every managed site.
 * Comparison is case-insensitive so UUID casing from the branch switcher cannot
 * accidentally widen the query to the full managed estate.
 */
export function venueSupervisorRosterQueryLocationIds(input: {
  managedLocationIds: readonly string[];
  selectedLocationId?: string | null;
}): { locationIds: string[]; outsideManagedEstate: boolean } {
  const managed = [...new Set(input.managedLocationIds.filter(Boolean))];
  const selected = input.selectedLocationId?.trim() || null;
  if (selected) {
    const selectedKey = selected.toLowerCase();
    const canonical = managed.find((id) => id.toLowerCase() === selectedKey);
    if (!canonical) {
      return { locationIds: [], outsideManagedEstate: true };
    }
    return { locationIds: [canonical], outsideManagedEstate: false };
  }
  return { locationIds: managed, outsideManagedEstate: false };
}

/** Keep only assignment rows whose location_id is in the allowed set. */
export function filterRosterAssignmentsByLocationIds<T extends { location_id?: string | null; locationId?: string | null }>(
  rows: readonly T[],
  locationIds: readonly string[] | null | undefined,
): T[] {
  if (locationIds == null) return [...rows];
  if (locationIds.length === 0) return [];
  const allow = new Set(locationIds.map((id) => id.toLowerCase()).filter(Boolean));
  return rows.filter((row) => {
    const id = String(row.location_id ?? row.locationId ?? "").toLowerCase();
    return Boolean(id) && allow.has(id);
  });
}

/**
 * Staff set for a Venue / Site Supervisor monthly roster at managed sites:
 * people assigned there today, plus anyone who still has roster rows in the
 * period (terminated / resigned who worked). Matches admin for that location.
 */
export function venueSupervisorRosterStaffIds(input: {
  assignedStaffIds: readonly string[];
  rosteredStaffIds: readonly string[];
}): string[] {
  return [...new Set([...input.assignedStaffIds, ...input.rosteredStaffIds].filter(Boolean))].sort();
}

export function rosterTeamStaffForMatrix(
  teamStaff: readonly RosterMatrixStaff[] | null | undefined,
  filters: Pick<RosterRegisterScopeFilters, "staffId" | "search">,
): RosterMatrixStaff[] {
  if (!teamStaff?.length) return [];
  const staffId = filters.staffId || null;
  return teamStaff.filter((person) => {
    if (!person.staffId) return false;
    if (staffId && person.staffId !== staffId) return false;
    return rosterRowMatchesSearch(
      {
        staffName: person.staffName,
        employeeCode: person.employeeCode,
        qid: person.qid,
      },
      filters.search,
    );
  });
}

/**
 * Staff × day matrix for the selected period. Multiple rows for the same staff+date stay stacked.
 * `teamStaff` adds one row per teammate even when they have no assignment in the period.
 */
export function buildRosterMatrix<
  T extends {
    staffId: string;
    staffName: string | null;
    employeeCode: string | null;
    qid: string | null;
    workDate: string;
  },
>(rows: T[], dateFrom: string, dateTo: string, teamStaff?: readonly RosterMatrixStaff[] | null) {
  const dates = enumerateYmd(dateFrom, dateTo);
  const staffMap = new Map<string, RosterMatrixStaff>();
  const byStaffDate = new Map<string, T[]>();

  for (const row of rows) {
    if (!staffMap.has(row.staffId)) {
      staffMap.set(row.staffId, {
        staffId: row.staffId,
        staffName: row.staffName,
        employeeCode: row.employeeCode,
        qid: row.qid,
      });
    }
    const key = rosterMatrixCellKey(row.staffId, row.workDate);
    const bucket = byStaffDate.get(key);
    if (bucket) bucket.push(row);
    else byStaffDate.set(key, [row]);
  }

  for (const person of teamStaff ?? []) {
    if (!person.staffId || staffMap.has(person.staffId)) continue;
    staffMap.set(person.staffId, {
      staffId: person.staffId,
      staffName: person.staffName,
      employeeCode: person.employeeCode,
      qid: person.qid,
    });
  }

  const staff = [...staffMap.values()].sort((a, b) =>
    (a.staffName || a.employeeCode || a.staffId).localeCompare(
      b.staffName || b.employeeCode || b.staffId,
      undefined,
      { sensitivity: "base" },
    ),
  );

  return { dates, staff, byStaffDate, monthSpans: rosterMonthSpans(dates) };
}

/**
 * Staff who disappear when departments are unchecked.
 * A person stays if they still belong to a checked department, or if they have no department.
 * `links` must include every department for each candidate, not only the excluded ones.
 */
export function rosterHiddenStaffIds(
  links: readonly RosterStaffDepartmentLink[],
  excludedDepartmentIds: readonly string[] | null | undefined,
): Set<string> {
  const excluded = new Set((excludedDepartmentIds ?? []).filter(Boolean));
  if (excluded.size === 0) return new Set();
  const byStaff = new Map<string, Set<string>>();
  for (const link of links) {
    if (!link.staffId || !link.departmentId) continue;
    const departments = byStaff.get(link.staffId);
    if (departments) departments.add(link.departmentId);
    else byStaff.set(link.staffId, new Set([link.departmentId]));
  }
  const hidden = new Set<string>();
  for (const [staffId, departmentIds] of byStaff) {
    let onlyExcluded = departmentIds.size > 0;
    for (const departmentId of departmentIds) {
      if (!excluded.has(departmentId)) {
        onlyExcluded = false;
        break;
      }
    }
    if (onlyExcluded) hidden.add(staffId);
  }
  return hidden;
}

/** True when anything besides the selected period narrows the register. */
export function rosterRegisterHasExtraFilters(filters: RosterRegisterScopeFilters): boolean {
  if (filters.locationId) return true;
  if (filters.staffId) return true;
  if (filters.departmentId) return true;
  if (filters.excludedDepartmentIds?.some(Boolean)) return true;
  if (filters.search?.trim()) return true;
  if (!filters.sourceUploadOnly && filters.source) return true;
  return false;
}

export function rosterRowMatchesSearch(row: RosterRegisterSearchRow, search: string | null | undefined): boolean {
  const q = search?.trim().toLowerCase() ?? "";
  if (!q) return true;
  return [row.staffName, row.employeeCode, row.qid, row.locationCode, row.workDate, row.source].some((value) =>
    String(value ?? "").toLowerCase().includes(q),
  );
}

/**
 * Employee codes like KDS-CC-STF01 / INF-CC-STF16 encode the home venue.
 * Numeric or free-form codes (534) are not venue-prefixed and stay visible.
 */
export function employeeCodeBelongsToLocation(
  employeeCode: string | null | undefined,
  locationCode: string | null | undefined,
): boolean {
  const loc = (locationCode ?? "").trim().toUpperCase();
  if (!loc) return true;
  const code = (employeeCode ?? "").trim().toUpperCase();
  if (!code || !code.includes("-")) return true;
  return code === loc || code.startsWith(`${loc}-`);
}

/**
 * Drop matrix placeholders whose employee code belongs to another venue.
 * People who already have a row in `rowStaffIds` stay (caller decides row set).
 */
export function rosterTeamStaffForLocationCode(
  teamStaff: readonly RosterMatrixStaff[] | null | undefined,
  locationCode: string | null | undefined,
  rowStaffIds?: ReadonlySet<string> | null,
): RosterMatrixStaff[] {
  if (!teamStaff?.length) return [];
  const loc = locationCode?.trim() || null;
  if (!loc) return [...teamStaff];
  return teamStaff.filter((person) => {
    if (rowStaffIds?.has(person.staffId)) return true;
    return employeeCodeBelongsToLocation(person.employeeCode, loc);
  });
}

export function filterRosterRegisterRows<
  T extends { staffId: string; locationId?: string | null } & RosterRegisterSearchRow,
>(
  rows: T[],
  filters: Pick<RosterRegisterScopeFilters, "staffId" | "search" | "locationId"> & {
    locationCode?: string | null;
  },
): T[] {
  const staffId = filters.staffId || null;
  const locationId = filters.locationId?.trim() || null;
  const locationKey = locationId?.toLowerCase() ?? null;
  const locationCode = filters.locationCode?.trim() || null;
  return rows.filter((row) => {
    if (staffId && row.staffId !== staffId) return false;
    if (locationKey) {
      const rowLoc = String(row.locationId ?? "")
        .trim()
        .toLowerCase();
      // Missing locationId must not bypass a selected site filter.
      if (!rowLoc || rowLoc !== locationKey) return false;
    }
    if (locationCode && !employeeCodeBelongsToLocation(row.employeeCode, locationCode)) return false;
    return rosterRowMatchesSearch(row, filters.search);
  });
}

export function assertRosterDeletePeriod(dateFrom: string, dateTo: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new Error("Period dates are required.");
  }
  if (dateFrom > dateTo) {
    throw new Error("Period start must be on or before the period end.");
  }
}

/**
 * People who can be placed on a day from the monthly roster.
 * Active includes a blank status, probation, secondment, and remote.
 * On leave, serving notice, and status=joker stay assignable (matches Attendance
 * listing — employment-type jokers were migrated onto status=joker).
 * Resigned, terminated, contract finished, released, and inactive do not.
 * Employment type joker does not block assignability; callers drop deleted rows.
 */
export function isRosterAssignableStaffStatus(status: string | null | undefined): boolean {
  return (
    isActiveStaffStatus(status) ||
    isOnLeaveStaffStatus(status) ||
    isServingNoticeStaffStatus(status) ||
    isJokerStaffStatus(status)
  );
}

export function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Day kinds editable from the monthly roster amend dialog. */
export const ROSTER_DAY_STATUSES = ["on_duty", "weekly_off", "annual_leave", "sick_leave", "comp_off"] as const;
export type RosterDayStatus = (typeof ROSTER_DAY_STATUSES)[number];
export type RosterLeaveType = "annual_leave" | "sick_leave" | "comp_off";

export function isRosterLeaveType(value: string | null | undefined): value is RosterLeaveType {
  return value === "annual_leave" || value === "sick_leave" || value === "comp_off";
}

/** Leave wins over week-off when both exist (upload often flags leave as is_week_off). */
export function rosterDayStatusFromRow(row: {
  isWeekOff: boolean;
  leaveType?: string | null;
}): RosterDayStatus {
  if (isRosterLeaveType(row.leaveType)) return row.leaveType;
  if (row.isWeekOff) return "weekly_off";
  return "on_duty";
}

/**
 * Map amend UI status → roster + leave patch.
 * Leave days keep is_week_off=false so attendance calc prefers leave_type over weekly_off.
 */
export function rosterPatchFromDayStatus(status: RosterDayStatus): {
  isWeekOff: boolean;
  leaveType: RosterLeaveType | null;
  needsShiftTimes: boolean;
} {
  if (status === "weekly_off") return { isWeekOff: true, leaveType: null, needsShiftTimes: false };
  if (status === "annual_leave") return { isWeekOff: false, leaveType: "annual_leave", needsShiftTimes: false };
  if (status === "sick_leave") return { isWeekOff: false, leaveType: "sick_leave", needsShiftTimes: false };
  if (status === "comp_off") return { isWeekOff: false, leaveType: "comp_off", needsShiftTimes: false };
  return { isWeekOff: false, leaveType: null, needsShiftTimes: true };
}

/** Recalc old + new site when amend moves a day; otherwise just the current site. */
export function rosterAmendRecalcLocationIds(existingLocationId: string, nextLocationId: string): string[] {
  if (existingLocationId === nextLocationId) return [existingLocationId];
  return [existingLocationId, nextLocationId];
}

/**
 * Walk PostgREST pages via .range(). A bare .limit(N) still stops at max_rows (~1000),
 * which truncates later FEC-month days when ordered work_date ASC.
 */
export async function collectPagedRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<T[] | null | undefined>,
  pageSize: number,
): Promise<T[]> {
  if (pageSize < 1) throw new Error("pageSize must be >= 1");
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = (await fetchPage(from, from + pageSize - 1)) ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

/**
 * Same rows and stop rule as collectPagedRows. A short first page is one round trip.
 * After a full page, the next pages are requested together so a multi-thousand-row
 * month does not wait on one PostgREST page at a time.
 */
export async function collectPagedRowsInWaves<T>(
  fetchPage: (from: number, to: number) => PromiseLike<T[] | null | undefined>,
  pageSize: number,
  waveSize = 4,
): Promise<T[]> {
  if (pageSize < 1) throw new Error("pageSize must be >= 1");
  if (waveSize < 1) throw new Error("waveSize must be >= 1");
  const first = (await fetchPage(0, pageSize - 1)) ?? [];
  const out: T[] = [...first];
  if (first.length < pageSize) return out;
  let nextIndex = 1;
  for (;;) {
    const indexes = Array.from({ length: waveSize }, (_, offset) => nextIndex + offset);
    const wave = await Promise.all(
      indexes.map(async (pageIndex) => {
        const from = pageIndex * pageSize;
        return (await fetchPage(from, from + pageSize - 1)) ?? [];
      }),
    );
    let short = false;
    for (const page of wave) {
      out.push(...page);
      if (page.length < pageSize) {
        short = true;
        break;
      }
    }
    if (short) break;
    nextIndex += waveSize;
  }
  return out;
}
