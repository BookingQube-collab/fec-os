import type { AuthContext } from "@/lib/server/auth";
import { qatarTodayYmd } from "@/lib/hr-expiry-bands";
import type { TemporarySiteMoveRef } from "@/lib/staff-temporary-moves";

/**
 * Staff whose active temporary move destination is this site.
 * Does not read punches or staff_work_locations.
 */
export async function fetchStaffIdsOnActiveTemporaryMove(
  supabase: AuthContext["supabase"],
  locationId: string,
  today = qatarTodayYmd(),
): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff_temporary_site_moves")
    .select("staff_id")
    .eq("to_location_id", locationId)
    .lte("starts_on", today)
    .gte("ends_on", today);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.staff_id).filter(Boolean))];
}

/** Active moves only (today inside starts_on..ends_on), keyed by staff. */
export async function fetchActiveTemporaryMovesByStaffId(
  supabase: AuthContext["supabase"],
  staffIds: string[],
  today = qatarTodayYmd(),
): Promise<Map<string, TemporarySiteMoveRef[]>> {
  const map = new Map<string, TemporarySiteMoveRef[]>();
  if (!staffIds.length) return map;

  const links: Array<{
    staff_id: string;
    to_location_id: string;
    starts_on: string;
    ends_on: string;
  }> = [];
  for (let i = 0; i < staffIds.length; i += 200) {
    const chunk = staffIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("staff_temporary_site_moves")
      .select("staff_id, to_location_id, starts_on, ends_on")
      .in("staff_id", chunk)
      .lte("starts_on", today)
      .gte("ends_on", today);
    if (error) throw error;
    links.push(...(data ?? []));
  }

  const locationIds = [...new Set(links.map((row) => row.to_location_id))];
  const locById = new Map<string, { code: string; name: string }>();
  if (locationIds.length) {
    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, code, name")
      .in("id", locationIds);
    if (locErr) throw locErr;
    for (const loc of locs ?? []) locById.set(loc.id, { code: loc.code, name: loc.name });
  }

  for (const row of links) {
    const loc = locById.get(row.to_location_id);
    const list = map.get(row.staff_id) ?? [];
    list.push({
      to_location_id: row.to_location_id,
      to_location_code: loc?.code ?? null,
      to_location_name: loc?.name ?? null,
      starts_on: row.starts_on,
      ends_on: row.ends_on,
    });
    map.set(row.staff_id, list);
  }
  return map;
}
