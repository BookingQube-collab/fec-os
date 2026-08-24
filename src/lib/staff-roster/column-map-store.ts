import type { RosterColumnKey } from "./types";

export const ROSTER_COLUMN_MAP_KEY = "fec.staff-roster.column-map.v1";

export type SavedRosterColumnMap = Partial<Record<RosterColumnKey, string>>;

type Stored = {
  mapping?: SavedRosterColumnMap;
  savedAt?: string;
};

export function loadRosterColumnMap(): SavedRosterColumnMap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ROSTER_COLUMN_MAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.mapping || typeof parsed.mapping !== "object") return null;
    return parsed.mapping;
  } catch {
    return null;
  }
}

export function saveRosterColumnMap(mapping: SavedRosterColumnMap): void {
  if (typeof window === "undefined") return;
  const cleaned: SavedRosterColumnMap = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof value === "string" && value.trim()) cleaned[key as RosterColumnKey] = value;
  }
  if (!cleaned.full_name || !cleaned.location) return;
  try {
    window.localStorage.setItem(
      ROSTER_COLUMN_MAP_KEY,
      JSON.stringify({ mapping: cleaned, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* quota / private mode */
  }
}
