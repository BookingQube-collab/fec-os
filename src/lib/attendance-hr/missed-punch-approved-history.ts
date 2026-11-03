/** Client-side filter + chart aggregation for My Day Correction → Approved history. */

export type ApprovedHistoryStatusFilter = "all" | "approved" | "in_progress";

export type ApprovedHistoryFilters = {
  dateFrom: string;
  dateTo: string;
  locationId: string;
  department: string;
  staffQuery: string;
  status: ApprovedHistoryStatusFilter;
  /** Approved seat role: manager | ops | hr | gm, or "" for any. */
  stepRole: string;
  /** Leave type code (annual, sick, …), or "" for any. Correction ignores this. */
  leaveType: string;
};

export const EMPTY_APPROVED_HISTORY_FILTERS: ApprovedHistoryFilters = {
  dateFrom: "",
  dateTo: "",
  locationId: "",
  department: "",
  staffQuery: "",
  status: "all",
  stepRole: "",
  leaveType: "",
};

export type ApprovedHistoryRowLike = {
  /** Primary date (correction work day, or leave start). */
  workDate: string | null;
  /** Optional end date (leave range). When set, date filters use overlap. */
  dateTo?: string | null;
  locationId: string;
  department: string | null;
  staffName: string | null;
  employeeCode: string | null;
  status: string;
  /** Leave type code when filtering leave history. */
  leaveType?: string | null;
  steps: ReadonlyArray<{ stepRole: string; status: string; actedByName?: string | null }>;
};

export function approvedHistoryHasActiveFilters(filters: ApprovedHistoryFilters): boolean {
  return Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.locationId ||
      filters.department ||
      filters.staffQuery.trim() ||
      filters.status !== "all" ||
      filters.stepRole ||
      filters.leaveType,
  );
}

function matchesStaffQuery(row: ApprovedHistoryRowLike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.staffName, row.employeeCode, row.department]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function matchesStatus(row: ApprovedHistoryRowLike, status: ApprovedHistoryStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "approved") return row.status === "approved";
  return row.status === "pending";
}

function matchesStepRole(row: ApprovedHistoryRowLike, stepRole: string): boolean {
  if (!stepRole) return true;
  return row.steps.some((step) => step.stepRole === stepRole && step.status === "approved");
}

/** Filter approved-history rows by work date, site, department, staff, status, and seat. */
export function filterApprovedHistoryRows<T extends ApprovedHistoryRowLike>(
  rows: readonly T[],
  filters: ApprovedHistoryFilters,
): T[] {
  const from = filters.dateFrom.trim();
  const to = filters.dateTo.trim();
  return rows.filter((row) => {
    const start = row.workDate?.slice(0, 10) ?? "";
    const end = (row.dateTo?.slice(0, 10) || start) ?? "";
    // Single-day rows: start === end. Leave ranges: overlap with [from, to].
    if (from && (!end || end < from)) return false;
    if (to && (!start || start > to)) return false;
    if (filters.locationId && row.locationId !== filters.locationId) return false;
    if (filters.department && (row.department ?? "") !== filters.department) return false;
    if (!matchesStaffQuery(row, filters.staffQuery)) return false;
    if (!matchesStatus(row, filters.status)) return false;
    if (!matchesStepRole(row, filters.stepRole)) return false;
    if (filters.leaveType && (row.leaveType ?? "") !== filters.leaveType) return false;
    return true;
  });
}

/** KPI totals for Approved history (unfiltered or filtered row set). */
export function summarizeApprovedHistory(rows: readonly ApprovedHistoryRowLike[]): {
  total: number;
  approved: number;
  inProgress: number;
} {
  let approved = 0;
  let inProgress = 0;
  for (const row of rows) {
    if (row.status === "approved") approved += 1;
    else if (row.status === "pending") inProgress += 1;
  }
  return { total: rows.length, approved, inProgress };
}

export function uniqueApprovedHistoryDepartments(rows: readonly ApprovedHistoryRowLike[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const dept = row.department?.trim();
    if (dept) set.add(dept);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function uniqueApprovedHistoryLocationIds(rows: readonly ApprovedHistoryRowLike[]): string[] {
  return [...new Set(rows.map((row) => row.locationId).filter(Boolean))].sort();
}

export type ApprovedHistoryDayPoint = { date: string; count: number };
export type ApprovedHistoryNamedCount = { key: string; name: string; count: number };

export function buildApprovedHistoryVolumeByDay(
  rows: readonly ApprovedHistoryRowLike[],
): ApprovedHistoryDayPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = row.workDate?.slice(0, 10);
    if (!date) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

export function buildApprovedHistoryByDepartment(
  rows: readonly ApprovedHistoryRowLike[],
  unlabeled = "Unassigned",
): ApprovedHistoryNamedCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row.department?.trim() || unlabeled;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ key: name, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function buildApprovedHistoryByLocation(
  rows: readonly ApprovedHistoryRowLike[],
  labelFor: (locationId: string) => string,
): ApprovedHistoryNamedCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.locationId, (counts.get(row.locationId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, name: labelFor(key), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function buildApprovedHistoryByStatus(
  rows: readonly ApprovedHistoryRowLike[],
  labels: { approved: string; inProgress: string },
): ApprovedHistoryNamedCount[] {
  let approved = 0;
  let inProgress = 0;
  for (const row of rows) {
    if (row.status === "approved") approved += 1;
    else if (row.status === "pending") inProgress += 1;
  }
  return [
    { key: "approved", name: labels.approved, count: approved },
    { key: "in_progress", name: labels.inProgress, count: inProgress },
  ].filter((row) => row.count > 0);
}
