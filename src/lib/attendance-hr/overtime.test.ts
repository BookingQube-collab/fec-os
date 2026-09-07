import { describe, expect, it } from "vitest";

import { computeAttendanceOvertimeMinutes } from "./overtime";

describe("computeAttendanceOvertimeMinutes", () => {
  it("Wasanthi 27-Aug: roster 10:30–20:00, out 20:06 → 6 min past end, not 9.67−9", () => {
    // 10:26:31 → 20:06:26 Qatar = 9.67h clock. Site 9h would invent 0.67h OT.
    expect(
      computeAttendanceOvertimeMinutes({
        workedMinutes: 580,
        actualOut: "2026-08-27T17:06:26.000Z",
        scheduledIn: "2026-08-27T07:30:00.000Z",
        scheduledOut: "2026-08-27T17:00:00.000Z",
        siteExpectedMinutes: 540,
      }),
    ).toBe(6);
  });

  it("Wasanthi 26-Aug: roster 10:30–20:00, out 20:08:45 → 9 min past end, not 9.89−9", () => {
    expect(
      computeAttendanceOvertimeMinutes({
        workedMinutes: 593,
        actualOut: "2026-08-26T17:08:45.000Z",
        scheduledIn: "2026-08-26T07:30:00.000Z",
        scheduledOut: "2026-08-26T17:00:00.000Z",
        siteExpectedMinutes: 540,
      }),
    ).toBe(9);
  });

  it("Wasanthi 21-Aug: roster 12:30–22:00, out 21:59:50 → no OT", () => {
    // Left before roster end. Early check-in must not invent OT vs 9h or 9.5h duration.
    expect(
      computeAttendanceOvertimeMinutes({
        workedMinutes: 574,
        actualOut: "2026-08-21T18:59:50.000Z",
        scheduledIn: "2026-08-21T09:30:00.000Z",
        scheduledOut: "2026-08-21T19:00:00.000Z",
        siteExpectedMinutes: 540,
      }),
    ).toBe(0);
  });

  it("does not invent OT when they leave at roster end even if clock > site 9h", () => {
    expect(
      computeAttendanceOvertimeMinutes({
        workedMinutes: 580,
        actualOut: "2026-08-27T17:00:00.000Z",
        scheduledIn: "2026-08-27T07:30:00.000Z",
        scheduledOut: "2026-08-27T17:00:00.000Z",
        siteExpectedMinutes: 540,
      }),
    ).toBe(0);
  });

  it("falls back to site working hours when roster end is missing", () => {
    expect(
      computeAttendanceOvertimeMinutes({
        workedMinutes: 600,
        actualOut: "2026-08-27T17:00:00.000Z",
        scheduledIn: null,
        scheduledOut: null,
        siteExpectedMinutes: 540,
      }),
    ).toBe(60);
  });

  it("does not invent a 9h default when roster and site hours are both missing", () => {
    expect(
      computeAttendanceOvertimeMinutes({
        workedMinutes: 580,
        actualOut: "2026-08-27T17:06:26.000Z",
        scheduledIn: null,
        scheduledOut: null,
        siteExpectedMinutes: null,
      }),
    ).toBe(0);
  });
});
