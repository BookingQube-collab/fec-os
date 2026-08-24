import { describe, expect, it } from "vitest";

import { HR_EXTRA_PAGES } from "./hr-extras";

describe("HR extras catalog", () => {
  it("lists the nested Time & Attendance roster as hidden, not deleted", () => {
    const roster = HR_EXTRA_PAGES.find((row) => row.path === "/people/attendance/roster");
    expect(roster?.visibility).toBe("hidden");
    expect(roster?.canonicalPath).toBe("/people/import");
  });

  it("parks People attendance and shifts tabs for review", () => {
    expect(HR_EXTRA_PAGES.some((row) => row.path === "/people?tab=attendance")).toBe(true);
    expect(HR_EXTRA_PAGES.some((row) => row.path === "/people?tab=shifts")).toBe(true);
  });

  it("keeps Daily Ops roster listed without hiding it from operations", () => {
    const ops = HR_EXTRA_PAGES.find((row) => row.path === "/daily-ops/roster");
    expect(ops?.visibility).toBe("visible_elsewhere");
  });
});
