import { useQuery } from "@tanstack/react-query";



import { apiGet } from "@/lib/api-client";

import {

  fetchInventoryAlerts,

  fetchInventoryItems,

  fetchInventoryStock,

} from "@/lib/queries/inventory.core";

import { queryKeys } from "@/lib/query-keys";

import { STALE } from "@/lib/query-client";



export function useInventoryItems(options?: { enabled?: boolean }) {

  return useQuery({

    queryKey: queryKeys.inventory.items(),

    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchInventoryItems>>>("/api/inventory"),

    staleTime: STALE.lists,

    enabled: options?.enabled ?? true,

  });

}



export function useInventoryStock(

  locationId?: string | null,

  filters?: { size?: string | null; status?: string },

  options?: { enabled?: boolean },

) {

  return useQuery({

    queryKey: queryKeys.inventory.stock(locationId, filters),

    queryFn: () =>

      apiGet<Awaited<ReturnType<typeof fetchInventoryStock>>>("/api/inventory", {

        view: "stock",

        locationId,

        size: filters?.size ?? undefined,

        status: filters?.status ?? "all",

      }),

    staleTime: STALE.lists,

    enabled: options?.enabled ?? true,

  });

}



export function useInventoryAlerts(locationId?: string | null, options?: { enabled?: boolean }) {

  return useQuery({

    queryKey: queryKeys.inventory.alerts(locationId),

    queryFn: () =>

      apiGet<Awaited<ReturnType<typeof fetchInventoryAlerts>>>("/api/inventory", { view: "alerts", locationId }),

    staleTime: STALE.lists,

    enabled: options?.enabled ?? true,

  });

}


