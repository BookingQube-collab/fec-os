import { describe, expect, it } from "vitest";

import { getActiveMobileTab, isMobileTabActive, isSitesPath, isTasksPath } from "./mobile-nav";

describe("mobile-nav path matching", () => {
  it("classifies sites and tasks without stealing home", () => {
    expect(isSitesPath("/branches")).toBe(true);
    expect(isSitesPath("/branches/league")).toBe(true);
    expect(isTasksPath("/tasks")).toBe(true);
    expect(isTasksPath("/tasks/abc")).toBe(true);
    expect(isSitesPath("/")).toBe(false);
  });

  it("lights the correct primary tab", () => {
    expect(getActiveMobileTab("/")).toBe("home");
    expect(getActiveMobileTab("/branches")).toBe("sites");
    expect(getActiveMobileTab("/tasks/1")).toBe("tasks");
    expect(getActiveMobileTab("/people")).toBe(null);
    expect(getActiveMobileTab("/daily-ops")).toBe(null);
  });

  it("treats unmatched routes as More when the sheet is closed", () => {
    expect(isMobileTabActive("more", "/maintenance")).toBe(true);
    expect(isMobileTabActive("more", "/branches", false)).toBe(false);
    expect(isMobileTabActive("more", "/tasks", true)).toBe(true);
    expect(isMobileTabActive("home", "/")).toBe(true);
  });
});
