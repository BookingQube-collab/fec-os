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
