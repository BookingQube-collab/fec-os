import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type {
  DailyOpsKpis,
} from "@/lib/queries/daily-ops.core";

export function useDailyOpsKpis(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyOps.kpis(locationId),
    queryFn: () => {
      const qs = locationId ? `?locationId=${locationId}` : "";
      return apiGet<DailyOpsKpis>(`/api/daily-ops/kpis${qs}`);
    },
    staleTime: STALE.dashboardKpis,
  });
}

export function useShiftBriefings(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyOps.briefings(locationId),
    queryFn: () => {
      const qs = locationId ? `?locationId=${locationId}` : "";
      return apiGet<Record<string, unknown>[]>(`/api/daily-ops/briefings${qs}`);
    },
    staleTime: STALE.lists,
  });
}

export function useDailyOpsIncidents(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyOps.incidents(locationId),
    queryFn: () => {
      const qs = locationId ? `?locationId=${locationId}` : "";
      return apiGet<Record<string, unknown>[]>(`/api/daily-ops/incidents${qs}`);
    },
    staleTime: STALE.lists,
  });
}

export function useDailyOpsMaintenance(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyOps.maintenance(locationId),
    queryFn: () => {
      const qs = locationId ? `?locationId=${locationId}` : "";
      return apiGet<Record<string, unknown>[]>(`/api/daily-ops/maintenance${qs}`);
    },
    staleTime: STALE.lists,
  });
}

export function useDailyOpsRoster(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyOps.roster(locationId),
    queryFn: () => {
      const qs = locationId ? `?locationId=${locationId}` : "";
      return apiGet<Record<string, unknown>[]>(`/api/daily-ops/roster${qs}`);
    },
    staleTime: STALE.lists,
  });
}

export function useDailyOpsShiftRoster(
  locationId?: string | null,
  from?: string | null,
  to?: string | null,
) {
  return useQuery({
    queryKey: queryKeys.dailyOps.shiftRoster(locationId, from, to),
    queryFn: () => {
      const p = new URLSearchParams({ view: "shifts" });
      if (locationId) p.set("locationId", locationId);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      return apiGet<Record<string, unknown>[]>(`/api/daily-ops/roster?${p.toString()}`);
    },
    staleTime: STALE.lists,
  });
}

export function useDailyOpsRosterUploads(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyOps.rosterUploads(locationId),
    queryFn: () => {
      const p = new URLSearchParams({ view: "uploads" });
      if (locationId) p.set("locationId", locationId);
      return apiGet<Record<string, unknown>[]>(`/api/daily-ops/roster?${p.toString()}`);
    },
    staleTime: STALE.lists,
  });
}

export function useDailyOpsComplaints(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyOps.complaints(locationId),
    queryFn: () => {
      const qs = locationId ? `?locationId=${locationId}` : "";
      return apiGet<Record<string, unknown>[]>(`/api/daily-ops/complaints${qs}`);
    },
    staleTime: STALE.lists,
  });
}
