/**
 * Coverage of active locations against roster rows already loaded for one period.
 * A location is uploaded when at least one row has that location id.
 * Callers must pass rows already limited to the selected date range.
 */

export type LocationRosterSite = {
  id: string;
  code?: string | null;
  name?: string | null;
  region?: string | null;
};

export type LocationRosterCoverageRow = {
  locationId: string;
  staffId: string;
};

export type LocationRosterCoverageItem = {
  id: string;
  label: string;
  uploaded: boolean;
  rowCount: number;
  staffCount: number;
};

/**
 * Event host sites used by People Events — not monthly FEC operational branches.
 * Locations have no `is_event` flag yet (kind is only branch | warehouse), so the
 * monthly roster denylists these codes. Do not reuse this list to hide sites from
 * Events pages.
 */
export const EVENT_ONLY_MONTHLY_ROSTER_LOCATION_CODES = ["PLACE-VEDOME-MALL"] as const;

const EVENT_ONLY_MONTHLY_ROSTER_CODE_SET = new Set<string>(
  EVENT_ONLY_MONTHLY_ROSTER_LOCATION_CODES.map((code) => code.toUpperCase()),
);

export function isEventOnlyMonthlyRosterLocationCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return EVENT_ONLY_MONTHLY_ROSTER_CODE_SET.has(code.trim().toUpperCase());
}

/** Drop event host sites from monthly roster cards, filters, and coverage. */
export function excludeEventOnlyLocationsFromMonthlyRoster<T extends { code?: string | null }>(
  sites: readonly T[],
): T[] {
  return sites.filter((site) => !isEventOnlyMonthlyRosterLocationCode(site.code));
}

/**
 * Sites a roster chart is assigned to.
 * Home branch and extra dedicated sites only. Punch history and shift rows are not inputs.
 */
export function rosterScopeAssignedLocationIds(input: {
  homeLocationIds?: readonly (string | null | undefined)[];
  extraLocationIds?: readonly (string | null | undefined)[];
}): string[] {
  const ids = new Set<string>();
  for (const id of input.homeLocationIds ?? []) {
    if (id) ids.add(id);
  }
  for (const id of input.extraLocationIds ?? []) {
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * Location cards for one roster viewer.
 * Null keeps every operational site (company roster). A team list keeps sites someone
 * on that roster is assigned to. Event-only hosts are always omitted.
 */
export function locationsForRosterCards<T extends { id: string; code?: string | null }>(
  sites: readonly T[],
  assignedLocationIds: readonly string[] | null,
): T[] {
  const rosterSites = excludeEventOnlyLocationsFromMonthlyRoster(sites);
  if (assignedLocationIds == null) return [...rosterSites];
  const allow = new Set(assignedLocationIds.filter(Boolean));
  return rosterSites.filter((site) => allow.has(site.id));
}

export function locationRosterCoverage(
  sites: readonly LocationRosterSite[],
  rows: readonly LocationRosterCoverageRow[],
  labelFor: (site: LocationRosterSite) => string,
): LocationRosterCoverageItem[] {
  const byLocation = new Map<string, { rowCount: number; staff: Set<string> }>();
  for (const row of rows) {
    if (!row.locationId) continue;
    let bucket = byLocation.get(row.locationId);
    if (!bucket) {
      bucket = { rowCount: 0, staff: new Set() };
      byLocation.set(row.locationId, bucket);
    }
    bucket.rowCount += 1;
    if (row.staffId) bucket.staff.add(row.staffId);
  }

  return excludeEventOnlyLocationsFromMonthlyRoster(sites).map((site) => {
    const bucket = byLocation.get(site.id);
    const rowCount = bucket?.rowCount ?? 0;
    return {
      id: site.id,
      label: labelFor(site),
      uploaded: rowCount > 0,
      rowCount,
      staffCount: bucket?.staff.size ?? 0,
    };
  });
}
