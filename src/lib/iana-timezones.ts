/**
 * In-process IANA timezone names. PostgREST loads `pg_timezone_names` on every
 * schema-cache rebuild (not an app query) — never validate timezones via SQL.
 */

const FALLBACK_TIMEZONES = [
  "Asia/Qatar",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
  "UTC",
  "Europe/London",
  "America/New_York",
] as const;

let cached: readonly string[] | null = null;

/** Module-level cache of IANA zone names (Intl when available). */
export function listIanaTimezones(): readonly string[] {
  if (cached) return cached;
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === "function") {
      cached = Object.freeze([...intl.supportedValuesOf("timeZone")].sort());
      return cached;
    }
  } catch {
    // Older runtimes — fall through.
  }
  cached = FALLBACK_TIMEZONES;
  return cached;
}

export function isIanaTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const zones = listIanaTimezones();
  if (zones.includes(trimmed)) return true;
  // Intl list can lag Postgres; accept common Asia/Qatar default always.
  return trimmed === "Asia/Qatar";
}
