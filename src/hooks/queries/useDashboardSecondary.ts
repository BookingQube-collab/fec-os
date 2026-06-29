import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { DashboardChartsPayload } from "@/lib/queries/dashboard-kpis.core";
import type { ExecutiveComplianceKpiPayload } from "@/lib/queries/compliance-kpis.core";
import type { ComplianceRenewalRow } from "@/lib/queries/amc-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface DashboardSecondaryOptions {
  locationId: string | null;
  year: number;
  utilityBase?: number;
  include?: ("charts" | "complianceKpis" | "renewals")[];
  renewalsLimit?: number;
  locationCode?: string | null;
  enabled?: boolean;
}

type DashboardSecondaryPayload = {
  charts?: DashboardChartsPayload;
  complianceKpis?: ExecutiveComplianceKpiPayload;
  renewals?: ComplianceRenewalRow[];
};

/** Single auth + parallel RPCs for deferred dashboard widgets. */
export function useDashboardSecondary(options: DashboardSecondaryOptions) {
  const {
    locationId,
    year,
    utilityBase,
    include = [],
    renewalsLimit = 50,
    locationCode,
    enabled = false,
  } = options;
  const includeKey = include.slice().sort().join(",");

  return useQuery({
    queryKey: queryKeys.dashboard.secondary(locationId, year, includeKey, utilityBase),
    queryFn: () =>
      apiGet<DashboardSecondaryPayload>("/api/dashboard/secondary", {
        locationId: locationId ?? undefined,
        year,
        utilityBase,
        include: includeKey,
        renewalsLimit,
        locationCode: locationCode ?? undefined,
      }),
    staleTime: STALE.dashboardCharts,
    enabled: enabled && include.length > 0,
  });
}
