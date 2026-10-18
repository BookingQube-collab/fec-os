import { describe, expect, it } from "vitest";

import {
  canActOnOpsApprovalStep,
  isFoodBeverageStaff,
  opsApprovalLaneForStaff,
  opsApprovalLaneForStaffId,
  opsStepApproverLabel,
  opsStepApproverUserIds,
} from "./approval-ops-routing";

describe("approval ops routing", () => {
  it("detects F&B staff from title and department labels", () => {
    expect(isFoodBeverageStaff("F&B Supervisor", null)).toBe(true);
    expect(isFoodBeverageStaff("Barista", "F&B Cafe")).toBe(true);
    expect(isFoodBeverageStaff("Chef", null)).toBe(true);
    expect(isFoodBeverageStaff("F&B Manager", "F&B")).toBe(true);
    expect(isFoodBeverageStaff("Café Supervisor", null)).toBe(true);
    expect(isFoodBeverageStaff("Sr. Site Supervisor", "Operations")).toBe(false);
    expect(isFoodBeverageStaff("Cashier", "Operations")).toBe(false);
    expect(opsApprovalLaneForStaff("Barista", "F&B Cafe")).toBe("fnb_manager");
    expect(opsApprovalLaneForStaff("Site Supervisor", "Operations")).toBe("head_of_operations");
  });

  it("labels the ops step by lane", () => {
    expect(opsStepApproverLabel("head_of_operations")).toBe("Head of Operations");
    expect(opsStepApproverLabel("fnb_manager")).toBe("F&B Manager");
  });

  it("lets HoO approve Operations and F&B Manager approve F&B, without crossing lanes", () => {
    expect(
      canActOnOpsApprovalStep({
        manage: false,
        lane: "head_of_operations",
        actorJobTitle: "Head of Operations",
      }),
    ).toBe(true);
    expect(
      canActOnOpsApprovalStep({
        manage: false,
        lane: "fnb_manager",
        actorJobTitle: "Head of Operations",
      }),
    ).toBe(false);
    expect(
      canActOnOpsApprovalStep({
        manage: false,
        lane: "fnb_manager",
        actorJobTitle: "F&B Manager",
        actorDepartment: "F&B",
      }),
    ).toBe(true);
    expect(
      canActOnOpsApprovalStep({
        manage: false,
        lane: "head_of_operations",
        actorJobTitle: "F&B Manager",
        actorDepartment: "F&B",
      }),
    ).toBe(false);
    expect(
      canActOnOpsApprovalStep({
        manage: true,
        lane: "fnb_manager",
        actorJobTitle: "Cashier",
      }),
    ).toBe(true);
  });

  it("returns HoO or F&B Manager user ids from the directory", () => {
    const directory = {
      headOfOperationsUserIds: ["rajan"],
      fnbManagerUserIds: ["ruben"],
      fnbStaffIds: new Set(["barista-1"]),
    };
    expect(opsStepApproverUserIds(directory, "ops-crew")).toEqual(["rajan"]);
    expect(opsStepApproverUserIds(directory, "barista-1")).toEqual(["ruben"]);
    expect(opsStepApproverUserIds(directory, null)).toEqual(["rajan"]);
    expect(opsApprovalLaneForStaffId(directory, "barista-1")).toBe("fnb_manager");
    expect(opsApprovalLaneForStaffId(directory, "ops-crew")).toBe("head_of_operations");
  });
});
