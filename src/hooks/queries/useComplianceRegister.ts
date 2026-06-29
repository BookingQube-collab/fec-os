import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { ComplianceRegisterFilters, ComplianceEnrichedItem } from "@/lib/queries/compliance-register.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useComplianceRegister(
  filters: ComplianceRegisterFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.complianceRegister.list(filters),
    queryFn: () =>
      apiGet<ComplianceEnrichedItem[]>("/api/compliance/register", filters as Record<string, string | number | boolean | null | undefined>),
    staleTime: STALE.complianceRegister,
    enabled: options?.enabled ?? true,
  });
}

export function useComplianceRegisterKpis(
  filters: ComplianceRegisterFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.complianceRegister.kpis(filters),
    queryFn: () =>
      apiGet<{
        total: number;
        expired: number;
        due30: number;
        active: number;
        critical: number;
        healthPct: number;
      }>("/api/compliance/register", { ...filters, kpisOnly: true }),
    staleTime: STALE.complianceRegister,
    enabled: options?.enabled ?? true,
  });
}
