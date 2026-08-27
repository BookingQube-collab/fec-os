import { describe, expect, it } from "vitest";

import {
  DEFAULT_GEOFENCE_RADIUS_METERS,
  evaluateGeofence,
  haversineMeters,
  pickNearestFence,
  SITE_GEOFENCE_DEFAULTS,
} from "./geofence";

const CITY_CENTER = SITE_GEOFENCE_DEFAULTS["INF-CC"];
const ASPIRE = SITE_GEOFENCE_DEFAULTS["CAR-AP"];

describe("haversineMeters", () => {
  it("is ~0 at the same point", () => {
    expect(haversineMeters(CITY_CENTER, CITY_CENTER)).toBeLessThan(1);
  });

  it("places Aspire several kilometres from City Center", () => {
    const metres = haversineMeters(CITY_CENTER, ASPIRE);
    expect(metres).toBeGreaterThan(8_000);
    expect(metres).toBeLessThan(14_000);
  });

  it("returns NaN for invalid coordinates", () => {
    expect(haversineMeters({ latitude: 91, longitude: 0 }, CITY_CENTER)).toBeNaN();
  });
});

describe("evaluateGeofence", () => {
  const fence = { ...CITY_CENTER, radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS, mode: "operate" as const };

  it("marks a point at the centre as inside an operate zone", () => {
    const result = evaluateGeofence(CITY_CENTER, fence);
    expect(result).toMatchObject({ inside: true, violation: false, eventType: "inside", mode: "operate" });
  });

  it("marks a far point as geofence_exit for operate mode", () => {
    const result = evaluateGeofence(ASPIRE, fence);
    expect(result).toMatchObject({ inside: false, violation: true, eventType: "geofence_exit" });
    expect(result?.distanceMeters).toBeGreaterThan(DEFAULT_GEOFENCE_RADIUS_METERS);
  });

  it("treats being inside a restrict zone as a violation", () => {
    const result = evaluateGeofence(CITY_CENTER, { ...fence, mode: "restrict" });
    expect(result).toMatchObject({ inside: true, violation: true, eventType: "restricted", mode: "restrict" });
  });

  it("allows being outside a restrict zone", () => {
    const result = evaluateGeofence(ASPIRE, { ...fence, mode: "restrict" });
    expect(result).toMatchObject({ inside: false, violation: false, eventType: "inside" });
  });

  it("returns null when the fence has no coordinates", () => {
    expect(evaluateGeofence(CITY_CENTER, { latitude: Number.NaN, longitude: 0, radiusMeters: 100 })).toBeNull();
  });
});

describe("pickNearestFence", () => {
  it("selects the closer of two sites", () => {
    const nearest = pickNearestFence(CITY_CENTER, [
      { ...ASPIRE, radiusMeters: 200, mode: "operate" as const },
      { ...CITY_CENTER, radiusMeters: 200, mode: "operate" as const },
    ]);
    expect(nearest?.evaluation.inside).toBe(true);
    expect(nearest?.fence.latitude).toBe(CITY_CENTER.latitude);
  });
});
