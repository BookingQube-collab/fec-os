import type {
  ComplianceStatus,
  E3ComplianceItemRow,
  VendorOverallStatus,
} from "@/lib/compliance-tracker/constants";
import {
  enrichItem,
  getAnchorMonth,
  getSchedulerStatus,
  isDueInMonth,
  isExpiringWithin30Days,
} from "@/lib/compliance-tracker/status";

export type LocationFieldFilter = {
  location: string;
  field: string;
};

export type ComplianceKpis = {
  total: number;
  compliant: number;
  expiring30: number;
  overdue: number;
  missing: number;
};

export function filterByLocationField<T extends { location: string; category: string }>(
  rows: T[],
  filter: LocationFieldFilter,
  resolveCategories: (field: string) => string[] | null,
): T[] {
  const fieldCategories = resolveCategories(filter.field);
  return rows.filter((r) => {
    if (filter.location !== "All" && r.location !== filter.location) return false;
    if (fieldCategories?.length && !fieldCategories.includes(r.category)) return false;
    return true;
  });
}

export function filterByCategories<T extends { category: string }>(
  rows: T[],
  categories: string[],
): T[] {
  const set = new Set(categories);
  return rows.filter((r) => set.has(r.category));
}

export function computeKpis(rows: E3ComplianceItemRow[]): ComplianceKpis {
  const enriched = rows.map((r) =>
    r.computed_status ? r : enrichItem(r),
  );
  let compliant = 0;
  let expiring30 = 0;
  let overdue = 0;
  let missing = 0;

  for (const r of enriched) {
    const status = r.computed_status as ComplianceStatus;
    if (status === "Compliant") compliant += 1;
    if (isExpiringWithin30Days(status)) expiring30 += 1;
    if (status === "Overdue") overdue += 1;
    if (status === "Missing") missing += 1;
  }

  return { total: enriched.length, compliant, expiring30, overdue, missing };
}

export type VendorAggregateRow = {
  vendor: string;
  locationsServed: number;
  totalContracts: number;
  compliant: number;
  expiring30: number;
  overdue: number;
  missing: number;
  complianceScore: number;
  overallStatus: VendorOverallStatus;
};

export function aggregateVendors(rows: E3ComplianceItemRow[]): VendorAggregateRow[] {
  const map = new Map<string, E3ComplianceItemRow[]>();

  for (const row of rows) {
    const list = map.get(row.vendor) ?? [];
    list.push(row.computed_status ? row : enrichItem(row));
    map.set(row.vendor, list);
  }

  const result: VendorAggregateRow[] = [];

  for (const [vendor, items] of map) {
    const locations = new Set(items.map((i) => i.location));
    let compliant = 0;
    let expiring30 = 0;
    let overdue = 0;
    let missing = 0;
    let critical = 0;
    let upcoming = 0;
    let warning = 0;

    for (const item of items) {
      const status = item.computed_status as ComplianceStatus;
      if (status === "Compliant") compliant += 1;
      if (status === "Upcoming") upcoming += 1;
      if (status === "Warning") warning += 1;
      if (status === "Critical") critical += 1;
      if (isExpiringWithin30Days(status)) expiring30 += 1;
      if (status === "Overdue") overdue += 1;
      if (status === "Missing") missing += 1;
    }

    const totalContracts = items.length;
    const complianceScore =
      totalContracts > 0 ? Math.round((compliant / totalContracts) * 100) : 0;

    let overallStatus: VendorOverallStatus = "Healthy";
    if (totalContracts === 0) overallStatus = "No Data";
    else if (missing > 0) overallStatus = "Action Needed";
    else if (critical + overdue > 0) overallStatus = "At Risk";
    else if (upcoming + warning > 0) overallStatus = "Monitor";

    result.push({
      vendor,
      locationsServed: locations.size,
      totalContracts,
      compliant,
      expiring30,
      overdue,
      missing,
      complianceScore,
      overallStatus,
    });
  }

  return result.sort((a, b) => a.vendor.localeCompare(b.vendor));
}

export type SchedulerRow = E3ComplianceItemRow & {
  anchorMonth: number | null;
  schedulerStatus: "Scheduled" | "Pending Setup";
  dueMonths: boolean[];
};

export function buildSchedulerRows(rows: E3ComplianceItemRow[]): SchedulerRow[] {
  return rows.map((row) => {
    const anchorMonth = getAnchorMonth(row.expiry_date, row.contract_end);
    const schedulerStatus = getSchedulerStatus(row.frequency, anchorMonth);
    const dueMonths = Array.from({ length: 12 }, (_, i) =>
      schedulerStatus === "Scheduled" ? isDueInMonth(i + 1, row.frequency, anchorMonth) : false,
    );
    return {
      ...(row.computed_status ? row : enrichItem(row)),
      anchorMonth,
      schedulerStatus,
      dueMonths,
    };
  });
}

export type SchedulerKpis = {
  total: number;
  scheduled: number;
  pendingSetup: number;
  dueThisMonth: number;
};

export function computeSchedulerKpis(rows: SchedulerRow[]): SchedulerKpis {
  const currentMonth = new Date().getMonth() + 1;
  let scheduled = 0;
  let pendingSetup = 0;
  let dueThisMonth = 0;

  for (const row of rows) {
    if (row.schedulerStatus === "Scheduled") scheduled += 1;
    else pendingSetup += 1;
    if (row.dueMonths[currentMonth - 1]) dueThisMonth += 1;
  }

  return { total: rows.length, scheduled, pendingSetup, dueThisMonth };
}

export type StatusByLocation = { location: string; status: ComplianceStatus; count: number };

export function aggregateStatusByLocation(rows: E3ComplianceItemRow[]): StatusByLocation[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const enriched = row.computed_status ? row : enrichItem(row);
    const key = `${enriched.location}|${enriched.computed_status}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result: StatusByLocation[] = [];
  for (const [key, count] of counts) {
    const [location, status] = key.split("|");
    result.push({ location, status: status as ComplianceStatus, count });
  }
  return result.sort((a, b) => a.location.localeCompare(b.location));
}

export type StatusCount = { status: ComplianceStatus; count: number };

export function aggregateStatusCounts(rows: E3ComplianceItemRow[]): StatusCount[] {
  const counts = new Map<ComplianceStatus, number>();
  for (const row of rows) {
    const enriched = row.computed_status ? row : enrichItem(row);
    const status = enriched.computed_status as ComplianceStatus;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
}

export type CategoryCount = { category: string; count: number };

export function aggregateByCategory(rows: E3ComplianceItemRow[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function topExpiringItems(rows: E3ComplianceItemRow[], limit = 10): E3ComplianceItemRow[] {
  return rows
    .map((r) => (r.computed_status ? r : enrichItem(r)))
    .filter((r) => r.expiry_date && r.days_to_expiry !== null && r.days_to_expiry !== undefined)
    .sort((a, b) => (a.days_to_expiry ?? 9999) - (b.days_to_expiry ?? 9999))
    .slice(0, limit);
}

export function searchFilter<T extends Record<string, unknown>>(
  rows: T[],
  query: string,
  keys: (keyof T)[],
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    keys.some((k) => String(row[k] ?? "").toLowerCase().includes(q)),
  );
}
