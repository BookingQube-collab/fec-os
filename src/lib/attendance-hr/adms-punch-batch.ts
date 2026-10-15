import { isIgnorablePunchInsertError } from "./parse-adms";

/** Proposed chunk size for a later upsert. Not used by ingest yet. */
export const ADMS_PUNCH_INSERT_CHUNK_SIZE = 100;

export function chunkPunchRows<T>(rows: T[], size = ADMS_PUNCH_INSERT_CHUNK_SIZE): T[][] {
  const chunkSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}

/**
 * Null means the existing unique-punch conflict. Any other error message must
 * still be thrown. This does not treat a missing error as success.
 */
export function punchInsertFailureMessage(
  error: { code?: string; message?: string } | null | undefined,
): string | null {
  if (!error) return null;
  if (isIgnorablePunchInsertError(error)) return null;
  const message = error.message?.trim();
  return message || "Punch insert failed.";
}
