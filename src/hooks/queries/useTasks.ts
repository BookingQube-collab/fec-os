import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { TaskFilters, TaskInstanceRow, TaskTemplateRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useTaskInstances(filters: TaskFilters = {}, options?: { enabled?: boolean }) {
  const key = {
    locationId: filters.locationId ?? null,
    status: filters.status ?? null,
  };
  return useQuery({
    queryKey: queryKeys.tasks.instances(key),
    queryFn: () => apiGet<TaskInstanceRow[]>("/api/tasks", { ...key, type: "instances" }),
    staleTime: STALE.tasks,
    enabled: options?.enabled ?? true,
  });
}

export function useTaskTemplates(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.tasks.templates({ locationId: locationId ?? null }),
    queryFn: () => apiGet<TaskTemplateRow[]>("/api/tasks", { locationId, type: "templates" }),
    staleTime: STALE.tasks,
    enabled: options?.enabled ?? true,
  });
}
