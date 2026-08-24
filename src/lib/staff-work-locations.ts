import type { AuthContext } from "@/lib/server/auth";

export type WorkLocationRef = {
  id: string;
  code: string;
  name: string;
};

export type StaffLocationFields = {
  location_id: string;
  is_roaming?: boolean | null;
  work_location_ids?: string[] | null;
};

/** Directory / reports: home or an attached work site. Mapping can also include all roaming techs. */
export function staffWorksAtLocation(
  staff: StaffLocationFields,
  locationId: string,
  options?: { roamingEverywhere?: boolean },
): boolean {
  if (staff.location_id === locationId) return true;
  if (staff.work_location_ids?.includes(locationId)) return true;
  if (options?.roamingEverywhere && staff.is_roaming) return true;
  return false;
}

export async function fetchStaffIdsWorkingAtLocation(
  supabase: AuthContext["supabase"],
  locationId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff_work_locations")
    .select("staff_id")
    .eq("location_id", locationId);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.staff_id).filter(Boolean))];
}

export async function fetchHomeStaffIdsAtLocation(
  supabase: AuthContext["supabase"],
  locationId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff")
    .select("id")
    .eq("location_id", locationId)
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

/**
 * Site punches at `locationId`, plus punches at other work sites for staff whose home is that location.
 * Person-level hours therefore roll up when filtering by primary branch.
 */
export function punchOrHomeStaffOrFilter(locationId: string, homeStaffIds: string[]): string {
  if (!homeStaffIds.length) return `location_id.eq.${locationId}`;
  return `location_id.eq.${locationId},staff_id.in.(${homeStaffIds.join(",")})`;
}

export async function fetchWorkLocationsByStaffId(
  supabase: AuthContext["supabase"],
  staffIds: string[],
): Promise<Map<string, WorkLocationRef[]>> {
  const map = new Map<string, WorkLocationRef[]>();
  if (!staffIds.length) return map;

  const links: Array<{ staff_id: string; location_id: string }> = [];
  for (let i = 0; i < staffIds.length; i += 200) {
    const chunk = staffIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("staff_work_locations")
      .select("staff_id, location_id")
      .in("staff_id", chunk);
    if (error) throw error;
    links.push(...(data ?? []));
  }

  const locationIds = [...new Set(links.map((row) => row.location_id))];
  const locById = new Map<string, WorkLocationRef>();
  if (locationIds.length) {
    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, code, name")
      .in("id", locationIds);
    if (locErr) throw locErr;
    for (const loc of locs ?? []) {
      locById.set(loc.id, { id: loc.id, code: loc.code, name: loc.name });
    }
  }

  for (const row of links) {
    const ref = locById.get(row.location_id) ?? { id: row.location_id, code: "", name: "" };
    const list = map.get(row.staff_id) ?? [];
    list.push(ref);
    map.set(row.staff_id, list);
  }
  return map;
}

export function attachWorkLocations<T extends { id: string }>(
  staff: T[],
  byStaff: Map<string, WorkLocationRef[]>,
): Array<T & { work_locations: WorkLocationRef[]; work_location_ids: string[] }> {
  return staff.map((row) => {
    const work_locations = byStaff.get(row.id) ?? [];
    return {
      ...row,
      work_locations,
      work_location_ids: work_locations.map((loc) => loc.id),
    };
  });
}
