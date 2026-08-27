/** Earth radius used for haversine distance (mean). */
export const EARTH_RADIUS_METERS = 6_371_000;

export const DEFAULT_GEOFENCE_RADIUS_METERS = 200;

export type GeofenceMode = "operate" | "restrict";

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type GeofenceCircle = GeoPoint & {
  radiusMeters: number;
  mode?: GeofenceMode | null;
};

/** Approximate venue centres for Qatar sites — operators should confirm on Settings. */
export const SITE_GEOFENCE_DEFAULTS: Record<string, GeoPoint> = {
  "INF-CC": { latitude: 25.3244, longitude: 51.531 },
  "KDS-CC": { latitude: 25.3244, longitude: 51.531 },
  "UA-DM": { latitude: 25.2615, longitude: 51.4968 },
  "KDS-DM": { latitude: 25.2615, longitude: 51.4968 },
  "CB-VM": { latitude: 25.4172, longitude: 51.5308 },
  "WM-VM": { latitude: 25.4172, longitude: 51.5308 },
  "CB-DSM": { latitude: 25.2342, longitude: 51.4338 },
  "CAR-AP": { latitude: 25.2632, longitude: 51.4485 },
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidGeoPoint(point: GeoPoint): boolean {
  return isValidLatitude(point.latitude) && isValidLongitude(point.longitude);
}

/** Great-circle distance in metres. */
export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  if (!isValidGeoPoint(from) || !isValidGeoPoint(to)) return Number.NaN;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type GeofenceEvaluation = {
  inside: boolean;
  distanceMeters: number;
  radiusMeters: number;
  mode: GeofenceMode;
  /** True when the point violates the fence rule (outside an operate zone, or inside a restrict zone). */
  violation: boolean;
  eventType: "inside" | "geofence_exit" | "restricted";
};

export function evaluateGeofence(point: GeoPoint, fence: GeofenceCircle): GeofenceEvaluation | null {
  if (!isValidGeoPoint(point) || !isValidLatitude(fence.latitude) || !isValidLongitude(fence.longitude)) {
    return null;
  }
  const radiusMeters = Number.isFinite(fence.radiusMeters) && fence.radiusMeters > 0 ? fence.radiusMeters : DEFAULT_GEOFENCE_RADIUS_METERS;
  const distanceMeters = Math.round(haversineMeters(point, fence));
  if (!Number.isFinite(distanceMeters)) return null;
  const inside = distanceMeters <= radiusMeters;
  const mode: GeofenceMode = fence.mode === "restrict" ? "restrict" : "operate";
  const violation = mode === "restrict" ? inside : !inside;
  const eventType: GeofenceEvaluation["eventType"] = mode === "restrict" ? (inside ? "restricted" : "inside") : inside ? "inside" : "geofence_exit";
  return { inside, distanceMeters, radiusMeters, mode, violation, eventType };
}

export function pickNearestFence<T extends GeofenceCircle>(point: GeoPoint, fences: T[]): { fence: T; evaluation: GeofenceEvaluation } | null {
  let best: { fence: T; evaluation: GeofenceEvaluation } | null = null;
  for (const fence of fences) {
    const evaluation = evaluateGeofence(point, fence);
    if (!evaluation) continue;
    if (!best || evaluation.distanceMeters < best.evaluation.distanceMeters) {
      best = { fence, evaluation };
    }
  }
  return best;
}
