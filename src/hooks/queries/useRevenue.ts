import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import {
  fetchAssetRoiLeague,
  fetchBranchPnL,
  fetchLeakageCases,
} from "@/lib/queries/revenue.core";
import type { BookingQubeSyncStatus, MonthlyRevenueProgress, RevenuePace } from "@/lib/queries/revenue.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useRevenuePace(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.revenue.pace(locationId),
    queryFn: () => apiGet<RevenuePace>("/api/revenue/pace", { locationId }),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useBranchPnL(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.revenue.pnl(),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchBranchPnL>>>("/api/revenue/pnl"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useLeakageCases(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.revenue.leakage(locationId),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchLeakageCases>>>("/api/revenue/leakage", { locationId }),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useAssetRoiLeague(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.revenue.assetRoi(locationId),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchAssetRoiLeague>>>("/api/revenue/asset-roi", { locationId }),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useMonthlyRevenueProgress(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.revenue.monthlyProgress(locationId),
    queryFn: () => apiGet<MonthlyRevenueProgress>("/api/revenue/monthly-progress", { locationId }),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useBookingQubeSyncStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.revenue.syncStatus(),
    queryFn: () => apiGet<BookingQubeSyncStatus>("/api/revenue/sync-status"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}
