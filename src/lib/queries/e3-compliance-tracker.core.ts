import {
  aggregateByCategory,
  aggregateStatusByLocation,
  aggregateStatusCounts,
  aggregateVendors,
  buildSchedulerRows,
  computeKpis,
  computeSchedulerKpis,
  topExpiringItems,
  type ComplianceKpis,
  type SchedulerKpis,
  type SchedulerRow,
  type StatusByLocation,
  type StatusCount,
  type CategoryCount,
  type VendorAggregateRow,
} from "@/lib/compliance-tracker/aggregations";
import { E3_AMC_CATEGORIES, E3_TABLE_ENRICHED, categoriesForE3Field } from "@/lib/compliance-tracker/constants";
import type { E3ComplianceItemRow } from "@/lib/compliance-tracker/constants";
import { LICENSE_DOCUMENT_CATEGORIES } from "@/lib/compliance-tracker/license-documents-config";
import { logger } from "@/core/logger";
import { isPerfLogEnabled } from "@/lib/performance/timer";
import {
  filterLicenseDocumentsTree,
  resolveLicenseDocumentsTree,
} from "@/lib/compliance-tracker/license-documents-resolver";
import type { LicenseDocumentsResult } from "@/lib/compliance-tracker/license-documents-types";
import type { AuthContext } from "@/lib/server/auth";

type FilterableQuery = any;
export const E3_TRACKER_DEFAULT_LIMIT = 50;
export const E3_TRACKER_TOP_EXPIRING_LIMIT = 10;

export type E3TrackerFilters = {
  location?: string | null;
  field?: string | null;
  category?: string | null;
  categories?: string[] | null;
  page?: number;
  limit?: number;
  search?: string | null;
};

export type E3TrackerPaginatedResult = {
  items: E3ComplianceItemRow[];
  total: number;
  page: number;
  limit: number;
  kpis: ComplianceKpis;
};

export type E3TrackerSummaryResult = {
  kpis: ComplianceKpis;
  statusByLocation: StatusByLocation[];
  statusCounts: StatusCount[];
  categoryCounts: CategoryCount[];
  topExpiring: E3ComplianceItemRow[];
};

export type E3TrackerVendorsResult = {
  kpis: ComplianceKpis;
  vendors: VendorAggregateRow[];
};

export type E3TrackerSchedulerResult = {
  kpis: SchedulerKpis;
  items: SchedulerRow[];
};

function normalizePageLimit(filters: E3TrackerFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? E3_TRACKER_DEFAULT_LIMIT), 200);
  return { page, limit, from: (page - 1) * limit, to: (page - 1) * limit + limit - 1 };
}

function applyLocationFieldFilters(query: FilterableQuery, filters: E3TrackerFilters): FilterableQuery {
  let q = query;
  if (filters.location && filters.location !== "All") {
    q = q.eq("location", filters.location);
  }
  const fieldCategories = categoriesForE3Field(filters.field);
  if (fieldCategories?.length) {
    q = q.in("category", fieldCategories);
  }
  return q;
}

function applyCategoryFilters(query: FilterableQuery, filters: E3TrackerFilters): FilterableQuery {
  if (filters.category) {
    return query.eq("category", filters.category);
  }
  if (filters.categories?.length) {
    return query.in("category", filters.categories);
  }
  return query;
}

function applySearchFilter(query: FilterableQuery, search?: string | null): FilterableQuery {
  const term = search?.trim();
  if (!term) return query;
  const s = `%${term}%`;
  return query.or(
    `id.ilike.${s},location.ilike.${s},area.ilike.${s},category.ilike.${s},item.ilike.${s},vendor.ilike.${s},owner.ilike.${s}`,
  );
}

function applyListFilters(query: FilterableQuery, filters: E3TrackerFilters): FilterableQuery {
  return applySearchFilter(applyCategoryFilters(applyLocationFieldFilters(query, filters), filters), filters.search);
}

async function fetchStatusRowsForKpis(
  context: AuthContext,
  filters: E3TrackerFilters,
  extra?: (q: FilterableQuery) => FilterableQuery,
): Promise<E3ComplianceItemRow[]> {
  let q = context.supabase.from(E3_TABLE_ENRICHED).select("computed_status, expiry_date");
  q = applyListFilters(q, filters);
  if (extra) q = extra(q);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as E3ComplianceItemRow[];
}

async function fetchPaginatedRows(
  context: AuthContext,
  filters: E3TrackerFilters,
  extra?: (q: FilterableQuery) => FilterableQuery,
): Promise<E3TrackerPaginatedResult> {
  const { page, limit, from, to } = normalizePageLimit(filters);

  let q = context.supabase
    .from(E3_TABLE_ENRICHED)
    .select("*", { count: "exact" })
    .order("location")
    .order("category")
    .range(from, to);
  q = applyListFilters(q, filters);
  if (extra) q = extra(q);

  const [{ data, error, count }, statusRows] = await Promise.all([
    q,
    fetchStatusRowsForKpis(context, filters, extra),
  ]);
  if (error) throw error;

  return {
    items: (data ?? []) as E3ComplianceItemRow[],
    total: count ?? 0,
    page,
    limit,
    kpis: computeKpis(statusRows),
  };
}

export async function fetchE3ComplianceItems(context: AuthContext): Promise<E3ComplianceItemRow[]> {
  const { data, error } = await context.supabase
    .from(E3_TABLE_ENRICHED)
    .select("*")
    .order("location")
    .order("category");

  if (error) throw error;
  return (data ?? []) as E3ComplianceItemRow[];
}

