import { rosterSheetLabel } from "@/lib/locations/normalize";

export type SampleStaff = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  qid: string | null;
  location_id: string;
  work_location_ids: string[];
  job_title?: string | null;
  employment_type?: string | null;
  e3_enrolled?: boolean | null;
  phone?: string | null;
  hire_date?: string | null;
  status?: string | null;
};

export type SampleLocation = {
  id: string;
  code: string;
  name?: string | null;
};

export type StaffPlacement = {
  staff: SampleStaff;
  locationId: string;
  locationCode: string;
  locationName: string;
};

function displayLocationName(loc: SampleLocation): string {
  return rosterSheetLabel(loc.code, loc.name);
}

function locationIdsForStaff(staff: SampleStaff): string[] {
  const ids = new Set<string>();
  if (staff.location_id) ids.add(staff.location_id);
  for (const id of staff.work_location_ids ?? []) {
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Home venue plus each `staff_work_locations` row, filtered to accessible / selected site. */
export function staffPlacementsForScope(
  staff: SampleStaff[],
  locations: SampleLocation[],
  options: {
    scopeLocationId: string | null;
    accessibleLocationIds: Set<string>;
  },
): StaffPlacement[] {
  const locById = new Map(locations.map((loc) => [loc.id, loc]));
  const out: StaffPlacement[] = [];
  for (const person of staff) {
    for (const locationId of locationIdsForStaff(person)) {
      if (!options.accessibleLocationIds.has(locationId)) continue;
      if (options.scopeLocationId && locationId !== options.scopeLocationId) continue;
      const loc = locById.get(locationId);
      if (!loc?.code) continue;
      out.push({
        staff: person,
        locationId,
        locationCode: loc.code,
        locationName: displayLocationName(loc),
      });
    }
  }
  out.sort((a, b) => {
    const loc = a.locationCode.localeCompare(b.locationCode);
    if (loc) return loc;
    const name = String(a.staff.full_name ?? "").localeCompare(String(b.staff.full_name ?? ""));
    if (name) return name;
    return String(a.staff.employee_code ?? "").localeCompare(String(b.staff.employee_code ?? ""));
  });
  return out;
}

/** One directory row per person. Location column is the saved home venue, not a work-site duplicate. */
export function directoryStaffForScope(
  staff: SampleStaff[],
  locations: SampleLocation[],
  options: {
    scopeLocationId: string | null;
    accessibleLocationIds: Set<string>;
  },
): Array<SampleStaff & { locationCode: string; locationName: string }> {
  const locById = new Map(locations.map((loc) => [loc.id, loc]));
  const seen = new Set<string>();
  const out: Array<SampleStaff & { locationCode: string; locationName: string }> = [];
  for (const person of staff) {
    const sites = locationIdsForStaff(person);
    const inScope = options.scopeLocationId
      ? sites.includes(options.scopeLocationId) && options.accessibleLocationIds.has(options.scopeLocationId)
      : sites.some((id) => options.accessibleLocationIds.has(id));
    if (!inScope || seen.has(person.id)) continue;
    const home = locById.get(person.location_id);
    const fallback = sites.map((id) => locById.get(id)).find((loc) => loc?.code && options.accessibleLocationIds.has(loc.id));
    const loc = home?.code ? home : fallback;
    const locationCode = loc?.code;
    if (!locationCode || !loc) continue;
    seen.add(person.id);
    out.push({ ...person, locationCode, locationName: displayLocationName(loc) });
  }
  out.sort((a, b) => {
    const loc = a.locationCode.localeCompare(b.locationCode);
    if (loc) return loc;
    return String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""));
  });
  return out;
}
