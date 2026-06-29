import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { LocationTrackerKpis } from "@/lib/queries/location-compliance.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface LocationTrackerFilters {
  locationId?: string | null;
  category?: string | null;
  status?: string | null;
  vendor?: string | null;
  expiryBucket?: string | null;
  missingDocs?: boolean;
  outstandingPayment?: boolean;
  highRisk?: boolean;
  requiredOnly?: boolean;
}

function toSearchParams(filters: LocationTrackerFilters, mode?: string) {
  const sp = new URLSearchParams();
  if (mode) sp.set("mode", mode);
  if (filters.locationId) sp.set("locationId", filters.locationId);
  if (filters.category) sp.set("category", filters.category);
  if (filters.status) sp.set("status", filters.status);
  if (filters.vendor) sp.set("vendor", filters.vendor);
  if (filters.expiryBucket) sp.set("expiryBucket", filters.expiryBucket);
  if (filters.missingDocs) sp.set("missingDocs", "1");
  if (filters.outstandingPayment) sp.set("outstandingPayment", "1");
  if (filters.highRisk) sp.set("highRisk", "1");
  if (filters.requiredOnly) sp.set("requiredOnly", "1");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useLocationComplianceItems(filters: LocationTrackerFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.compliance.locationTracker(filters),
    queryFn: () => apiGet<Record<string, unknown>[]>(`/api/compliance/location-tracker${toSearchParams(filters)}`),
    staleTime: STALE.complianceRenewals,
    enabled: options?.enabled ?? true,
  });
}

export function useLocationComplianceKpis(filters: LocationTrackerFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.compliance.locationTrackerKpis(filters),
    queryFn: () =>
      apiGet<LocationTrackerKpis>(`/api/compliance/location-tracker${toSearchParams(filters, "kpis")}`),
    staleTime: STALE.complianceRenewals,
    enabled: options?.enabled ?? true,
  });
}

export function useLocationComplianceAlerts(filters: LocationTrackerFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.compliance.locationTrackerAlerts(filters),
    queryFn: () =>
      apiGet<{ kpis: LocationTrackerKpis; items: Record<string, unknown>[] }>(
        `/api/compliance/location-tracker${toSearchParams(filters, "alerts")}`,
      ),
    staleTime: STALE.complianceRenewals,
    enabled: options?.enabled ?? true,
  });
}