function normalizeE3Kpis(raw: ComplianceKpis & { expiring90?: number }): ComplianceKpis {
  if ("expiring30" in raw && raw.expiring30 != null) return raw;
  return {
    ...raw,
    expiring30: raw.expiring90 ?? 0,
  };
}

export async function fetchE3TrackerSummary(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerSummaryResult> {
  const location = filters.location && filters.location !== "All" ? filters.location : "All";

  const { data, error } = await context.supabase.rpc("get_e3_tracker_summary", {
    p_location: location,
    p_area: "All",
  });
  if (error) throw error;

  const payload = data as {
    kpis: ComplianceKpis;
    statusByLocation: StatusByLocation[];
    statusCounts: StatusCount[];
    categoryCounts: CategoryCount[];
    topExpiring: E3ComplianceItemRow[];
  };

  return {
    kpis: normalizeE3Kpis(payload.kpis),
    statusByLocation: payload.statusByLocation ?? [],
    statusCounts: payload.statusCounts ?? [],
    categoryCounts: payload.categoryCounts ?? [],
    topExpiring: payload.topExpiring ?? [],
  };
}

/** Fallback when RPC is not yet migrated — aggregates in-process from filtered rows. */
export async function fetchE3TrackerSummaryFallback(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerSummaryResult> {
  let q = context.supabase.from(E3_TABLE_ENRICHED).select("*");
  q = applyLocationFieldFilters(q, filters);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as E3ComplianceItemRow[];

  return {
    kpis: computeKpis(rows),
    statusByLocation: aggregateStatusByLocation(rows),
    statusCounts: aggregateStatusCounts(rows),
    categoryCounts: aggregateByCategory(rows),
    topExpiring: topExpiringItems(rows, E3_TRACKER_TOP_EXPIRING_LIMIT),
  };
}

export async function fetchE3TrackerSummarySafe(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerSummaryResult> {
  const useFieldFilter = filters.field && filters.field !== "All";
  if (useFieldFilter) {
    return fetchE3TrackerSummaryFallback(context, filters);
  }
  try {
    return await fetchE3TrackerSummary(context, filters);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("get_e3_tracker_summary") || msg.includes("function") || msg.includes("does not exist")) {
      return fetchE3TrackerSummaryFallback(context, filters);
    }
    throw e;
  }
}

export async function fetchE3TrackerRegister(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerPaginatedResult> {
  return fetchPaginatedRows(context, filters);
}

export async function fetchE3TrackerVendors(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerVendorsResult> {
  let q = context.supabase.from(E3_TABLE_ENRICHED).select("*");
  q = applyListFilters(q, filters);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as E3ComplianceItemRow[];

  return {
    kpis: computeKpis(rows),
    vendors: aggregateVendors(rows),
  };
}

export async function fetchE3TrackerScheduler(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerSchedulerResult> {
  let q = context.supabase.from(E3_TABLE_ENRICHED).select("*");
  q = applyListFilters(q, { ...filters, categories: E3_AMC_CATEGORIES });
  q = applySearchFilter(q, filters.search);
  const { data, error } = await q.order("location").order("category");
  if (error) throw error;

  const items = buildSchedulerRows((data ?? []) as E3ComplianceItemRow[]);
  return {
    items,
    kpis: computeSchedulerKpis(items),
  };
}

export async function fetchE3TrackerMissingDocuments(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerPaginatedResult> {
  return fetchPaginatedRows(context, filters, (q) => q.eq("computed_status", "Missing"));
}

export async function fetchE3TrackerAmc(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerPaginatedResult> {
  return fetchPaginatedRows(context, filters, (q) => q.in("category", E3_AMC_CATEGORIES));
}

export async function fetchE3TrackerCategory(
  context: AuthContext,
  filters: E3TrackerFilters,
): Promise<E3TrackerPaginatedResult> {
  return fetchPaginatedRows(context, filters);
}

export async function fetchE3TrackerLicenseDocuments(
  context: AuthContext,
  filters: Pick<E3TrackerFilters, "location" | "field">,
): Promise<LicenseDocumentsResult> {
  const { data, error } = await context.supabase
    .from(E3_TABLE_ENRICHED)
    .select("*")
    .in("category", [...LICENSE_DOCUMENT_CATEGORIES])
    .order("location")
    .order("area")
    .order("category");

  if (error) throw error;

  const resolved = resolveLicenseDocumentsTree((data ?? []) as E3ComplianceItemRow[]);
  const location = filters.location && filters.location !== "All" ? filters.location : "All";
  const field = filters.field && filters.field !== "All" ? filters.field : "All";
  return filterLicenseDocumentsTree(resolved, location, field);
}

export function parseE3TrackerFilters(params: URLSearchParams): E3TrackerFilters {
  const categoriesParam = params.get("categories");
  const category = params.get("category");
  return {
    location: params.get("location") || "All",
    field: params.get("field") || "All",
    category: category || undefined,
    categories: categoriesParam ? categoriesParam.split(",").filter(Boolean) : undefined,
    page: params.get("page") ? Number(params.get("page")) : 1,
    limit: params.get("limit") ? Number(params.get("limit")) : E3_TRACKER_DEFAULT_LIMIT,
    search: params.get("search") || undefined,
  };
}

/** E3 tracker route perf logging — dev / PERF_LOG=1 only. */
export function logE3TrackerPerf(
  route: string,
  rowCount: number | undefined,
  handlerMs: number,
  dbMs: number,
) {
  if (!isPerfLogEnabled()) return;
  logger.debug("perf", `e3-tracker/${route}`, {
    route,
    rowCount,
    handlerMs: Math.round(handlerMs),
    dbMs: Math.round(dbMs),
  });
}
