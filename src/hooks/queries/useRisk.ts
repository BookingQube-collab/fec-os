import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { fetchRiskRegister, fetchRiskSummary } from "@/lib/queries/risk.core";
import type { RiskFilters } from "@/lib/queries/risk.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useRiskRegister(filters: RiskFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.risk.list(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchRiskRegister>>>(
        "/api/risk",
        filters as Record<string, string | number | null | undefined>,
      ),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useRiskSummary(filters: RiskFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.risk.summary(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchRiskSummary>>>("/api/risk", { ...filters, summary: true }),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}
