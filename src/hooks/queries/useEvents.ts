import { useQuery } from "@tanstack/react-query";

import {
  getEvent,
  getEventBudget,
  getEventOptions,
  getEventPlan,
  getEventReports,
  getEventScope,
  getEventsDashboard,
  listEventCalendar,
  listEvents,
  listMyEventTasks,
} from "@/lib/events.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export function useEventOptions() {
  return useQuery({
    queryKey: queryKeys.events.options(),
    queryFn: () => getEventOptions(),
    staleTime: STALE.events,
  });
}

export function useEventsDashboard(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.events.dashboard(locationId),
    queryFn: () => getEventsDashboard({ locationId }),
    staleTime: STALE.events,
  });
}

export function useEventsList(filters: Parameters<typeof listEvents>[0]) {
  return useQuery({
    queryKey: queryKeys.events.list(filters ?? {}),
    queryFn: () => listEvents(filters ?? {}),
    staleTime: STALE.events,
  });
}

export function useEventsCalendar(month: string, locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.events.calendar(month, locationId),
    queryFn: () => listEventCalendar({ month, locationId }),
    staleTime: STALE.events,
  });
}

export function useMyEventTasks(locationId?: string | null) {
  return useQuery({
    queryKey: queryKeys.events.myTasks(locationId),
    queryFn: () => listMyEventTasks({ locationId }),
    staleTime: STALE.events,
  });
}

export function useEvent(id?: string | null) {
  return useQuery({
    queryKey: queryKeys.events.detail(id),
    queryFn: () => getEvent({ id: id! }),
    enabled: Boolean(id),
    staleTime: STALE.events,
  });
}

export function useEventScope(eventId?: string | null) {
  return useQuery({
    queryKey: queryKeys.events.scope(eventId),
    queryFn: () => getEventScope({ eventId: eventId! }),
    enabled: Boolean(eventId),
    staleTime: STALE.events,
  });
}

export function useEventPlan(eventId?: string | null) {
  return useQuery({
    queryKey: queryKeys.events.plan(eventId),
    queryFn: () => getEventPlan({ eventId: eventId! }),
    enabled: Boolean(eventId),
    staleTime: STALE.events,
  });
}

export function useEventReports(filters: Parameters<typeof getEventReports>[0]) {
  return useQuery({
    queryKey: queryKeys.events.reports(filters ?? {}),
    queryFn: () => getEventReports(filters ?? {}),
    staleTime: STALE.events,
  });
}

export function useEventBudget(eventId?: string | null) {
  return useQuery({
    queryKey: queryKeys.events.budget(eventId),
    queryFn: () => getEventBudget({ eventId: eventId! }),
    enabled: Boolean(eventId),
    staleTime: STALE.events,
  });
}
