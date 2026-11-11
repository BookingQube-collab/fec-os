/**
 * Shared People → Events selection helpers.
 * Selected event persists via `?eventId=` across workforce tabs.
 */

import { shortEventFilterLabel } from "@/lib/staff-directory-cohorts";

export function parsePeopleEventId(value: string | null | undefined): string {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

/** Event picker label: event name only (no EVT number / venue). */
export function peopleEventSelectLabel(event: {
  name?: string | null;
  eventNumber?: string | null;
  event_name?: string | null;
  event_number?: string | null;
}): string {
  return shortEventFilterLabel({
    name: event.name,
    event_name: event.event_name,
    event_number: event.eventNumber ?? event.event_number,
  });
}

/** Persist HOO seed-demo banner dismiss across People event tabs. */
export const EVENT_WORKFORCE_DEMO_HIDDEN_KEY = "fec.people.eventWorkforceDemo.hidden";

export function readEventWorkforceDemoHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(EVENT_WORKFORCE_DEMO_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeEventWorkforceDemoHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (hidden) window.localStorage.setItem(EVENT_WORKFORCE_DEMO_HIDDEN_KEY, "1");
    else window.localStorage.removeItem(EVENT_WORKFORCE_DEMO_HIDDEN_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Build a People Events path that keeps the shared event selection. */
export function peopleEventHref(
  pathname: string,
  eventId: string | null | undefined,
  extra?: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  const id = parsePeopleEventId(eventId);
  if (id) params.set("eventId", id);
  if (extra) {
    for (const [key, raw] of Object.entries(extra)) {
      if (raw == null || raw === "") continue;
      params.set(key, raw);
    }
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
