import { uniqueEventProjectNames } from "@/lib/procurement/event-link";

export const OPEN_MAINT_STATUSES = new Set(["submitted", "accepted", "in_progress"]);

export function eventNoteTag(event: { id: string; event_number?: string | null }): string {
  return event.event_number?.trim() ? `Event: ${event.event_number.trim()}` : `Event: ${event.id}`;
}

export function appendEventNote(existing: string | null | undefined, event: { id: string; event_number?: string | null }): string {
  const tag = eventNoteTag(event);
  const current = existing?.trim() ?? "";
  if (current.toLowerCase().includes(tag.toLowerCase()) || current.includes(event.id)) return current || tag;
  return current ? `${current}\n${tag}` : tag;
}

export function textMatchesEvent(
  text: string | null | undefined,
  event: { id: string; name?: string | null; event_name?: string | null; event_number?: string | null },
): boolean {
  if (!text?.trim()) return false;
  const hay = text.toLowerCase();
  if (hay.includes(event.id.toLowerCase())) return true;
  return uniqueEventProjectNames(event).some((name) => hay.includes(name.toLowerCase()));
}

export function isMissingEventColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "42703" || code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("event_id") && (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find"));
}

export function eventOpsUrls(eventId: string, locationId?: string | null) {
  const loc = locationId ? `&locationId=${locationId}` : "";
  return {
    prs: `/procurement/requisitions?eventId=${eventId}`,
    newPr: `/procurement/requisitions/new?eventId=${eventId}`,
    maintenance: `/maintenance/requests?eventId=${eventId}${loc}`,
    newMaintenance: `/maintenance/requests?eventId=${eventId}${loc}&tab=new`,
    people: `/people?eventId=${eventId}${loc}&tab=staff`,
    roster: `/daily-ops/roster?eventId=${eventId}${loc}`,
    inventory: `/inventory?eventId=${eventId}${loc}`,
    logistics: `/maintenance/logistics?eventId=${eventId}${loc}`,
    snags: `/snags?eventId=${eventId}${loc}`,
    newSnag: `/snags?eventId=${eventId}${loc}&new=1`,
  };
}
