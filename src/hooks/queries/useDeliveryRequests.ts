"use client";

import { useQuery } from "@tanstack/react-query";

import { listDeliveryRequests } from "@/lib/maintenance-logistics.functions";
import { queryKeys } from "@/lib/query-keys";

export function useDeliveryRequests(filters?: {
  locationId?: string | null;
  status?: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.maintenance.logistics(filters),
    queryFn: () =>
      listDeliveryRequests({
        locationId: filters?.locationId ?? null,
        status: filters?.status as never,
      }),
  });
}
