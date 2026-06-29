import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import {
  fetchBranchPack,
  fetchEstateRollup,
  fetchExceptionsFeed,
  fetchHandoverDigest,
  fetchHandovers,
} from "@/lib/queries/occ.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useEstateRollup(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: queryKeys.occ.rollup(),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchEstateRollup>>>("/api/occ/rollup"),
    staleTime: STALE.occRollup,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });
}

export function useBranchPack(locationId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.occ.branchPack(locationId),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchBranchPack>>>("/api/occ/branch", { locationId }),
    staleTime: STALE.lists,
    enabled: (options?.enabled ?? true) && !!locationId,
  });
}

export function useHandoverDigest(locationId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.occ.handoverDigest(locationId),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchHandoverDigest>>>("/api/occ/handover", { locationId }),
    staleTime: STALE.lists,
    enabled: (options?.enabled ?? true) && !!locationId,
  });
}

export function useHandovers(locationId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.occ.handovers(locationId),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchHandovers>>>("/api/occ/handover", { locationId, list: true }),
    staleTime: STALE.lists,
    enabled: (options?.enabled ?? true) && !!locationId,
  });
}

export function useExceptionsFeed(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: queryKeys.occ.exceptions(),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchExceptionsFeed>>>("/api/occ/exceptions"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });
}
