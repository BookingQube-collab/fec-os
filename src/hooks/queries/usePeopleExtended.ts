import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import {
  fetchAttendanceDailySummary,
  fetchAttendanceExceptions,
  fetchShifts,
  fetchTraining,
} from "@/lib/queries/people-extended.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useShifts(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.people.shifts(locationId),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchShifts>>>("/api/people/shifts", { locationId }),
    staleTime: STALE.people,
    enabled: (options?.enabled ?? true) && Boolean(locationId),
  });
}

export function useTraining(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.people.training(locationId),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchTraining>>>("/api/people/shifts", { view: "training", locationId }),
    staleTime: STALE.people,
    enabled: options?.enabled ?? true,
  });
}

export function useAttendanceDailySummary(
  locationId?: string | null,
  options?: { enabled?: boolean; dateFrom?: string; dateTo?: string },
) {
  const { dateFrom, dateTo, enabled = true } = options ?? {};
  return useQuery({
    queryKey: queryKeys.people.attendanceSummary({ locationId, dateFrom, dateTo }),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchAttendanceDailySummary>>>("/api/people/shifts", {
        view: "attendance-summary",
        locationId,
        dateFrom,
        dateTo,
      }),
    staleTime: STALE.people,
    enabled,
  });
}

export function useAttendanceExceptions(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.people.attendanceExceptions(locationId),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchAttendanceExceptions>>>("/api/people/shifts", {
        view: "attendance-exceptions",
        locationId,
      }),
    staleTime: STALE.people,
    enabled: options?.enabled ?? true,
  });
}
