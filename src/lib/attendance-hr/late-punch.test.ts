import { describe, expect, it } from "vitest";

import {
  computeLatePunchMinutes,
  normalizeShiftHm,
  reportingClockIso,
  resolveListingLateMinutes,
  resolveRosterScheduledBounds,
  resolveRosterScheduledIn,
  scheduledIsoFromHm,
  type RosterShiftLookup,
} from "./late-punch";

describe("late punch helpers", () => {
  it("normalizes HH:MM and HH:MM:SS", () => {
    expect(normalizeShiftHm("10:00")).toBe("10:00");
    expect(normalizeShiftHm("10:00:00")).toBe("10:00");
    expect(normalizeShiftHm("9:30")).toBe("09:30");
    expect(normalizeShiftHm(null)).toBeNull();
  });

  it("builds Qatar-local scheduled ISO", () => {
    expect(scheduledIsoFromHm("2026-08-27", "10:30")).toBe("2026-08-27T07:30:00.000Z");
  });

  it("reporting clock = roster start − reporting minutes (never hardcodes 10:00)", () => {
    // roster 10:30 − 30 → 10:00
    expect(reportingClockIso("2026-08-27T07:30:00.000Z", 30)).toBe("2026-08-27T07:00:00.000Z");
    // roster 11:00 − 30 → 10:30
    expect(reportingClockIso("2026-08-27T08:00:00.000Z", 30)).toBe("2026-08-27T07:30:00.000Z");
    expect(reportingClockIso(null, 30)).toBeNull();
  });

  it("roster 10:30 − reporting 30 + buffer 15 → late after 10:15", () => {
    // reporting_clock 10:00; on_time_until 10:15
    // Buffer = grace after reporting clock (not an early-arrival window).
    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:14:00.000Z", // 10:14 Qatar
        scheduledIn: "2026-08-27T07:30:00.000Z", // roster 10:30
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(0);

    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:26:00.000Z", // 10:26 → 11 past 10:15
        scheduledIn: "2026-08-27T07:30:00.000Z",
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(11);

    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:16:30.000Z", // 10:16:30 → 1.5 past 10:15
        scheduledIn: "2026-08-27T07:30:00.000Z",
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(1.5);
  });

  it("afternoon roster 13:00 + reporting 30 + buffer 15 → 12:24 PM in is not late", () => {
    // Rajan-style: reporting clock 12:30, on_time_until 12:45. Wrong AM shift (01:00)
    // would invent ~699m late; correct HH:mm must stay 0.
    const scheduledIn = scheduledIsoFromHm("2026-11-02", "13:00");
    expect(scheduledIn).toBe("2026-11-02T10:00:00.000Z");
    expect(
      computeLatePunchMinutes({
        actualIn: "2026-11-02T09:24:09.000Z", // 12:24:09 Qatar
        scheduledIn,
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(0);
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-11-02T09:24:09.000Z",
        rosterScheduledIn: scheduledIn,
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(0);
  });

  it("wrong overnight AM roster start invents huge late vs afternoon punch", () => {
    // Guardrail: 01:00 stored instead of 13:00 → late after 00:45 → ~699m at 12:24 PM.
    const late = computeLatePunchMinutes({
      actualIn: "2026-11-02T09:24:09.000Z", // 12:24:09 Qatar
      scheduledIn: scheduledIsoFromHm("2026-11-02", "01:00"),
      reportingTimeMinutes: 30,
      bufferMinutes: 15,
    });
    expect(late).toBeGreaterThan(600);
  });

  it("does not use midnight/default baseline without scheduled_in", () => {
    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:26:00.000Z",
        scheduledIn: null,
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(0);
  });

  it("listing late ignores stale stored minutes when roster start is missing", () => {
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-08-27T07:26:31.000Z",
        rosterScheduledIn: null,
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(0);
  });

  it("listing late recomputes from roster start on read", () => {
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-08-27T07:16:30.000Z",
        rosterScheduledIn: "2026-08-27T07:30:00.000Z",
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(1.5);
  });

  it("flexible late is vs shift start + buffer, not reporting clock", () => {
    // Russell 14-09: shift 10:00, check-in 10:00:28, reporting lead 5 → must NOT be ~4.5m late
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-09-14T07:00:28.000Z", // 10:00:28 Qatar
        rosterScheduledIn: "2026-09-14T07:00:00.000Z", // 10:00
        reportingTimeMinutes: 5,
        bufferMinutes: 0,
        lateFromShiftStart: true,
      }),
    ).toBe(0.5);

    // 22-09: check-in 38s after shift start → 0.6m, not ~4.5m vs reporting
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-09-22T07:16:38.000Z",
        rosterScheduledIn: "2026-09-22T07:16:00.000Z",
        reportingTimeMinutes: 5,
        bufferMinutes: 0,
        lateFromShiftStart: true,
      }),
    ).toBe(0.6);

    // 18-09: check-in BEFORE shift start → no late
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-09-18T07:08:23.000Z", // 10:08:23
        rosterScheduledIn: "2026-09-18T07:12:00.000Z", // 10:12
        reportingTimeMinutes: 5,
        bufferMinutes: 0,
        lateFromShiftStart: true,
      }),
    ).toBe(0);

    // Within buffer after shift start → still on time
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-09-14T07:04:00.000Z", // 10:04
        rosterScheduledIn: "2026-09-14T07:00:00.000Z",
        reportingTimeMinutes: 5,
        bufferMinutes: 5,
        lateFromShiftStart: true,
      }),
    ).toBe(0);
  });

  it("flexible blank lead: reporting clock = roster start; late ignores site lead", () => {
    // Empty flexible lead resolves to 0 → Reporting time === Shift start
    expect(reportingClockIso("2026-09-22T07:16:00.000Z", 0)).toBe("2026-09-22T07:16:00.000Z");
    // Site lead 5 must not invent ~4.5m late when lateFromShiftStart
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-09-22T07:16:38.000Z",
        rosterScheduledIn: "2026-09-22T07:16:00.000Z",
        reportingTimeMinutes: 0,
        bufferMinutes: 0,
        lateFromShiftStart: true,
      }),
    ).toBe(0.6);
    expect(
      resolveListingLateMinutes({
        actualIn: "2026-09-14T07:00:28.000Z",
        rosterScheduledIn: "2026-09-14T07:00:00.000Z",
        reportingTimeMinutes: 0,
        bufferMinutes: 0,
        lateFromShiftStart: true,
      }),
    ).toBe(0.5);
  });

  it("resolves roster scheduled_in from shift_start without trusting stored 08:00", () => {
    const roster: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: "10:30",
      shift_end: "20:00",
      is_week_off: false,
    };
    const byLoc = new Map([["s1|loc1|2026-08-27", roster]]);
    const byDate = new Map([["s1|2026-08-27", roster]]);
    expect(
      resolveRosterScheduledIn({
        staffId: "s1",
        locationId: "loc1",
        workDate: "2026-08-27",
        rosterByStaffLocationDate: byLoc,
        rosterByStaffDate: byDate,
        shiftStartByTemplateId: new Map(),
      }),
    ).toBe("2026-08-27T07:30:00.000Z");
    expect(
      resolveRosterScheduledBounds({
        staffId: "s1",
        locationId: "loc1",
        workDate: "2026-08-27",
        rosterByStaffLocationDate: byLoc,
        rosterByStaffDate: byDate,
        shiftStartByTemplateId: new Map(),
      }),
    ).toEqual({
      scheduledIn: "2026-08-27T07:30:00.000Z",
      scheduledOut: "2026-08-27T17:00:00.000Z",
    });
  });

  it("falls back to staff+date roster when location key has no shift times", () => {
    const emptyLoc: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: null,
      shift_end: null,
      is_week_off: false,
    };
    const withTimes: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: "10:30",
      shift_end: "20:00",
      is_week_off: false,
    };
    expect(
      resolveRosterScheduledIn({
        staffId: "s1",
        locationId: "loc1",
        workDate: "2026-08-27",
        rosterByStaffLocationDate: new Map([["s1|loc1|2026-08-27", emptyLoc]]),
        rosterByStaffDate: new Map([["s1|2026-08-27", withTimes]]),
        shiftStartByTemplateId: new Map(),
      }),
    ).toBe("2026-08-27T07:30:00.000Z");
  });

  it("returns null when roster exists but has no shift start or template", () => {
    const empty: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: null,
      shift_end: null,
      is_week_off: false,
    };
    expect(
      resolveRosterScheduledIn({
        staffId: "s1",
        locationId: "loc1",
        workDate: "2026-08-27",
        rosterByStaffLocationDate: new Map([["s1|loc1|2026-08-27", empty]]),
        rosterByStaffDate: new Map([["s1|2026-08-27", empty]]),
        shiftStartByTemplateId: new Map(),
      }),
    ).toBeNull();
  });

  it("uses staff typical shift when working-day roster has null times", () => {
    const empty: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: null,
      shift_end: null,
      is_week_off: false,
    };
    const typical: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: "10:30",
      shift_end: "20:00",
      is_week_off: false,
    };
    expect(
      resolveRosterScheduledIn({
        staffId: "s1",
        locationId: "loc1",
        workDate: "2026-08-27",
        rosterByStaffLocationDate: new Map([["s1|loc1|2026-08-27", empty]]),
        rosterByStaffDate: new Map([["s1|2026-08-27", empty]]),
        shiftStartByTemplateId: new Map(),
        fallbackByStaffId: new Map([["s1", typical]]),
      }),
    ).toBe("2026-08-27T07:30:00.000Z");
  });

  it("does not invent fallback when there is no roster working day", () => {
    const typical: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: "10:30",
      shift_end: "20:00",
      is_week_off: false,
    };
    expect(
      resolveRosterScheduledIn({
        staffId: "s1",
        locationId: "loc1",
        workDate: "2026-08-27",
        rosterByStaffLocationDate: new Map(),
        rosterByStaffDate: new Map(),
        shiftStartByTemplateId: new Map(),
        fallbackByStaffId: new Map([["s1", typical]]),
      }),
    ).toBeNull();
  });
});
