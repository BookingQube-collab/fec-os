import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type {
  StaffDirectoryListPayload,
  StaffRow,
} from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useStaff(locationId?: string | null, options?: { enabled?: boolean; includeArchived?: boolean }) {
  return useQuery({
    queryKey: queryKeys.people.staff(locationId, options?.includeArchived),
    queryFn: ({ signal }) =>
      apiGet<StaffRow[]>(
        "/api/people",
        { locationId, includeArchived: options?.includeArchived ? "1" : undefined },
        { signal },
      ),
    staleTime: STALE.people,
    enabled: options?.enabled ?? true,
  });
}

export type StaffDirectoryFilters = {
  locationId?: string | null;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  q?: string;
  loc?: string;
  department?: string;
  departmentName?: string;
  position?: string;
  employmentType?: string;
  status?: string;
  nationality?: string;
  gender?: string;
  sponsorship?: string;
  e3?: string;
  missing?: boolean;
  expiry?: string;
  sort?: string;
};

export function useStaffDirectory(
  filters: StaffDirectoryFilters,
  options?: { enabled?: boolean },
) {
  const keyFilters = {
    locationId: filters.locationId ?? null,
    includeArchived: Boolean(filters.includeArchived),
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 25,
    q: filters.q ?? "",
    loc: filters.loc ?? "",
    department: filters.department ?? "",
    departmentName: filters.departmentName ?? "",
    position: filters.position ?? "",
    employmentType: filters.employmentType ?? "",
    status: filters.status ?? "",
    nationality: filters.nationality ?? "",
    gender: filters.gender ?? "",
    sponsorship: filters.sponsorship ?? "",
    e3: filters.e3 ?? "",
    missing: Boolean(filters.missing),
    expiry: filters.expiry ?? "",
    sort: filters.sort ?? "name",
  };

  return useQuery({
    queryKey: queryKeys.people.staffDirectory(keyFilters),
    queryFn: ({ signal }) =>
      apiGet<StaffDirectoryListPayload>(
        "/api/people",
        {
          view: "directory",
          locationId: keyFilters.locationId,
          includeArchived: keyFilters.includeArchived ? "1" : undefined,
          page: keyFilters.page,
          pageSize: keyFilters.pageSize,
          q: keyFilters.q || undefined,
          loc: keyFilters.loc || undefined,
          department: keyFilters.department || undefined,
          departmentName: keyFilters.departmentName || undefined,
          position: keyFilters.position || undefined,
          employmentType: keyFilters.employmentType || undefined,
          status: keyFilters.status || undefined,
          nationality: keyFilters.nationality || undefined,
          gender: keyFilters.gender || undefined,
          sponsorship: keyFilters.sponsorship || undefined,
          e3: keyFilters.e3 || undefined,
          missing: keyFilters.missing ? "1" : undefined,
          expiry: keyFilters.expiry || undefined,
          sort: keyFilters.sort,
        },
        { signal },
      ),
    staleTime: STALE.people,
    enabled: options?.enabled ?? true,
    placeholderData: (prev) => prev,
  });
}
