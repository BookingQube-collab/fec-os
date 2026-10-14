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
 * Null keeps every site (company roster). A team list keeps sites someone on that roster is assigned to.
 */
export function locationsForRosterCards<T extends { id: string }>(
  sites: readonly T[],
  assignedLocationIds: readonly string[] | null,
): T[] {
  if (assignedLocationIds == null) return [...sites];
  const allow = new Set(assignedLocationIds.filter(Boolean));
  return sites.filter((site) => allow.has(site.id));
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

  return sites.map((site) => {
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
