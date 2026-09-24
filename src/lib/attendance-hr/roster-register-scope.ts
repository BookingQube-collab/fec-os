import { enumerateYmd } from "@/lib/attendance-hr/roster-period";

export type RosterRegisterSource = "upload" | "amend" | "manual" | "copied";

export type RosterRegisterScopeFilters = {
  locationId?: string | null;
  staffId?: string | null;
  departmentId?: string | null;
  sourceUploadOnly?: boolean;
  source?: RosterRegisterSource | null;
  search?: string | null;
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

/** Staff × day matrix for the selected period. Multiple rows for the same staff+date stay stacked. */
export function buildRosterMatrix<
  T extends {
    staffId: string;
    staffName: string | null;
    employeeCode: string | null;
    qid: string | null;
    workDate: string;
  },
>(rows: T[], dateFrom: string, dateTo: string) {
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

  const staff = [...staffMap.values()].sort((a, b) =>
    (a.staffName || a.employeeCode || a.staffId).localeCompare(
      b.staffName || b.employeeCode || b.staffId,
      undefined,
      { sensitivity: "base" },
    ),
  );

  return { dates, staff, byStaffDate, monthSpans: rosterMonthSpans(dates) };
}

/** True when anything besides the selected period narrows the register. */
export function rosterRegisterHasExtraFilters(filters: RosterRegisterScopeFilters): boolean {
  if (filters.locationId) return true;
  if (filters.staffId) return true;
  if (filters.departmentId) return true;
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

export function filterRosterRegisterRows<T extends { staffId: string } & RosterRegisterSearchRow>(
  rows: T[],
  filters: Pick<RosterRegisterScopeFilters, "staffId" | "search">,
): T[] {
  const staffId = filters.staffId || null;
  return rows.filter((row) => {
    if (staffId && row.staffId !== staffId) return false;
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

export function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Day kinds editable from the monthly roster amend dialog. */
export const ROSTER_DAY_STATUSES = ["on_duty", "weekly_off", "annual_leave", "sick_leave"] as const;
export type RosterDayStatus = (typeof ROSTER_DAY_STATUSES)[number];
export type RosterLeaveType = "annual_leave" | "sick_leave";

/** Leave wins over week-off when both exist (upload often flags leave as is_week_off). */
export function rosterDayStatusFromRow(row: {
  isWeekOff: boolean;
  leaveType?: string | null;
}): RosterDayStatus {
  if (row.leaveType === "annual_leave" || row.leaveType === "sick_leave") return row.leaveType;
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
