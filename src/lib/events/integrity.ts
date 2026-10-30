/** Defense-in-depth same-event checks for event PM upserts (paired with DB triggers). */

export class CrossEventIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossEventIntegrityError";
  }
}

export function assertIdsSameEvent(
  eventId: string,
  relatedEventId: string | null | undefined,
  field: string,
): void {
  if (relatedEventId == null) return;
  if (relatedEventId !== eventId) {
    throw new CrossEventIntegrityError(`${field} must belong to the same event`);
  }
}

export function assertOptionalRefsSameEvent(
  eventId: string,
  refs: Array<{ field: string; eventId: string | null | undefined }>,
): void {
  for (const ref of refs) {
    assertIdsSameEvent(eventId, ref.eventId, ref.field);
  }
}

/** Storage object path: `{event_id}/{doc_id}/{timestamp}-{safeName}`. */
export function buildEventDocumentStoragePath(
  eventId: string,
  documentId: string,
  safeFileName: string,
  now = Date.now(),
): string {
  if (!eventId || !documentId) {
    throw new CrossEventIntegrityError("event_id and document id are required for storage path");
  }
  const safe = safeFileName.replace(/^\/+/, "").replace(/\.\./g, "_");
  return `${eventId}/${documentId}/${now}-${safe}`;
}

/** True when object name first segment equals event UUID. */
export function eventDocumentPathMatchesEvent(path: string | null | undefined, eventId: string): boolean {
  if (!path) return false;
  const first = path.split("/").filter(Boolean)[0];
  return first === eventId;
}
