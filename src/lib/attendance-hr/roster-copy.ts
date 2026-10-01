import { staffMatchesOrgShowOnly, type OrgFocusDepartment } from "@/lib/exclude-org-departments";

/**
 * Filters for "copy roster to next month".
 * Omit a filter to keep every row for that dimension. An empty location or staff list copies nothing.
 * Selected rows keep the location already stored on each row.
 */

export type RosterCopyDepartmentFields = {
  /** Legacy staff.department text. Compound labels such as "F&B Cafe + Operations" still match. */
  department?: string | null;
  departmentNames?: readonly (string | null)[] | null;
  departmentCodes?: readonly (string | null)[] | null;
};

export type RosterCopyNarrowing = {
  /** Omit to keep every staff id. An empty list copies nothing. */
  staffIds?: readonly string[] | null;
  /** Omit to skip. Uses the same org-focus match as the roster department filter. */
  department?: OrgFocusDepartment | null;
};

export function rosterCopyRowMatchesDepartment(
  row: RosterCopyDepartmentFields,
  department: OrgFocusDepartment,
): boolean {
  const names = [...(row.departmentNames ?? []), ...(row.departmentCodes ?? [])].filter(
    (label): label is string => Boolean(label?.trim()),
  );
  return staffMatchesOrgShowOnly({ department: row.department, department_names: names }, [department]);
}

export function filterRosterCopyRows<
  T extends { location_id: string; staff_id?: string } & RosterCopyDepartmentFields,
>(
  rows: readonly T[],
  locationIds: readonly string[] | null | undefined,
  narrowing?: RosterCopyNarrowing | null,
): T[] {
  let selected: T[];
  if (locationIds == null) selected = rows.slice();
  else if (locationIds.length === 0) selected = [];
  else {
    const allowed = new Set(locationIds.map((id) => String(id)));
    selected = rows.filter((row) => allowed.has(String(row.location_id)));
  }

  const staffIds = narrowing?.staffIds;
  if (staffIds != null) {
    if (staffIds.length === 0) return [];
    const allowedStaff = new Set(staffIds.map((id) => String(id)));
    selected = selected.filter((row) => allowedStaff.has(String(row.staff_id ?? "")));
  }

  if (narrowing?.department) {
    const department = narrowing.department;
    selected = selected.filter((row) => rosterCopyRowMatchesDepartment(row, department));
  }

  return selected;
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

type FlexibleRosterRow = {
  staffId: string;
  staffName?: string | null;
  locationId: string;
  flexibleAttendance?: boolean | null;
};

function groupedFlexibleRosterStaff(rows: readonly FlexibleRosterRow[]): FlexibleMultiSiteRosterStaff[] {
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
    .filter(([, bucket]) => bucket.flexible)
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

/** Anyone on this period's roster with flexible reporting enabled, including a single site. */
export function flexibleRosterStaff(rows: readonly FlexibleRosterRow[]): FlexibleMultiSiteRosterStaff[] {
  return groupedFlexibleRosterStaff(rows);
}

/** Staff with flexible reporting who already have roster rows at more than one site. */
export function flexibleMultiSiteRosterStaff(rows: readonly FlexibleRosterRow[]): FlexibleMultiSiteRosterStaff[] {
  return groupedFlexibleRosterStaff(rows).filter((person) => person.locationIds.length > 1);
}

export type FbCafeRosterStaff = {
  staffId: string;
  staffName: string | null;
};

/** Distinct staff on these rows whose department is the F&B Cafe team. */
export function fbCafeRosterStaff(
  rows: readonly ({ staffId: string; staffName?: string | null } & RosterCopyDepartmentFields)[],
): FbCafeRosterStaff[] {
  const byStaff = new Map<string, string | null>();
  for (const row of rows) {
    if (!row.staffId || !rosterCopyRowMatchesDepartment(row, "fb_cafe")) continue;
    const name = row.staffName?.trim() || null;
    const existing = byStaff.get(row.staffId);
    if (existing == null) byStaff.set(row.staffId, name);
    else if (name) byStaff.set(row.staffId, name);
  }
  return [...byStaff.entries()]
    .map(([staffId, staffName]) => ({ staffId, staffName }))
    .sort((a, b) => {
      const name = (a.staffName ?? "").localeCompare(b.staffName ?? "", undefined, { sensitivity: "base" });
      if (name !== 0) return name;
      return a.staffId.localeCompare(b.staffId);
    });
}
