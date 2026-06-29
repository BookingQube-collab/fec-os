"use client";

import { useQuery } from "@tanstack/react-query";

import { listMaintenanceRequests } from "@/lib/maintenance-requests.functions";
import { queryKeys } from "@/lib/query-keys";

export function useMaintenanceRequests(filters?: {
  locationId?: string | null;
  status?: string | null;
  mine?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.maintenance.requests(filters),
    queryFn: () =>
      listMaintenanceRequests({
        locationId: filters?.locationId ?? null,
        status: (filters?.status as "submitted" | null) ?? null,
        mine: filters?.mine,
      }),
  });
}
