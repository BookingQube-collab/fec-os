import { describe, expect, it } from "vitest";

import { DEFAULT_GEOFENCE_RADIUS_METERS, SITE_GEOFENCE_DEFAULTS } from "./geofence";
import {
  decideSelfCheck,
  mergeSelfCheckPunchFences,
  resolveSelfCheckPunchLocation,
  selfCheckButtons,
  selfCheckCoordsFromPayload,
  staffUsesPunchDrivenAttendance,
  type SelfCheckPunchFence,
} from "./self-check-in";

const WHSE = SITE_GEOFENCE_DEFAULTS.WHSE;
const KDS = SITE_GEOFENCE_DEFAULTS["KDS-CC"];

function fence(partial: Partial<SelfCheckPunchFence> & Pick<SelfCheckPunchFence, "locationId" | "name" | "locationLabel">): SelfCheckPunchFence {
  return {
    id: partial.id ?? null,
    locationId: partial.locationId,
    name: partial.name,
    latitude: partial.latitude ?? 0,
    longitude: partial.longitude ?? 0,
    radiusMeters: partial.radiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS,
    mode: partial.mode ?? "operate",
    locationLabel: partial.locationLabel,
  };
}

describe("punch-driven attendance (portal check-in / no roster)", () => {
  it("follows the admin can_self_check_in flag, not names or department", () => {
    expect(staffUsesPunchDrivenAttendance({ canSelfCheckIn: true })).toBe(true);
    expect(staffUsesPunchDrivenAttendance({ canSelfCheckIn: false })).toBe(false);
    expect(staffUsesPunchDrivenAttendance({ canSelfCheckIn: null })).toBe(false);
    expect(staffUsesPunchDrivenAttendance({})).toBe(false);
  });

  it("also treats location shift_punch mode as punch-driven (Phase 1 HO)", () => {
    expect(
      staffUsesPunchDrivenAttendance({ canSelfCheckIn: false, attendanceMode: "shift_punch" }),
    ).toBe(true);
    expect(staffUsesPunchDrivenAttendance({ canSelfCheckIn: false, attendanceMode: "roster" })).toBe(
      false,
    );
  });
});

describe("self check-in allow/deny", () => {
  it("hides the action when the login is not linked to staff", () => {
    expect(decideSelfCheck({ linked: false, enabled: true, kind: "in", punchesToday: 0 })).toEqual({
      allow: false,
      reason: "not_linked",
    });
  });

  it("refuses check-in and check-out when the profile flag is off", () => {
    expect(decideSelfCheck({ linked: true, enabled: false, kind: "in", punchesToday: 0 })).toEqual({
      allow: false,
      reason: "not_enabled",
    });
    expect(decideSelfCheck({ linked: true, enabled: false, kind: "out", punchesToday: 1 })).toEqual({
      allow: false,
      reason: "not_enabled",
    });
  });

  it("allows one check-in, then one check-out, for a person whose flag is on", () => {
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "in", punchesToday: 0 })).toEqual({ allow: true });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "out", punchesToday: 0 })).toEqual({
      allow: false,
      reason: "need_in",
    });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "in", punchesToday: 1 })).toEqual({
      allow: false,
      reason: "already_in",
    });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "out", punchesToday: 1 })).toEqual({ allow: true });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "out", punchesToday: 2 })).toEqual({
      allow: false,
      reason: "already_out",
    });
    expect(decideSelfCheck({ linked: true, enabled: true, kind: "in", punchesToday: 2 })).toEqual({
      allow: false,
      reason: "already_out",
    });
  });

  it("enables Check in only before the first punch and Check out only after it", () => {
    expect(selfCheckButtons(0)).toEqual({ checkIn: true, checkOut: false });
    expect(selfCheckButtons(1)).toEqual({ checkIn: false, checkOut: true });
    expect(selfCheckButtons(2)).toEqual({ checkIn: false, checkOut: false });
  });
});

