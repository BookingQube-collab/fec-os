import { describe, expect, it } from "vitest";

import {
  computeLatePunchMinutes,
  normalizeShiftHm,
  resolveListingLateMinutes,
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
    expect(scheduledIsoFromHm("2026-08-27", "10:00")).toBe("2026-08-27T07:00:00.000Z");
  });

  it("roster 10:00 + reporting 30 + buffer 15 → late after 10:45", () => {
    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:26:00.000Z", // 10:26 Qatar
        scheduledIn: "2026-08-27T07:00:00.000Z", // 10:00 Qatar
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(0);

    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:50:30.000Z", // 10:50:30 → 5.5 past 10:45
        scheduledIn: "2026-08-27T07:00:00.000Z",
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(5.5);
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
        actualIn: "2026-08-27T07:50:30.000Z",
        rosterScheduledIn: "2026-08-27T07:00:00.000Z",
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(5.5);
  });

  it("resolves roster scheduled_in from shift_start without trusting stored 08:00", () => {
    const roster: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: "10:00",
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
    ).toBe("2026-08-27T07:00:00.000Z");
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
      shift_start: "10:00",
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
    ).toBe("2026-08-27T07:00:00.000Z");
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
      shift_start: "10:00",
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
    ).toBe("2026-08-27T07:00:00.000Z");
  });

  it("does not invent fallback when there is no roster working day", () => {
    const typical: RosterShiftLookup = {
      shift_template_id: null,
      shift_start: "10:00",
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
