import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { DealCategory, ImportKind } from "@/lib/corporate-deals/constants";

export function useCorporateDealReport(week?: string | null) {
  const qs = week ? `?week=${encodeURIComponent(week)}` : "";
  return useQuery({
    queryKey: queryKeys.corporateDeals.report(week),
    queryFn: () => apiGet<Record<string, unknown>>(`/api/corporate-deals${qs}`),
    staleTime: STALE.lists,
  });
}

export function useCorporateDealCodes(unmappedOnly = false) {
  return useQuery({
    queryKey: queryKeys.corporateDeals.codes(unmappedOnly),
    queryFn: () =>
      apiGet<unknown[]>(
        `/api/corporate-deals?view=codes${unmappedOnly ? "&unmapped=1" : ""}`,
      ),
    staleTime: STALE.lists,
  });
}

export function useCorporateDealPartners() {
  return useQuery({
    queryKey: queryKeys.corporateDeals.partners(),
    queryFn: () => apiGet<unknown[]>("/api/corporate-deals?view=partners"),
    staleTime: STALE.lists,
  });
}

export function useCorporateDealLog(week?: string | null) {
  return useQuery({
    queryKey: queryKeys.corporateDeals.log(week),
    queryFn: () =>
      apiGet<unknown[]>(
        `/api/corporate-deals?view=log${week ? `&week=${encodeURIComponent(week)}` : ""}`,
      ),
    staleTime: STALE.lists,
  });
}

export function useCorporateDealMom() {
  return useQuery({
    queryKey: queryKeys.corporateDeals.mom(),
    queryFn: () => apiGet<unknown[]>("/api/corporate-deals?view=mom"),
    staleTime: STALE.lists,
  });
}

export function useCorporateDealImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/corporate-deals", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.corporateDeals.all });
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReview.all });
    },
  });
}

export type SaveCodeInput = {
  action: "save_code";
  id?: string;
  promocode: string;
  partner_name?: string | null;
  category: DealCategory;
  venue: string;
  notes?: string | null;
};

export type ImportInput = {
  action: "preview" | "commit";
  csv: string;
  kind: ImportKind;
  period?: string | null;
  replace?: boolean;
};
