import { describe, expect, it } from "vitest";

import { DEFAULT_HR_NOTIFY_TOGGLES, mapHrNotifyEvent, shouldSendHrNotify } from "./hr-notify";

describe("mapHrNotifyEvent", () => {
  it("maps missed punch to the attendance listing", () => {
    const payload = mapHrNotifyEvent({
      kind: "missed_punch",
      staffName: "Aisha",
      locationName: "Inflatapark",
      workDate: "2026-08-20",
      sourceId: "11111111-1111-4111-8111-111111111111",
    });
    expect(payload.category).toBe("people");
    expect(payload.title).toBe("Missed punch");
    expect(payload.body).toContain("Aisha");
    expect(payload.body).toContain("2026-08-20");
    expect(payload.actionUrl).toBe("/people/attendance/reports");
    expect(payload.severity).toBe("warning");
  });

  it("maps geofence exit as critical and links to Field", () => {
    const payload = mapHrNotifyEvent({
      kind: "geofence_exit",
      staffName: "Russell",
      locationName: "Urban Arena",
      distanceMeters: 840,
    });
    expect(payload.severity).toBe("critical");
    expect(payload.actionUrl).toBe("/people/attendance/field");
    expect(payload.body).toContain("840 m");
  });

  it("maps correction decisions to the corrections queue", () => {
    const approved = mapHrNotifyEvent({ kind: "correction_approved", staffName: "Noor", workDate: "2026-08-21" });
    expect(approved.actionUrl).toBe("/people/attendance/corrections");
    expect(approved.severity).toBe("info");
    const rejected = mapHrNotifyEvent({ kind: "correction_rejected", staffName: "Noor" });
    expect(rejected.severity).toBe("warning");
    expect(rejected.title).toBe("Attendance correction rejected");
  });
});

describe("shouldSendHrNotify", () => {
  it("respects toggles", () => {
    expect(shouldSendHrNotify("late", DEFAULT_HR_NOTIFY_TOGGLES)).toBe(true);
    expect(shouldSendHrNotify("late", { ...DEFAULT_HR_NOTIFY_TOGGLES, notifyLate: false })).toBe(false);
    expect(shouldSendHrNotify("geofence_exit", { ...DEFAULT_HR_NOTIFY_TOGGLES, notifyGeofenceExit: false })).toBe(false);
    expect(shouldSendHrNotify("correction_submitted", { ...DEFAULT_HR_NOTIFY_TOGGLES, notifyCorrections: false })).toBe(false);
  });
});
