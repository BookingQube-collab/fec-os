import { usesPunchDrivenAttendance } from "./attendance-mode";
import {
  DEFAULT_GEOFENCE_RADIUS_METERS,
  pickNearestFence,
  type GeofenceMode,
} from "./geofence";

/** Allow or refuse a self check-in / check-out before any attendance row is written. */

export type SelfCheckKind = "in" | "out";

export type SelfCheckDenyReason = "not_linked" | "not_enabled" | "already_in" | "already_out" | "need_in";

export type SelfCheckDecision = { allow: true } | { allow: false; reason: SelfCheckDenyReason };

/** Fence row used when attributing an app check-in/out to a geo site. */
export type SelfCheckPunchFence = {
  id: string | null;
  locationId: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  mode: GeofenceMode;
  locationLabel: string;
};

export type SelfCheckPunchSite = {
  locationId: string | null;
  locationLabel: string | null;
  geofenceName: string | null;
  inside: boolean | null;
  distanceMeters: number | null;
  /** True when GPS matched a geo fence (inside or soft snap) — not staff home fallback. */
  matchedGeo: boolean;
};

/**
 * Soft snap beyond the hard fence radius so large yards / GPS drift still
 * attribute the punch to the geo site instead of the staff home roster site.
 */
export const SELF_CHECK_GEO_SNAP_MULTIPLIER = 3;
export const SELF_CHECK_GEO_SNAP_MIN_METERS = 500;

/** Lat/lng stored on attendance_logs.raw_payload for source=self_check. */
export function selfCheckCoordsFromPayload(raw: unknown): {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const accuracy = row.accuracy_meters == null ? null : Number(row.accuracy_meters);
  return {
    latitude,
    longitude,
    accuracyMeters: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
  };
}

function selfCheckGeoSnapMeters(radiusMeters: number): number {
  const radius =
    Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : DEFAULT_GEOFENCE_RADIUS_METERS;
  return Math.max(radius * SELF_CHECK_GEO_SNAP_MULTIPLIER, SELF_CHECK_GEO_SNAP_MIN_METERS);
}

/**
 * Choose the attendance punch site for application check-in/out.
 * Home/roster location is only a fallback when GPS is missing or no geo fence
 * is near enough — never preferred over an in-range warehouse/branch geo pin.
 */
export function resolveSelfCheckPunchLocation(input: {
  homeLocationId: string | null;
  homeLabel: string | null;
  latitude?: number;
  longitude?: number;
  fences: SelfCheckPunchFence[];
}): SelfCheckPunchSite {
  const homeId = input.homeLocationId;
  const homeLabel = input.homeLabel;
  if (
    input.latitude == null ||
    input.longitude == null ||
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude)
  ) {
    return {
      locationId: homeId,
      locationLabel: homeLabel,
      geofenceName: null,
      inside: null,
      distanceMeters: null,
      matchedGeo: false,
    };
  }

  const nearest = pickNearestFence(
    { latitude: input.latitude, longitude: input.longitude },
    input.fences,
  );
  if (!nearest) {
    return {
      locationId: null,
      locationLabel: null,
      geofenceName: null,
      inside: null,
      distanceMeters: null,
      matchedGeo: false,
    };
  }

  const snapMeters = selfCheckGeoSnapMeters(nearest.evaluation.radiusMeters);
  const nearEnough =
    nearest.evaluation.inside ||
    nearest.evaluation.mode === "restrict" ||
    nearest.evaluation.distanceMeters <= snapMeters;

  if (nearEnough) {
    return {
      locationId: nearest.fence.locationId,
      locationLabel: nearest.fence.locationLabel,
      geofenceName: nearest.fence.name,
      inside: nearest.evaluation.inside,
      distanceMeters: nearest.evaluation.distanceMeters,
      matchedGeo: true,
    };
  }

  // Far from every geo site: do not fall back to staff home — caller should refuse.
  return {
    locationId: null,
    locationLabel: null,
    geofenceName: nearest.fence.name,
    inside: false,
    distanceMeters: nearest.evaluation.distanceMeters,
    matchedGeo: false,
  };
}

/**
 * Active operate/restrict fences plus warehouse pins that are not yet activated
 * in Field settings (defaults still count for app punch attribution).
 */
export function mergeSelfCheckPunchFences(input: {
  activeFences: SelfCheckPunchFence[];
  warehouseFences: SelfCheckPunchFence[];
}): SelfCheckPunchFence[] {
  const byLocation = new Map<string, SelfCheckPunchFence>();
  for (const fence of input.activeFences) {
    if (!fence.locationId) continue;
    byLocation.set(fence.locationId, fence);
  }
  for (const fence of input.warehouseFences) {
    if (!fence.locationId || byLocation.has(fence.locationId)) continue;
    if (!Number.isFinite(fence.latitude) || !Number.isFinite(fence.longitude)) continue;
    if (fence.latitude === 0 && fence.longitude === 0) continue;
    byLocation.set(fence.locationId, fence);
  }
  return [...byLocation.values()];
}

function punchCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * Portal check-in / device-punch people (e.g. maintenance under FEC).
 * When `staff.can_self_check_in` is on, attendance comes from punches — no monthly
 * roster is required. Days with no punches stay not-on-site (not roster Absent).
 * Incomplete days use the same missed-punch request path as other staff.
 *
 * Prefer `usesPunchDrivenAttendance` when a location `attendance_mode` is known
 * (Phase 1: HO = shift_punch formalizes the same punch-driven path site-wide).
 */
export function staffUsesPunchDrivenAttendance(input: {
  canSelfCheckIn?: boolean | null;
  attendanceMode?: string | null;
}): boolean {
  return usesPunchDrivenAttendance(input);
}

/**
 * The signed-in person may record a punch only when their profile allows it.
 * Daily attendance uses the first punch as check-in and the last as check-out,
 * so a second check-in, or a check-out before check-in, is refused.
 */
export function decideSelfCheck(input: {
  linked: boolean;
  enabled: boolean;
  kind: SelfCheckKind;
  punchesToday: number;
}): SelfCheckDecision {
  if (!input.linked) return { allow: false, reason: "not_linked" };
  if (!input.enabled) return { allow: false, reason: "not_enabled" };
  const count = punchCount(input.punchesToday);
  if (count >= 2) return { allow: false, reason: "already_out" };
  if (input.kind === "in") {
    if (count >= 1) return { allow: false, reason: "already_in" };
    return { allow: true };
  }
  if (count === 0) return { allow: false, reason: "need_in" };
  return { allow: true };
}

/** Which of the two buttons can be used, given punches already stored today. */
export function selfCheckButtons(punchesToday: number): { checkIn: boolean; checkOut: boolean } {
  const count = punchCount(punchesToday);
  return { checkIn: count === 0, checkOut: count === 1 };
}
