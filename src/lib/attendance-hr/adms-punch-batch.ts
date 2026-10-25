import { isIgnorablePunchInsertError } from "./parse-adms";

/** Chunk size for attendance_logs inserts (PostgREST body + unique hash races). */
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

type PunchHashRow = { punch_hash?: string | null };

/**
 * Drop rows whose punch_hash is already stored. Rows without a hash always pass
 * through (unique index is partial on punch_hash IS NOT NULL).
 */
export function partitionFreshPunchRows<T extends PunchHashRow>(
  rows: T[],
  existingHashes: Iterable<string>,
): { fresh: T[]; duplicates: number } {
  const known = new Set(
    [...existingHashes].map((hash) => hash.trim()).filter(Boolean),
  );
  if (!known.size) return { fresh: rows, duplicates: 0 };
  const fresh: T[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const hash = row.punch_hash?.trim() ?? "";
    if (hash && known.has(hash)) {
      duplicates += 1;
      continue;
    }
    if (hash) known.add(hash);
    fresh.push(row);
  }
  return { fresh, duplicates };
}

type PunchInsertError = { code?: string; message?: string } | null;

/** Minimal PostgREST surface used by the batch helper (AdminClient satisfies this). */
export type PunchInsertClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase builder chain
  from: (table: "attendance_logs") => any;
};

/**
 * One hash probe + chunked inserts. On a unique conflict in a chunk, falls back
 * to per-row inserts for that chunk so siblings still land.
 */
export async function insertAttendancePunchRows<T extends PunchHashRow>(
  sb: PunchInsertClient,
  rows: T[],
): Promise<{ inserted: T[]; duplicates: number }> {
  if (!rows.length) return { inserted: [], duplicates: 0 };

  const hashes = [
    ...new Set(rows.map((row) => row.punch_hash?.trim() ?? "").filter(Boolean)),
  ];
  const existing = new Set<string>();
  for (const chunk of chunkPunchRows(hashes, 200)) {
    const { data, error } = (await sb
      .from("attendance_logs")
      .select("punch_hash")
      .in("punch_hash", chunk)) as {
      data: Array<{ punch_hash: string | null }> | null;
      error: PunchInsertError;
    };
    if (error) throw new Error(error.message || "Punch hash probe failed.");
    for (const row of data ?? []) {
      const hash = row.punch_hash?.trim();
      if (hash) existing.add(hash);
    }
  }

  const { fresh, duplicates: knownDupes } = partitionFreshPunchRows(rows, existing);
  const inserted: T[] = [];
  let duplicates = knownDupes;

  for (const chunk of chunkPunchRows(fresh)) {
    const { error } = (await sb.from("attendance_logs").insert(chunk)) as {
      error: PunchInsertError;
    };
    if (!error) {
      inserted.push(...chunk);
      continue;
    }
    // Unique races (or one bad row) — finish the chunk row-by-row.
    for (const row of chunk) {
      const one = (await sb.from("attendance_logs").insert([row])) as {
        error: PunchInsertError;
      };
      if (!one.error) {
        inserted.push(row);
        continue;
      }
      if (isIgnorablePunchInsertError(one.error)) {
        duplicates += 1;
        continue;
      }
      const message = punchInsertFailureMessage(one.error);
      throw new Error(message ?? "Punch insert failed.");
    }
  }

  return { inserted, duplicates };
}
