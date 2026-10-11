import { describe, expect, it } from "vitest";

import {
  countsAsActiveStaff,
  isActiveRosterStaff,
  isActiveStaffStatus,
  isContractFinishedStaffStatus,
  isOnLeaveStaffStatus,
  isResignedStaffStatus,
  isTerminatedStaffStatus,
  reconcileJokerStaffStatus,
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

  it("does not treat a joker as active staff", () => {
    expect(isActiveStaffStatus("joker")).toBe(false);
    expect(countsAsActiveStaff("active", "joker")).toBe(false);
    expect(countsAsActiveStaff("active", "Joker")).toBe(false);
    expect(countsAsActiveStaff("joker", "permanent")).toBe(false);
    expect(countsAsActiveStaff("active", "permanent")).toBe(true);
    expect(countsAsActiveStaff("probation", null)).toBe(true);
    expect(reconcileJokerStaffStatus("joker", "active")).toBe("joker");
    expect(reconcileJokerStaffStatus("Joker", "probation")).toBe("joker");
    expect(reconcileJokerStaffStatus("joker", "on_leave")).toBe("on_leave");
    expect(reconcileJokerStaffStatus("joker", "terminated")).toBe("terminated");
    expect(reconcileJokerStaffStatus("permanent", "joker")).toBe("active");
  });

  it("counts active and on-leave as the payroll roster", () => {
    expect(isActiveRosterStaff(null)).toBe(true);
    expect(isActiveRosterStaff("active")).toBe(true);
    expect(isActiveRosterStaff("on_leave")).toBe(true);
    expect(isActiveRosterStaff("terminated")).toBe(false);
    expect(isActiveRosterStaff("inactive")).toBe(false);
  });

  it("treats a finished temporary or secondment contract as ended, not resigned or terminated", () => {
    expect(isContractFinishedStaffStatus("contract_finished")).toBe(true);
    expect(isContractFinishedStaffStatus("Contract Finished")).toBe(true);
    expect(isContractFinishedStaffStatus("terminated")).toBe(false);
    expect(isTerminatedStaffStatus("contract_finished")).toBe(false);
    expect(isResignedStaffStatus("contract_finished")).toBe(false);
    expect(isActiveStaffStatus("contract_finished")).toBe(false);
    expect(countsAsActiveStaff("contract_finished", "temporary")).toBe(false);
    expect(countsAsActiveStaff("contract_finished", "secondment")).toBe(false);
    expect(countsAsActiveStaff("contract_finished", "permanent")).toBe(false);
    expect(isActiveRosterStaff("contract_finished")).toBe(false);
    expect(reconcileJokerStaffStatus("temporary", "contract_finished")).toBe("contract_finished");
    expect(reconcileJokerStaffStatus("secondment", "contract_finished")).toBe("contract_finished");
    expect(reconcileJokerStaffStatus("joker", "contract_finished")).toBe("contract_finished");
  });
});
