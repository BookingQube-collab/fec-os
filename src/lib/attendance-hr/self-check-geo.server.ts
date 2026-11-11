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

/**
 * Ops correction: move one self_check punch to a site (e.g. legacy null-GPS
 * punches that landed on staff home / KDS while the person was at warehouse).
 */
export async function reattributeSelfCheckPunchLocation(
  supabase: Db,
  opts: {
    punchId: string;
    locationId: string;
    reason?: string | null;
  },
): Promise<{
  staffId: string | null;
  attendanceDate: string | null;
  fromLocationId: string | null;
  toLocationId: string;
  locationIdsToRecalc: string[];
}> {
  const { data: punch, error } = await supabase
    .from("attendance_logs")
    .select("id, staff_id, location_id, attendance_date, source, raw_payload")
    .eq("id", opts.punchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!punch?.id) throw new Error("Punch not found");
  if (String(punch.source ?? "") !== "self_check") {
    throw new Error("Only self_check punches can be reattributed");
  }

  const { data: loc, error: locErr } = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("id", opts.locationId)
    .maybeSingle();
  if (locErr) throw new Error(locErr.message);
  if (!loc?.id) throw new Error("Location not found");

  const fromLocationId = punch.location_id ? String(punch.location_id) : null;
  const toLocationId = String(loc.id);
  const locationLabel = formatLocationLabel(loc.code, loc.name);
  const nextPayload = {
    ...((punch.raw_payload && typeof punch.raw_payload === "object"
      ? punch.raw_payload
      : {}) as Record<string, unknown>),
    via: "self_check",
    location_label: locationLabel,
    geofence_name: String(loc.name ?? loc.code ?? "Site"),
    ops_reattributed_at: new Date().toISOString(),
    ops_reattributed_reason:
      opts.reason?.trim() ||
      "Ops reattributed self_check punch away from mis-attributed home site",
    ops_reattributed_from_location_id: fromLocationId,
  };

  if (fromLocationId !== toLocationId) {
    const { error: updateError } = await supabase
      .from("attendance_logs")
      .update({
        location_id: toLocationId,
        raw_payload: nextPayload,
      })
      .eq("id", punch.id);
    if (updateError) throw new Error(updateError.message);
  }

  const locationIdsToRecalc = [
    ...new Set([fromLocationId, toLocationId].filter((id): id is string => Boolean(id))),
  ];
  return {
    staffId: punch.staff_id ? String(punch.staff_id) : null,
    attendanceDate: punch.attendance_date ? String(punch.attendance_date).slice(0, 10) : null,
    fromLocationId,
    toLocationId,
    locationIdsToRecalc,
  };
}
