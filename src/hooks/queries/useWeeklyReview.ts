import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { ReviewListItem, SaveWeeklyReviewInput } from "@/lib/queries/weekly-review.core";
import type { ReviewPack } from "@/lib/weekly-review/model";

export function useWeeklyReviewList() {
  return useQuery({
    queryKey: queryKeys.weeklyReview.list(),
    queryFn: () => apiGet<ReviewListItem[]>("/api/weekly-review"),
    staleTime: STALE.lists,
  });
}

export function useWeeklyReviewPack(id?: string | null) {
  return useQuery({
    queryKey: queryKeys.weeklyReview.detail(id),
    queryFn: () => apiGet<ReviewPack>(`/api/weekly-review/${id}`),
    enabled: Boolean(id),
    staleTime: STALE.lists,
  });
}

export function useCreateWeeklyReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ id: string }>("/api/weekly-review"),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.weeklyReview.all }),
  });
}

export function useSaveWeeklyReview(id?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveWeeklyReviewInput) => apiPatch<ReviewPack>(`/api/weekly-review/${id}`, body),
    onSuccess: (pack) => {
      qc.setQueryData(queryKeys.weeklyReview.detail(pack.review.id), pack);
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReview.list() });
    },
  });
}
