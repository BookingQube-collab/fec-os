import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { BookingFilters, BookingListRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useBookings(filters: BookingFilters = {}, options?: { enabled?: boolean }) {
  const key = {
    locationId: filters.locationId ?? null,
    status: filters.status ?? null,
    kind: filters.kind ?? null,
    page: filters.page ?? 1,
  };
  return useQuery({
    queryKey: queryKeys.bookings.list(key),
    queryFn: () =>
      apiGet<{ items: BookingListRow[]; total: number }>("/api/bookings", {
        locationId: filters.locationId,
        status: filters.status,
        kind: filters.kind,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 50,
      }),
    staleTime: STALE.bookings,
    enabled: options?.enabled ?? true,
  });
}
