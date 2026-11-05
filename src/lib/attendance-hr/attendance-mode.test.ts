import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_MODE_ROSTER,
  ATTENDANCE_MODE_SHIFT_PUNCH,
  defaultAttendanceModeForLocationCode,
  normalizeAttendanceMode,
  siteUsesShiftPunchAttendance,
  usesPunchDrivenAttendance,
} from "./attendance-mode";

describe("normalizeAttendanceMode", () => {
  it("accepts roster and shift_punch", () => {
    expect(normalizeAttendanceMode("roster")).toBe(ATTENDANCE_MODE_ROSTER);
    expect(normalizeAttendanceMode("shift_punch")).toBe(ATTENDANCE_MODE_SHIFT_PUNCH);
    expect(normalizeAttendanceMode("SHIFT_PUNCH")).toBe(ATTENDANCE_MODE_SHIFT_PUNCH);
  });

  it("falls back to roster for unknown values", () => {
    expect(normalizeAttendanceMode(null)).toBe(ATTENDANCE_MODE_ROSTER);
    expect(normalizeAttendanceMode(undefined)).toBe(ATTENDANCE_MODE_ROSTER);
    expect(normalizeAttendanceMode("event")).toBe(ATTENDANCE_MODE_ROSTER);
  });
});

describe("defaultAttendanceModeForLocationCode", () => {
  it("defaults HO to shift_punch and sites to roster", () => {
    expect(defaultAttendanceModeForLocationCode("HO")).toBe(ATTENDANCE_MODE_SHIFT_PUNCH);
    expect(defaultAttendanceModeForLocationCode("ho")).toBe(ATTENDANCE_MODE_SHIFT_PUNCH);
    expect(defaultAttendanceModeForLocationCode("INF-CC")).toBe(ATTENDANCE_MODE_ROSTER);
    expect(defaultAttendanceModeForLocationCode("UA-DM")).toBe(ATTENDANCE_MODE_ROSTER);
    expect(defaultAttendanceModeForLocationCode(null)).toBe(ATTENDANCE_MODE_ROSTER);
  });
});

describe("siteUsesShiftPunchAttendance / usesPunchDrivenAttendance", () => {
  it("detects shift_punch site mode", () => {
    expect(siteUsesShiftPunchAttendance("shift_punch")).toBe(true);
    expect(siteUsesShiftPunchAttendance("roster")).toBe(false);
  });

  it("treats staff self check-in or site shift_punch as punch-driven", () => {
    expect(usesPunchDrivenAttendance({ canSelfCheckIn: true, attendanceMode: "roster" })).toBe(true);
    expect(usesPunchDrivenAttendance({ canSelfCheckIn: false, attendanceMode: "shift_punch" })).toBe(true);
    expect(usesPunchDrivenAttendance({ canSelfCheckIn: false, attendanceMode: "roster" })).toBe(false);
    expect(usesPunchDrivenAttendance({})).toBe(false);
  });
});
