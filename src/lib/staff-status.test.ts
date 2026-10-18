import { describe, expect, it } from "vitest";

import {
  ACTIVE_ROSTER_STAFF_STATUS_OR,
  countsAsActiveStaff,
  isActiveRosterStaff,
  isActiveStaffStatus,
  isAttendanceMappingStaff,
  isContractFinishedStaffStatus,
  isOnLeaveStaffStatus,
  isResignedStaffStatus,
  isTerminatedStaffStatus,
  reconcileJokerEmploymentType,
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

  it("treats active employment-type jokers as active staff; status=joker stays out", () => {
    expect(isActiveStaffStatus("joker")).toBe(false);
    expect(countsAsActiveStaff("active", "joker")).toBe(true);
    expect(countsAsActiveStaff("active", "Joker")).toBe(true);
    expect(countsAsActiveStaff("joker", "permanent")).toBe(false);
    expect(countsAsActiveStaff("joker", "joker")).toBe(false);
    expect(countsAsActiveStaff("active", "permanent")).toBe(true);
    expect(countsAsActiveStaff("probation", null)).toBe(true);
    // Active status is allowed while employment type stays joker.
    expect(reconcileJokerStaffStatus("joker", "active")).toBe("active");
    expect(reconcileJokerStaffStatus("Joker", "probation")).toBe("probation");
    expect(reconcileJokerStaffStatus("joker", "on_leave")).toBe("on_leave");
    expect(reconcileJokerStaffStatus("joker", "terminated")).toBe("terminated");
    expect(reconcileJokerStaffStatus("joker", "")).toBe("joker");
    expect(reconcileJokerStaffStatus("permanent", "joker")).toBe("active");
    expect(reconcileJokerEmploymentType("permanent", "joker")).toBe("joker");
    expect(reconcileJokerEmploymentType("joker", "active")).toBe("joker");
    expect(reconcileJokerEmploymentType("permanent", "active")).toBe("permanent");
  });

  it("counts active and on-leave as the payroll roster", () => {
    expect(isActiveRosterStaff(null)).toBe(true);
    expect(isActiveRosterStaff("active")).toBe(true);
    expect(isActiveRosterStaff("on_leave")).toBe(true);
    expect(isActiveRosterStaff("terminated")).toBe(false);
    expect(isActiveRosterStaff("inactive")).toBe(false);
  });

  it("lets a secondment employee be mapped and keeps exited staff out of the picker", () => {
    expect(isAttendanceMappingStaff({ status: "secondment", employment_type: "secondment" })).toBe(true);
    expect(isAttendanceMappingStaff({ status: "active", employment_type: "permanent" })).toBe(true);
    expect(isAttendanceMappingStaff({ status: "remote", employment_type: "permanent" })).toBe(true);
    expect(isAttendanceMappingStaff({ status: "on_leave", employment_type: "permanent" })).toBe(true);
    expect(isAttendanceMappingStaff({ status: "terminated", employment_type: "permanent" })).toBe(false);
    expect(isAttendanceMappingStaff({ status: "terminated", employment_type: "secondment" })).toBe(false);
    expect(isAttendanceMappingStaff({ status: "resigned", employment_type: "permanent" })).toBe(false);
    expect(isAttendanceMappingStaff({ status: "contract_finished", employment_type: "secondment" })).toBe(false);
    expect(isAttendanceMappingStaff({ status: "active", employment_type: "joker" })).toBe(true);
    expect(isAttendanceMappingStaff({ status: "serving_notice", employment_type: "joker" })).toBe(true);
    expect(isAttendanceMappingStaff({ status: "joker", employment_type: "joker" })).toBe(false);
    expect(ACTIVE_ROSTER_STAFF_STATUS_OR).toContain("secondment");
    expect(ACTIVE_ROSTER_STAFF_STATUS_OR).not.toContain("terminated");
    expect(ACTIVE_ROSTER_STAFF_STATUS_OR).not.toContain("resigned");
    expect(ACTIVE_ROSTER_STAFF_STATUS_OR).not.toContain("contract_finished");
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
