import { enumerateYmd } from "@/lib/attendance-hr/roster-period";

export type RosterRegisterSource = "upload" | "amend" | "manual";

export type RosterRegisterScopeFilters = {
  locationId?: string | null;
  staffId?: string | null;
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
