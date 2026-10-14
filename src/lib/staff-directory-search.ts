/** Staff columns the People directory search may scan. Passport is a separate id lookup. */
export const STAFF_DIRECTORY_SEARCH_COLUMNS = [
  "full_name",
  "employee_code",
  "qid",
  "phone",
  "job_title",
] as const;

const SEARCH_OR_UNSAFE = /[%_,()"]/g;
const STAFF_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip characters that break a PostgREST `.or()` value. Apostrophes stay so O'Brien still matches. */
export function staffDirectorySearchNeedle(raw: string): string {
  return raw.replace(SEARCH_OR_UNSAFE, "").trim();
}

/**
 * PostgREST `.or()` fragment for a directory search.
 * Null when nothing safe remains, so the caller keeps the unfiltered roster query.
 */
export function staffDirectorySearchOrFilter(
  raw: string,
  passportStaffIds: readonly string[] = [],
): string | null {
  const safe = staffDirectorySearchNeedle(raw);
  const ids = [...new Set(passportStaffIds.filter((id) => STAFF_ID.test(id)))].slice(0, 40);
  if (!safe && ids.length === 0) return null;
  const parts: string[] = [];
  if (safe) {
    const pattern = `%${safe}%`;
    for (const column of STAFF_DIRECTORY_SEARCH_COLUMNS) {
      parts.push(`${column}.ilike."${pattern}"`);
    }
  }
  if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
  return parts.join(",");
}
