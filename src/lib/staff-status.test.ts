import { describe, expect, it } from "vitest";

import {
  isActiveRosterStaff,
  isActiveStaffStatus,
  isOnLeaveStaffStatus,
  isTerminatedStaffStatus,
} from "./staff-status";

describe("staff status helpers", () => {
  it("treats blank and active as active", () => {
    expect(isActiveStaffStatus(null)).toBe(true);
    expect(isActiveStaffStatus("")).toBe(true);
    expect(isActiveStaffStatus("  ")).toBe(true);
    expect(isActiveStaffStatus("Active")).toBe(true);
    expect(isActiveStaffStatus("temporary")).toBe(false);
  });

  it("classifies leave and terminated without using employment_type", () => {
    expect(isOnLeaveStaffStatus("on_leave")).toBe(true);
    expect(isOnLeaveStaffStatus("vacation")).toBe(true);
    expect(isTerminatedStaffStatus("terminated")).toBe(true);
    expect(isTerminatedStaffStatus("inactive")).toBe(true);
    expect(isActiveStaffStatus("terminated")).toBe(false);
  });

  it("counts active and on-leave as the payroll roster", () => {
    expect(isActiveRosterStaff(null)).toBe(true);
    expect(isActiveRosterStaff("active")).toBe(true);
    expect(isActiveRosterStaff("on_leave")).toBe(true);
    expect(isActiveRosterStaff("terminated")).toBe(false);
    expect(isActiveRosterStaff("inactive")).toBe(false);
  });
});
