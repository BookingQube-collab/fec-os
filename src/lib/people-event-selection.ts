/**
 * Shared People → Events selection helpers.
 * Selected event persists via `?eventId=` across workforce tabs.
 */

export function parsePeopleEventId(value: string | null | undefined): string {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : "";
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
