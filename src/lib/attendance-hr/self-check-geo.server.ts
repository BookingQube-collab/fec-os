import {
  DEFAULT_GEOFENCE_RADIUS_METERS,
  SITE_GEOFENCE_DEFAULTS,
} from "@/lib/attendance-hr/geofence";
import {
  mergeSelfCheckPunchFences,
  resolveSelfCheckPunchLocation,
  selfCheckCoordsFromPayload,
  type SelfCheckPunchFence,
} from "@/lib/attendance-hr/self-check-in";
import { LOCATION_KIND_WAREHOUSE } from "@/lib/locations/kind";
import { formatLocationLabel } from "@/lib/locations/normalize";
import type { AuthContext } from "@/lib/server/auth";

type Db = AuthContext["supabase"];

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function fenceFromRow(row: {
  id?: string | null;
  location_id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  radius_meters: number | string | null;
  mode?: string | null;
  locations?: unknown;
}): SelfCheckPunchFence {
  const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
  return {
    id: row.id ? String(row.id) : null,
    locationId: String(row.location_id),
    name: String(row.name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radiusMeters: Number(row.radius_meters) || DEFAULT_GEOFENCE_RADIUS_METERS,
    mode: row.mode === "restrict" ? "restrict" : "operate",
    locationLabel: formatLocationLabel(
      (loc as { code?: string } | null)?.code,
      (loc as { name?: string } | null)?.name,
    ),
  };
}

export { selfCheckCoordsFromPayload };

/** Active fences plus warehouse pins (even when Field "Active" is still off). */
export async function loadSelfCheckPunchFences(supabase: Db): Promise<SelfCheckPunchFence[]> {
  const { data: fences, error } = await supabase
    .from("attendance_geofences")
    .select("id, location_id, name, latitude, longitude, radius_meters, mode, active, locations(code, name)");
  if (error && !tableMissing(error.message)) throw new Error(error.message);

  const active: SelfCheckPunchFence[] = [];
  const fenceByLocation = new Map<
    string,
    {
      id?: string | null;
      location_id: string;
      name: string;
      latitude: number | string;
      longitude: number | string;
      radius_meters: number | string | null;
      mode?: string | null;
      active?: boolean | null;
      locations?: unknown;
    }
  >();
  for (const row of fences ?? []) {
    fenceByLocation.set(String(row.location_id), row);
    if (row.active) active.push(fenceFromRow(row));
  }

  let warehouses: Array<{ id: string; code: string | null; name: string | null }> = [];
  {
    const withKind = await supabase
      .from("locations")
      .select("id, code, name")
      .eq("kind", LOCATION_KIND_WAREHOUSE)
      .eq("status", "active");
    if (withKind.error) {
      if (!/kind|schema cache|column/i.test(withKind.error.message ?? "")) {
        throw new Error(withKind.error.message);
      }
    } else {
      warehouses = (withKind.data ?? []) as Array<{ id: string; code: string | null; name: string | null }>;
    }
  }

  const warehouseFences: SelfCheckPunchFence[] = [];
  for (const loc of warehouses) {
    const locationId = String(loc.id);
    const existing = fenceByLocation.get(locationId);
    if (existing) {
      warehouseFences.push(fenceFromRow(existing));
      continue;
    }
    const code = String(loc.code ?? "").trim();
    const known = code ? SITE_GEOFENCE_DEFAULTS[code] : null;
    if (!known) continue;
    warehouseFences.push({
      id: null,
      locationId,
      name: String(loc.name ?? code) || "Warehouse",
      latitude: known.latitude,
      longitude: known.longitude,
      radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
      mode: "operate",
      locationLabel: formatLocationLabel(loc.code, loc.name),
    });
  }

  return mergeSelfCheckPunchFences({ activeFences: active, warehouseFences });
}

export type SelfCheckGeoRepairResult = {
  repaired: number;
  /** Locations that need attendance recalc after punches moved (from + to). */
  locationIdsToRecalc: string[];
  staffIds: string[];
};

/**
 * Move mis-attributed app punches (home/KDS) to the geo-matched site when
 * raw_payload still has GPS near a warehouse/branch fence.
 */
export async function repairSelfCheckPunchLocations(
  supabase: Db,
  opts: {
    dateFrom: string;
    dateTo: string;
    staffIds?: string[] | null;
  },
): Promise<SelfCheckGeoRepairResult> {
  const fences = await loadSelfCheckPunchFences(supabase);
  if (!fences.length) {
    return { repaired: 0, locationIdsToRecalc: [], staffIds: [] };
  }

  let q = supabase
    .from("attendance_logs")
    .select("id, staff_id, location_id, attendance_date, raw_payload, source")
    .eq("source", "self_check")
    .gte("attendance_date", opts.dateFrom)
    .lte("attendance_date", opts.dateTo)
    .order("attendance_date", { ascending: true })
    .order("id", { ascending: true });
  if (opts.staffIds?.length) q = q.in("staff_id", opts.staffIds);

  const { data: rows, error } = await q.limit(5000);
  if (error) throw new Error(error.message);

  const locationIds = new Set<string>();
  const staffIds = new Set<string>();
  let repaired = 0;

  for (const row of rows ?? []) {
    const coords = selfCheckCoordsFromPayload(row.raw_payload);
    if (!coords) continue;
    const currentLocationId = row.location_id ? String(row.location_id) : null;
    const resolved = resolveSelfCheckPunchLocation({
      homeLocationId: currentLocationId,
      homeLabel: null,
      latitude: coords.latitude,
      longitude: coords.longitude,
      fences,
    });
    if (!resolved.matchedGeo || !resolved.locationId) continue;
    if (resolved.locationId === currentLocationId) continue;

    const nextPayload = {
      ...((row.raw_payload && typeof row.raw_payload === "object"
        ? row.raw_payload
        : {}) as Record<string, unknown>),
      via: "self_check",
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy_meters: coords.accuracyMeters,
      geofence_name: resolved.geofenceName,
      inside_geofence: resolved.inside,
      distance_meters: resolved.distanceMeters,
      location_label: resolved.locationLabel,
      geo_repaired_at: new Date().toISOString(),
      geo_repaired_from_location_id: currentLocationId,
    };

    const { error: updateError } = await supabase
      .from("attendance_logs")
      .update({
        location_id: resolved.locationId,
        raw_payload: nextPayload,
      })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    repaired += 1;
    if (currentLocationId) locationIds.add(currentLocationId);
    locationIds.add(resolved.locationId);
    if (row.staff_id) staffIds.add(String(row.staff_id));
  }

  return {
    repaired,
    locationIdsToRecalc: [...locationIds],
    staffIds: [...staffIds],
  };
}
