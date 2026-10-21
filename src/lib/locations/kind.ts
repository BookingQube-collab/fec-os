/** How a `locations` row participates in branch pickers vs geo punch lists. */
export const LOCATION_KINDS = ["branch", "warehouse"] as const;

export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_BRANCH: LocationKind = "branch";
export const LOCATION_KIND_WAREHOUSE: LocationKind = "warehouse";

/** Geo-only warehouse site — not WH (Winter Village uses WH-WH). */
export const WAREHOUSE_LOCATION_CODE = "WHSE";

export function normalizeLocationKind(value: string | null | undefined): LocationKind {
  return value === LOCATION_KIND_WAREHOUSE ? LOCATION_KIND_WAREHOUSE : LOCATION_KIND_BRANCH;
}

/** Branch switcher / operational site lists — warehouses stay out. */
export function isBranchLocationKind(value: string | null | undefined): boolean {
  return normalizeLocationKind(value) === LOCATION_KIND_BRANCH;
}

/** Geofence / self-check punch sites include warehouses and branches. */
export function isGeoPunchLocationKind(value: string | null | undefined): boolean {
  const kind = normalizeLocationKind(value);
  return kind === LOCATION_KIND_BRANCH || kind === LOCATION_KIND_WAREHOUSE;
}
