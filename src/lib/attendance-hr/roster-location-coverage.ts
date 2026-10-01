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
