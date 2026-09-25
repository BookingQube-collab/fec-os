import { describe, expect, it } from "vitest";

import {
  getActiveMobileTab,
  isAttendancePath,
  isMobileTabActive,
  isOperationsPath,
  isPeoplePath,
} from "./mobile-nav";

describe("mobile-nav path matching", () => {
  it("classifies attendance under /people/attendance without stealing People", () => {
    expect(isAttendancePath("/people/attendance")).toBe(true);
    expect(isAttendancePath("/people/attendance/reports")).toBe(true);
    expect(isPeoplePath("/people")).toBe(true);
    expect(isPeoplePath("/people/hr")).toBe(true);
    expect(isPeoplePath("/people/attendance")).toBe(false);
  });

  it("lights the correct primary tab", () => {
    expect(getActiveMobileTab("/")).toBe("home");
    expect(getActiveMobileTab("/people")).toBe("people");
    expect(getActiveMobileTab("/people/attendance/mapping")).toBe("attendance");
    expect(getActiveMobileTab("/daily-ops")).toBe("operations");
    expect(getActiveMobileTab("/operations/weekly-review")).toBe("operations");
    expect(getActiveMobileTab("/maintenance")).toBe(null);
  });

  it("treats unmatched routes as More when the sheet is closed", () => {
    expect(isMobileTabActive("more", "/maintenance")).toBe(true);
    expect(isMobileTabActive("more", "/people", false)).toBe(false);
    expect(isMobileTabActive("more", "/people", true)).toBe(true);
    expect(isOperationsPath("/occ")).toBe(false);
  });
});
