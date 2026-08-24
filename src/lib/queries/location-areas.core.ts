import type { AuthContext } from "@/lib/server/auth";
import type { LocationAreaRow } from "@/lib/location-areas";

export async function fetchLocationAreas(
  context: AuthContext,
  options?: { locationId?: string | null; activeOnly?: boolean },
): Promise<LocationAreaRow[]> {
  let q = context.supabase
    .from("location_areas")
    .select("id, location_id, name, code, sort_order, is_active")
    .order("sort_order")
    .order("name");

  if (options?.locationId) {
    q = q.eq("location_id", options.locationId);
  }
  if (options?.activeOnly) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LocationAreaRow[];
}
