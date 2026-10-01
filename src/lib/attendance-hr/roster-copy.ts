/**
 * Location filter for "copy roster to next month".
 * Omit location ids to copy every site. An empty list copies nothing.
 * Selected sites keep the location already stored on each row.
 */

export function filterRosterCopyRows<T extends { location_id: string }>(
  rows: readonly T[],
  locationIds: readonly string[] | null | undefined,
): T[] {
  if (locationIds == null) return rows.slice();
  if (locationIds.length === 0) return [];
  const allowed = new Set(locationIds.map((id) => String(id)));
  return rows.filter((row) => allowed.has(String(row.location_id)));
}

export function rosterCopyDestinationKey(staffId: string, workDate: string): string {
  return `${staffId}|${String(workDate).slice(0, 10)}`;
}

/**
 * Staff + date already stored at a location that is not being copied.
 * Site-wise copy must not overwrite those rows (one roster row per staff per day).
 */
export function rosterCopyProtectedDestinationKeys(
  destinationRows: readonly { location_id: string; staff_id: string; work_date: string }[],
  locationIds: readonly string[] | null | undefined,
): Set<string> {
  if (locationIds == null || locationIds.length === 0) return new Set();
  const allowed = new Set(locationIds.map((id) => String(id)));
  const keys = new Set<string>();
  for (const row of destinationRows) {
    if (allowed.has(String(row.location_id))) continue;
    keys.add(rosterCopyDestinationKey(String(row.staff_id), String(row.work_date)));
  }
  return keys;
}

/**
 * Map selected source rows onto the next period by day index.
 * Location id is copied from the source row and is not rewritten.
 */
export function planRosterCopyByLocation<T extends { location_id: string; work_date: string }>(
  rows: readonly T[],
  locationIds: readonly string[] | null | undefined,
  dateMap: ReadonlyMap<string, string>,
): { rows: T[]; skipped: number } {
  const selected = filterRosterCopyRows(rows, locationIds);
  const planned: T[] = [];
  let skipped = 0;
  for (const row of selected) {
    const mapped = dateMap.get(String(row.work_date).slice(0, 10));
    if (!mapped) {
      skipped += 1;
      continue;
    }
    planned.push({ ...row, location_id: String(row.location_id), work_date: mapped });
  }
  return { rows: planned, skipped };
}

export type FlexibleMultiSiteRosterStaff = {
  staffId: string;
  staffName: string | null;
  locationIds: string[];
};

/** Staff with flexible reporting who already have roster rows at more than one site. */
export function flexibleMultiSiteRosterStaff(
  rows: readonly {
    staffId: string;
    staffName?: string | null;
    locationId: string;
    flexibleAttendance?: boolean | null;
  }[],
): FlexibleMultiSiteRosterStaff[] {
  const byStaff = new Map<string, { staffName: string | null; flexible: boolean; locationIds: string[] }>();
  for (const row of rows) {
    if (!row.staffId || !row.locationId) continue;
    let bucket = byStaff.get(row.staffId);
    if (!bucket) {
      bucket = { staffName: row.staffName?.trim() || null, flexible: false, locationIds: [] };
      byStaff.set(row.staffId, bucket);
    }
    if (row.flexibleAttendance) bucket.flexible = true;
    const name = row.staffName?.trim();
    if (name) bucket.staffName = name;
    if (!bucket.locationIds.includes(row.locationId)) bucket.locationIds.push(row.locationId);
  }

  return [...byStaff.entries()]
    .filter(([, bucket]) => bucket.flexible && bucket.locationIds.length > 1)
    .map(([staffId, bucket]) => ({
      staffId,
      staffName: bucket.staffName,
      locationIds: bucket.locationIds,
    }))
    .sort((a, b) => {
      const name = (a.staffName ?? "").localeCompare(b.staffName ?? "", undefined, { sensitivity: "base" });
      if (name !== 0) return name;
      return a.staffId.localeCompare(b.staffId);
    });
}
