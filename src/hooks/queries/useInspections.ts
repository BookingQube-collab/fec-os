import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { AmcScheduleListRow } from "@/lib/queries/amc-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface InspectionFilters {
  locationId?: string | null;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/** AMC service schedules used as inspection / PM visits. */
export function useInspections(filters: InspectionFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.inspections.list(filters),
    queryFn: () =>
      apiGet<{ items: AmcScheduleListRow[]; total: number }>("/api/inspections", {
        locationId: filters.locationId,
        overdueOnly: filters.overdueOnly,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 100,
      }),
    staleTime: STALE.inspections,
    enabled: options?.enabled ?? true,
  });
}

export function useComplianceRenewals(
  filters: { locationCode?: string | null; limit?: number } = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.renewals(filters),
    queryFn: () =>
      apiGet<import("@/lib/queries/amc-queries.core").ComplianceRenewalRow[]>(
        "/api/compliance/renewals",
        { locationCode: filters.locationCode, limit: filters.limit ?? 50 },
      ),
    staleTime: STALE.complianceRenewals,
    enabled: options?.enabled ?? false,
  });
}
