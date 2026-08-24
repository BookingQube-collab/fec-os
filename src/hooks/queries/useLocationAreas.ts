import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { LocationAreaRow } from "@/lib/location-areas";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useLocationAreas(
  locationId: string | null | undefined,
  options?: { activeOnly?: boolean; enabled?: boolean },
) {
  const activeOnly = options?.activeOnly ?? false;
  return useQuery({
    queryKey: queryKeys.locationAreas.list(locationId ?? null, activeOnly),
    queryFn: () =>
      apiGet<LocationAreaRow[]>("/api/location-areas", {
        locationId: locationId ?? undefined,
        activeOnly: activeOnly ? true : undefined,
      }),
    staleTime: STALE.sites,
    enabled: (options?.enabled ?? true) && !!locationId,
  });
}