describe("resolveSelfCheckPunchLocation", () => {
  const home = {
    homeLocationId: "kds-home",
    homeLabel: "KDS-CC — Kids Driving School - City Center Doha",
  };
  const warehouse = fence({
    locationId: "whse-id",
    name: "Warehouse",
    locationLabel: "WHSE — Warehouse",
    latitude: WHSE.latitude,
    longitude: WHSE.longitude,
  });
  const kdsFence = fence({
    locationId: "kds-home",
    name: "KDS City Center",
    locationLabel: home.homeLabel,
    latitude: KDS.latitude,
    longitude: KDS.longitude,
  });

  it("does not match geo when GPS is missing (home only as inert fallback)", () => {
    expect(resolveSelfCheckPunchLocation({ ...home, fences: [warehouse, kdsFence] })).toMatchObject({
      locationId: "kds-home",
      locationLabel: home.homeLabel,
      inside: null,
      matchedGeo: false,
    });
  });

  it("attributes a warehouse GPS punch to WHSE even when home is KDS", () => {
    const resolved = resolveSelfCheckPunchLocation({
      ...home,
      latitude: WHSE.latitude,
      longitude: WHSE.longitude,
      fences: [kdsFence, warehouse],
    });
    expect(resolved).toMatchObject({
      locationId: "whse-id",
      locationLabel: "WHSE — Warehouse",
      geofenceName: "Warehouse",
      inside: true,
      matchedGeo: true,
    });
  });

  it("still attributes near-yard GPS drift to the warehouse instead of home", () => {
    // ~350m north of the WHSE pin — outside the 200m hard radius, inside soft snap.
    const resolved = resolveSelfCheckPunchLocation({
      ...home,
      latitude: WHSE.latitude + 0.0032,
      longitude: WHSE.longitude,
      fences: [kdsFence, warehouse],
    });
    expect(resolved.locationId).toBe("whse-id");
    expect(resolved.matchedGeo).toBe(true);
    expect(resolved.inside).toBe(false);
    expect(resolved.distanceMeters).toBeGreaterThan(DEFAULT_GEOFENCE_RADIUS_METERS);
  });

  it("refuses home fallback when GPS is far from every geo site", () => {
    const resolved = resolveSelfCheckPunchLocation({
      ...home,
      latitude: 24.5,
      longitude: 51.0,
      fences: [kdsFence, warehouse],
    });
    expect(resolved).toMatchObject({
      locationId: null,
      matchedGeo: false,
      inside: false,
    });
  });
});

describe("selfCheckCoordsFromPayload", () => {
  it("reads lat/lng from self_check raw_payload", () => {
    expect(
      selfCheckCoordsFromPayload({
        via: "self_check",
        latitude: WHSE.latitude,
        longitude: WHSE.longitude,
        accuracy_meters: 12,
      }),
    ).toEqual({
      latitude: WHSE.latitude,
      longitude: WHSE.longitude,
      accuracyMeters: 12,
    });
    expect(selfCheckCoordsFromPayload({ via: "self_check", latitude: null })).toBeNull();
  });
});

describe("mergeSelfCheckPunchFences", () => {
  it("adds inactive warehouse pins without replacing active branch fences", () => {
    const kds = fence({
      locationId: "kds",
      name: "KDS",
      locationLabel: "KDS-CC",
      latitude: KDS.latitude,
      longitude: KDS.longitude,
    });
    const whse = fence({
      locationId: "whse",
      name: "Warehouse",
      locationLabel: "WHSE",
      latitude: WHSE.latitude,
      longitude: WHSE.longitude,
    });
    const merged = mergeSelfCheckPunchFences({
      activeFences: [kds],
      warehouseFences: [whse, { ...kds, name: "ignored duplicate" }],
    });
    expect(merged).toHaveLength(2);
    expect(merged.find((f) => f.locationId === "kds")?.name).toBe("KDS");
    expect(merged.find((f) => f.locationId === "whse")?.name).toBe("Warehouse");
  });
});
