import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { LicenseDocumentsResult } from "@/lib/compliance-tracker/license-documents-types";
import type {
  E3TrackerPaginatedResult,
  E3TrackerSchedulerResult,
  E3TrackerSummaryResult,
  E3TrackerVendorsResult,
} from "@/lib/queries/e3-compliance-tracker.core";
import { E3_TRACKER_DEFAULT_LIMIT } from "@/lib/queries/e3-compliance-tracker.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export type E3TrackerQueryFilters = {
  location?: string;
  field?: string;
  category?: string;
  categories?: string[];
  page?: number;
  limit?: number;
  search?: string;
};

function filterParams(filters: E3TrackerQueryFilters = {}) {
  return {
    location: filters.location ?? "All",
    field: filters.field ?? "All",
    category: filters.category,
    categories: filters.categories?.length ? filters.categories.join(",") : undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? E3_TRACKER_DEFAULT_LIMIT,
    search: filters.search,
  };
}

export function useE3TrackerSummary(
  filters: Pick<E3TrackerQueryFilters, "location" | "field"> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.summary(filters),
    queryFn: () =>
      apiGet<E3TrackerSummaryResult>("/api/compliance/e3-tracker/summary", filterParams(filters)),
    staleTime: STALE.e3Compliance,
    enabled: options?.enabled ?? true,
  });
}

export function useE3TrackerRegister(
  filters: E3TrackerQueryFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.register(filters),
    queryFn: () =>
      apiGet<E3TrackerPaginatedResult>("/api/compliance/e3-tracker/register", filterParams(filters)),
    staleTime: STALE.lists,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useE3TrackerVendors(
  filters: Pick<E3TrackerQueryFilters, "location" | "field" | "search"> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.vendors(filters),
    queryFn: () =>
      apiGet<E3TrackerVendorsResult>("/api/compliance/e3-tracker/vendors", filterParams(filters)),
    staleTime: STALE.e3Compliance,
    enabled: options?.enabled ?? true,
  });
}

export function useE3TrackerScheduler(
  filters: Pick<E3TrackerQueryFilters, "location" | "field" | "search"> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.scheduler(filters),
    queryFn: () =>
      apiGet<E3TrackerSchedulerResult>("/api/compliance/e3-tracker/scheduler", filterParams(filters)),
    staleTime: STALE.e3Compliance,
    enabled: options?.enabled ?? true,
  });
}

export function useE3TrackerMissingDocuments(
  filters: E3TrackerQueryFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.missingDocuments(filters),
    queryFn: () =>
      apiGet<E3TrackerPaginatedResult>(
        "/api/compliance/e3-tracker/missing-documents",
        filterParams(filters),
      ),
    staleTime: STALE.lists,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useE3TrackerAmc(
  filters: E3TrackerQueryFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.amc(filters),
    queryFn: () =>
      apiGet<E3TrackerPaginatedResult>("/api/compliance/e3-tracker/amc", filterParams(filters)),
    staleTime: STALE.lists,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useE3TrackerCategory(
  categoryFilters: E3TrackerQueryFilters & { categories: string[] },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.category(categoryFilters),
    queryFn: () =>
      apiGet<E3TrackerPaginatedResult>("/api/compliance/e3-tracker/category", filterParams(categoryFilters)),
    staleTime: STALE.lists,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useE3TrackerLicenseDocuments(
  filters: Pick<E3TrackerQueryFilters, "location" | "field"> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.licenseDocuments(filters),
    queryFn: () =>
      apiGet<LicenseDocumentsResult>("/api/compliance/e3-tracker/license-documents", {
        location: filters.location ?? "All",
        field: filters.field ?? "All",
      }),
    staleTime: STALE.e3Compliance,
    enabled: options?.enabled ?? true,
  });
}
