import { describe, expect, it } from "vitest";

import { DEFAULT_SHIFT } from "./constants";
import {
  applyAttendanceShiftPolicy,
  breakMinutesForLocation,
  expectedShiftMinutes,
  normalizeAttendanceEmploymentRole,
} from "./shift-policy";

describe("attendance shift policy", () => {
  it("maps employment types onto shift roles", () => {
    expect(normalizeAttendanceEmploymentRole("permanent")).toBe("permanent");
    expect(normalizeAttendanceEmploymentRole("secondment")).toBe("secondment");
    expect(normalizeAttendanceEmploymentRole("Joker")).toBe("joker");
    expect(normalizeAttendanceEmploymentRole("temporary")).toBe("joker");
    expect(normalizeAttendanceEmploymentRole(null)).toBeNull();
    expect(normalizeAttendanceEmploymentRole("contractor")).toBeNull();
  });

  it("uses 9h for permanent/missing and 10h for secondment/joker", () => {
    expect(expectedShiftMinutes("permanent")).toBe(540);
    expect(expectedShiftMinutes(null)).toBe(540);
    expect(expectedShiftMinutes("secondment")).toBe(600);
    expect(expectedShiftMinutes("joker")).toBe(600);
  });

  it("deducts 30 minutes for Urban Arena and 60 elsewhere", () => {
    expect(breakMinutesForLocation("UA-DM")).toBe(30);
    expect(breakMinutesForLocation("ua-dm")).toBe(30);
    expect(breakMinutesForLocation("INF-CC")).toBe(60);
    expect(breakMinutesForLocation("KDS-CC")).toBe(60);
  });

  it("prefers an explicit break override when present", () => {
    expect(breakMinutesForLocation("INF-CC", 45)).toBe(45);
    expect(breakMinutesForLocation("UA-DM", 60)).toBe(60);
    expect(breakMinutesForLocation("UA-DM", null)).toBe(30);
  });

  it("applies break and OT threshold onto a shift template", () => {
    const permanentInf = applyAttendanceShiftPolicy(DEFAULT_SHIFT, {
      employmentType: "permanent",
      locationCode: "INF-CC",
    });
    expect(permanentInf.breakMinutes).toBe(60);
    expect(permanentInf.overtimeAfterMinutes).toBe(540);

    const jokerUa = applyAttendanceShiftPolicy(DEFAULT_SHIFT, {
      employmentType: "joker",
      locationCode: "UA-DM",
    });
    expect(jokerUa.breakMinutes).toBe(30);
    expect(jokerUa.overtimeAfterMinutes).toBe(600);

    const overridden = applyAttendanceShiftPolicy(DEFAULT_SHIFT, {
      employmentType: "permanent",
      locationCode: "INF-CC",
      breakMinutesOverride: 45,
    });
    expect(overridden.breakMinutes).toBe(45);
  });
});
