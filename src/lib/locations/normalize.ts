import { E3_WEEKLY_LOCATIONS } from "@/lib/weekly-reports/constants";

export const CANONICAL_LOCATION_CODES = [
  "INF-CC",
  "KDS-CC",
  "UA-DM",
  "KDS-DM",
  "CB-VM",
  "CB-DSM",
  "CAR-AP",
  "WM-VM",
] as const;

export type CanonicalLocationCode = (typeof CANONICAL_LOCATION_CODES)[number];

/** Sheet labels from the E3 Employee Roster export — match only, never insert. */
export const ROSTER_SHEET_LABELS: Record<string, CanonicalLocationCode> = {
  "Inflatapark - City Center": "INF-CC",
  "Kids Driving School - City Center": "KDS-CC",
  "Urban Arena - Doha Mall": "UA-DM",
  "Kids Driving School Mini - Doha Mall": "KDS-DM",
  "Crayons & Bricks - Vendome Mall": "CB-VM",
  "Crayons & Bricks - Dar Al Salam Mall": "CB-DSM",
  "Carousel - Aspire Park": "CAR-AP",
  "Winter Mirage - Vendome Mall": "WM-VM",
};

export const ROSTER_SHEET_LABEL_BY_CODE: Record<CanonicalLocationCode, string> = Object.fromEntries(
  Object.entries(ROSTER_SHEET_LABELS).map(([label, code]) => [code, label]),
) as Record<CanonicalLocationCode, string>;

export function rosterSheetLabel(code: string, fallbackName?: string | null): string {
  return ROSTER_SHEET_LABEL_BY_CODE[code as CanonicalLocationCode] ?? fallbackName ?? code;
}

/** Live name plus region, e.g. `Inflatapark - City Center Doha`. Skips empty parts. */
export function formatLocationName(name?: string | null, region?: string | null): string {
  const n = (name ?? "").trim();
  const r = (region ?? "").trim();
  if (n && r && !n.toLowerCase().includes(r.toLowerCase())) return `${n} - ${r}`;
  return n || r;
}

/**
 * User-facing venue label: `INF-CC — Inflatapark - City Center`.
 * Skips empty parts; never returns a blank string.
 */
export function formatLocationLabel(code?: string | null, name?: string | null): string {
  const c = (code ?? "").trim();
  const n = (name ?? "").trim();
  if (c && n && n.toUpperCase() !== c.toUpperCase()) return `${c} — ${n}`;
  return c || n || "—";
}

/** Compose code + live name/region from a locations row. */
export function formatLocationRecord(
  loc: { code?: string | null; name?: string | null; region?: string | null } | null | undefined,
): string {
  if (!loc) return "—";
  return formatLocationLabel(loc.code, formatLocationName(loc.name, loc.region) || loc.name);
}

const LOCATION_DISPLAY_SPLIT = /\s*[—–]\s*|\s+·\s+/;

export function normalizeLocationKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildLocationAliases(): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const loc of E3_WEEKLY_LOCATIONS) {
    aliases[normalizeLocationKey(`${loc.name} - ${loc.venue}`)] = loc.code;
    aliases[normalizeLocationKey(`${loc.name} ${loc.venue}`)] = loc.code;
    aliases[normalizeLocationKey(loc.code)] = loc.code;
    if (loc.code === "INF-CC") {
      aliases[normalizeLocationKey("Inflatapark")] = loc.code;
      aliases[normalizeLocationKey("Inflatapark - City Center")] = loc.code;
      aliases[normalizeLocationKey("Inflatapark City Center")] = loc.code;
      aliases[normalizeLocationKey("InflataPark - City Center")] = loc.code;
    }
    if (loc.code === "KDS-CC") {
      aliases[normalizeLocationKey("Kids Driving School - City Center")] = loc.code;
    }
    if (loc.code === "UA-DM") {
      aliases[normalizeLocationKey("Urban Arena - Doha Mall")] = loc.code;
    }
    if (loc.code === "CAR-AP") {
      aliases[normalizeLocationKey("Carousel - Aspire Park")] = loc.code;
    }
    if (loc.code === "KDS-DM") {
      aliases[normalizeLocationKey("Kids Driving School Mini - Doha Mall")] = loc.code;
      aliases[normalizeLocationKey("Kids Mini Driving School - Doha Mall")] = loc.code;
      aliases[normalizeLocationKey("Kids Mini Driving School")] = loc.code;
    }
  }

  for (const [label, code] of Object.entries(ROSTER_SHEET_LABELS)) {
    aliases[normalizeLocationKey(label)] = code;
    aliases[normalizeLocationKey(code)] = code;
  }

  aliases[normalizeLocationKey("Winter Mirage - Vendome Mall")] = "WM-VM";
  aliases[normalizeLocationKey("Winter Mirage Vendome Mall")] = "WM-VM";
  aliases[normalizeLocationKey("WM-VM")] = "WM-VM";

  return aliases;
}

/** Friendly location labels from HR / biometric / roster exports. */
export const LOCATION_ALIASES: Record<string, string> = buildLocationAliases();

export type LocationLookup = { id: string; code: string; name: string; region: string | null };

export function resolveLocationCode(
  raw: string | null | undefined,
  locations: LocationLookup[] = [],
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const asCode = trimmed.toUpperCase();
  if ((CANONICAL_LOCATION_CODES as readonly string[]).includes(asCode)) return asCode;

  const displayParts = trimmed.split(LOCATION_DISPLAY_SPLIT).map((part) => part.trim()).filter(Boolean);
  if (displayParts.length >= 2) {
    const head = displayParts[0]?.toUpperCase() ?? "";
    if ((CANONICAL_LOCATION_CODES as readonly string[]).includes(head)) return head;
    const fromName = resolveLocationCode(displayParts.slice(1).join(" - "), locations);
    if (fromName) return fromName;
  }

  const key = normalizeLocationKey(trimmed);
  const alias = LOCATION_ALIASES[key];
  if (alias) return alias;

  for (const loc of locations) {
    if (loc.code.toUpperCase() === asCode) return loc.code;
    const combined = normalizeLocationKey(`${loc.name} - ${loc.region ?? ""}`);
    const combinedNoDash = normalizeLocationKey(`${loc.name} ${loc.region ?? ""}`);
    if (key === combined || key === combinedNoDash) return loc.code;
    if (key.includes(normalizeLocationKey(loc.name)) && loc.region && key.includes(normalizeLocationKey(loc.region))) {
      return loc.code;
    }
  }
  return null;
}
