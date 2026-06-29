import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { ExpiryAlertsPayload } from "@/lib/queries/expiry-alerts.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface ExpiryAlertFilters {
  locationId?: string | null;
  limit?: number;
}

export function useExpiryAlerts(filters: ExpiryAlertFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.compliance.expiryAlerts(filters),
    queryFn: () =>
      apiGet<ExpiryAlertsPayload>("/api/compliance/expiry-alerts", {
        locationId: filters.locationId,
        limit: filters.limit ?? 100,
      }),
    staleTime: STALE.complianceDocuments,
    enabled: options?.enabled ?? true,
  });
}

export function useDocumentExpiryKpis(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.compliance.documentExpiryKpis(locationId ?? null),
    queryFn: async () => {
      const data = await apiGet<{
        expired: number;
        due_7: number;
        due_30: number;
        due_60: number;
      }>("/api/compliance/expiry-alerts", {
        locationId: locationId ?? undefined,
        kpisOnly: true,
      });
      return {
        expired: data.expired,
        due_7: data.due_7,
        due_30: data.due_30,
        due_60: data.due_60,
        total_outstanding: 0,
        pending_renewals: 0,
      };
    },
    staleTime: STALE.complianceDocuments,
    enabled: options?.enabled ?? true,
  });
}
