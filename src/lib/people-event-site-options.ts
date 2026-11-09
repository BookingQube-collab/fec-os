import type { PeopleEventOption } from "@/lib/people-event-workforce.functions";

export type EventSiteOption = {
  id: string;
  label: string;
};

/**
 * Site/Branch options for People → Event workforce filters.
 * Only locations linked to the given events (or the selected event) —
 * never the full FEC mall/roster catalog from useSites()/`/api/sites`.
 */
export function eventSiteOptionsFromEvents(
  events: PeopleEventOption[],
  selectedEventId?: string | null,
): EventSiteOption[] {
  const scoped =
    selectedEventId && selectedEventId.length > 0
      ? events.filter((ev) => ev.id === selectedEventId)
      : events;

  // If the selected event is not in the list yet, keep options from all events
  // so a URL-deep-linked locationId is not wiped during load.
  const source = scoped.length > 0 || !selectedEventId ? scoped : events;

  const map = new Map<string, string>();
  for (const ev of source) {
    if (!ev.locationId) continue;
    if (!map.has(ev.locationId)) {
      map.set(ev.locationId, ev.locationName?.trim() || ev.locationId);
    }
  }

  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Keep the event picker aligned with the Site/Branch filter. */
export function filterPeopleEventsByLocation(
  events: PeopleEventOption[],
  locationId: string | null | undefined,
): PeopleEventOption[] {
  if (!locationId) return events;
  return events.filter((ev) => ev.locationId === locationId);
}
