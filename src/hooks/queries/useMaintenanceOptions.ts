import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { MaintenanceOptionKind, MaintenanceOptionRow } from "@/lib/maintenance/request-options";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useMaintenanceOptions(
  kind: MaintenanceOptionKind,
  options?: { activeOnly?: boolean; enabled?: boolean },
) {
  const activeOnly = options?.activeOnly ?? true;
  return useQuery({
    queryKey: queryKeys.maintenanceOptions.list(kind, activeOnly),
    queryFn: () =>
      apiGet<MaintenanceOptionRow[]>("/api/maintenance/options", {
        kind,
        activeOnly: activeOnly ? true : undefined,
      }),
    staleTime: STALE.sites,
    enabled: options?.enabled ?? true,
  });
}
