"use client";

import { useQuery } from "@tanstack/react-query";

import { getMyDirectReports } from "@/lib/reporting-manager-access.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useMyDirectReports() {
  return useQuery({
    queryKey: queryKeys.people.directReports(),
    queryFn: () => getMyDirectReports(),
    staleTime: STALE.people,
  });
}

export function useHasDirectReports() {
  const query = useMyDirectReports();
  return {
    ...query,
    hasDirectReports: (query.data?.directReportStaffIds.length ?? 0) > 0,
  };
}
