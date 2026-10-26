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
    expect(payload.actionUrl).toBe("/people/field");
    expect(payload.body).toContain("840 m");
  });

  it("maps correction submitted to My Day Approve and decisions to My Day Correction", () => {
    const submitted = mapHrNotifyEvent({ kind: "correction_submitted", staffName: "Noor", workDate: "2026-08-21" });
    expect(submitted.actionUrl).toBe("/hr/me#me-punch-approvals");
    const approved = mapHrNotifyEvent({ kind: "correction_approved", staffName: "Noor", workDate: "2026-08-21" });
    expect(approved.actionUrl).toBe("/hr/me#me-correction");
    expect(approved.severity).toBe("info");
    const rejected = mapHrNotifyEvent({ kind: "correction_rejected", staffName: "Noor" });
    expect(rejected.actionUrl).toBe("/hr/me#me-correction");
    expect(rejected.severity).toBe("warning");
    expect(rejected.title).toBe("Attendance correction rejected");
  });
  it("maps leave events to hr_leave category for the line-manager My Day queue", () => {
    const payload = mapHrNotifyEvent({
      kind: "leave_submitted",
      staffName: "Sara",
      workDate: "2026-09-01",
    });
    expect(payload.category).toBe("hr_leave");
    expect(payload.sourceType).toBe("hr_leave");
    expect(payload.title).toBe("Leave request needs your approval");
    expect(payload.body).toContain("line manager");
    expect(payload.actionUrl).toBe("/hr/me#me-leave-approvals");
  });

  it("includes leave request numbers in title and body when provided", () => {
    const payload = mapHrNotifyEvent({
      kind: "leave_submitted",
      staffName: "Sara",
      workDate: "2026-09-01",
      requestNumber: "LV-20260901-0003",
    });
    expect(payload.title).toContain("LV-20260901-0003");
    expect(payload.body).toContain("LV-20260901-0003");
  });
});

describe("shouldSendHrNotify", () => {
  it("respects toggles", () => {
    expect(shouldSendHrNotify("late", DEFAULT_HR_NOTIFY_TOGGLES)).toBe(true);
    expect(shouldSendHrNotify("late", { ...DEFAULT_HR_NOTIFY_TOGGLES, notifyLate: false })).toBe(false);
    expect(shouldSendHrNotify("geofence_exit", { ...DEFAULT_HR_NOTIFY_TOGGLES, notifyGeofenceExit: false })).toBe(false);
    expect(shouldSendHrNotify("correction_submitted", { ...DEFAULT_HR_NOTIFY_TOGGLES, notifyCorrections: false })).toBe(false);
  });

  it("always sends leave workflow notifies", () => {
    expect(
      shouldSendHrNotify("leave_submitted", { ...DEFAULT_HR_NOTIFY_TOGGLES, notifyCorrections: false }),
    ).toBe(true);
  });
});
