import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { CeoIncidentRow, CeoOverview, CeoUrgentTicketRow } from "@/lib/queries/ceo.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useCeoOverview(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.ceo.overview(),
    queryFn: () => apiGet<CeoOverview>("/api/ceo/overview"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useCeoUrgentTickets(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.ceo.tickets(),
    queryFn: () => apiGet<CeoUrgentTicketRow[]>("/api/ceo/tickets"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useCeoIncidents24h(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.ceo.incidents(),
    queryFn: () => apiGet<CeoIncidentRow[]>("/api/ceo/incidents"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}
