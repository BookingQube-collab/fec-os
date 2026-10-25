import { canActorPerform } from "@/lib/arcade/access";
import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import type { AppRole } from "@/lib/rbac";

export const SUGGESTION_STATUSES = ["new", "seen", "closed"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_CATEGORIES = ["operations", "hr", "safety", "other"] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

export type SuggestionActor = {
  jobTitle?: string | null;
  staffRole?: string | null;
  department?: string | null;
  staffId?: string | null;
  employeeCode?: string | null;
  email?: string | null;
  fullName?: string | null;
  displayName?: string | null;
};

/** Inbox row shape returned by `listSuggestionInbox` (mapped). */
export type SuggestionInboxItem = {
  id: string;
  staffId: string;
  userId: string;
  title: string;
  body: string;
  category: SuggestionCategory | null;
  status: SuggestionStatus;
  adminNote: string | null;
  seenAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  staffName: string | null;
  employeeCode: string | null;
  jobTitle: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
};

export type SuggestionInboxFilters = {
  status?: SuggestionStatus | "all";
  category?: SuggestionCategory | "all";
  locationId?: string | "all";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type SuggestionStatusCounts = {
  total: number;
  new: number;
  seen: number;
  closed: number;
};

export type SuggestionNamedCount = { key: string; label: string; count: number };

export type SuggestionVolumePoint = { date: string; count: number };

/**
 * Admin seats (admin.view: ceo / coo / regional_ops) plus Head of Operations title.
 * HoO also receives admin.view via canActorPerform; title check keeps the product rule explicit.
 */
export function canReviewStaffSuggestions(
  roles: readonly string[],
  actor?: SuggestionActor | null,
): boolean {
  const list = roles as AppRole[];
  if (isHeadOfOperationsTitle(actor?.jobTitle)) return true;
  return canActorPerform(list, "admin.view", actor ?? null);
}

function ymdFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function matchesSearch(row: SuggestionInboxItem, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.title, row.body, row.staffName, row.employeeCode, row.jobTitle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/** Client-side inbox filter — same set drives KPIs, charts, and the detail list. */
export function filterSuggestionInbox(
  rows: readonly SuggestionInboxItem[],
  filters: SuggestionInboxFilters,
): SuggestionInboxItem[] {
  const status = filters.status && filters.status !== "all" ? filters.status : null;
  const category = filters.category && filters.category !== "all" ? filters.category : null;
  const locationId = filters.locationId && filters.locationId !== "all" ? filters.locationId : null;
  const dateFrom = filters.dateFrom?.trim() || null;
  const dateTo = filters.dateTo?.trim() || null;
  const search = filters.search?.trim() || "";

  return rows.filter((row) => {
    if (status && row.status !== status) return false;
    if (category && row.category !== category) return false;
    if (locationId && row.locationId !== locationId) return false;
    const created = ymdFromIso(row.createdAt);
    if (dateFrom && created < dateFrom) return false;
    if (dateTo && created > dateTo) return false;
    if (search && !matchesSearch(row, search)) return false;
    return true;
  });
}

export function summarizeSuggestionStatuses(
  rows: readonly SuggestionInboxItem[],
): SuggestionStatusCounts {
  const counts: SuggestionStatusCounts = { total: rows.length, new: 0, seen: 0, closed: 0 };
  for (const row of rows) {
    if (row.status === "new") counts.new += 1;
    else if (row.status === "seen") counts.seen += 1;
    else if (row.status === "closed") counts.closed += 1;
  }
  return counts;
}

export function suggestionCategoryBreakdown(
  rows: readonly SuggestionInboxItem[],
  labelFor: (key: string) => string,
): SuggestionNamedCount[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.category ?? "uncategorized";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: labelFor(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function suggestionStatusBreakdown(
  rows: readonly SuggestionInboxItem[],
  labelFor: (status: SuggestionStatus) => string,
): SuggestionNamedCount[] {
  const counts = summarizeSuggestionStatuses(rows);
  return (SUGGESTION_STATUSES as readonly SuggestionStatus[])
    .map((status) => ({ key: status, label: labelFor(status), count: counts[status] }))
    .filter((row) => row.count > 0);
}

/** Daily volume for the last `days` calendar days ending on `endYmd` (inclusive). */
export function suggestionVolumeSeries(
  rows: readonly SuggestionInboxItem[],
  endYmd: string,
  days = 30,
): SuggestionVolumePoint[] {
  const end = endYmd.slice(0, 10);
  const endDate = new Date(`${end}T12:00:00Z`);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const start = startDate.toISOString().slice(0, 10);

  const byDay = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(startDate);
    d.setUTCDate(startDate.getUTCDate() + i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of rows) {
    const day = ymdFromIso(row.createdAt);
    if (day < start || day > end) continue;
    if (!byDay.has(day)) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return [...byDay.entries()].map(([date, count]) => ({ date, count }));
}
