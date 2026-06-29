import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { ExecutiveComplianceKpiPayload } from "@/lib/queries/compliance-kpis.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useExecutiveComplianceKpis(
  locationId?: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.executiveKpis(locationId ?? null),
    queryFn: () =>
      apiGet<ExecutiveComplianceKpiPayload>("/api/compliance/kpis", {
        locationId: locationId ?? undefined,
      }),
    staleTime: STALE.complianceRenewals,
    enabled: options?.enabled ?? false,
  });
}
