import { describe, expect, it } from "vitest";

import {
  displayDepartmentHidden,
  excludedOrgDepartmentIds,
  isExcludedOrgDepartmentName,
  recordHiddenByOrgDepartmentExclude,
  shouldApplyOrgDepartmentExclude,
  staffHiddenByOrgDepartmentExclude,
} from "./exclude-org-departments";

describe("isExcludedOrgDepartmentName", () => {
  it("matches operations, maintenance, and f&b cafe including close labels", () => {
    expect(isExcludedOrgDepartmentName("Operations")).toBe(true);
    expect(isExcludedOrgDepartmentName("operation")).toBe(true);
    expect(isExcludedOrgDepartmentName("Maintenance")).toBe(true);
    expect(isExcludedOrgDepartmentName("maintenace")).toBe(true);
    expect(isExcludedOrgDepartmentName("F&B Cafe")).toBe(true);
    expect(isExcludedOrgDepartmentName("F&B")).toBe(true);
    expect(isExcludedOrgDepartmentName("FnB Cafe")).toBe(true);
    expect(isExcludedOrgDepartmentName("F and B Cafe")).toBe(true);
    expect(isExcludedOrgDepartmentName("OPS")).toBe(true);
    expect(isExcludedOrgDepartmentName("FB_CAFE")).toBe(true);
  });

  it("does not match a different department", () => {
    expect(isExcludedOrgDepartmentName("Crew / Attendant")).toBe(false);
    expect(isExcludedOrgDepartmentName("Barista")).toBe(false);
    expect(isExcludedOrgDepartmentName("Food")).toBe(false);
    expect(isExcludedOrgDepartmentName("FEC Operations")).toBe(false);
    expect(isExcludedOrgDepartmentName("Site Operations")).toBe(false);
    expect(isExcludedOrgDepartmentName("F&B Operations")).toBe(false);
    expect(isExcludedOrgDepartmentName("F&B Manager")).toBe(false);
    expect(isExcludedOrgDepartmentName("F&B Cashier")).toBe(false);
    expect(isExcludedOrgDepartmentName("Maintenance Assistant / Electrician")).toBe(false);
    expect(isExcludedOrgDepartmentName("Cashier")).toBe(false);
  });
});

describe("staff and display exclusion", () => {
  it("hides a person only when every department is excluded", () => {
    expect(
      staffHiddenByOrgDepartmentExclude({
        department_names: ["Operations"],
        department: "Operations",
      }),
    ).toBe(true);
    expect(displayDepartmentHidden("F&B Cafe + Operations")).toBe(true);
    expect(
      staffHiddenByOrgDepartmentExclude({
        department_names: ["Crew / Attendant", "Operations"],
        department: "Crew / Attendant",
      }),
    ).toBe(false);
    expect(staffHiddenByOrgDepartmentExclude({ department: null, department_names: [] })).toBe(false);
    expect(displayDepartmentHidden("Battle Arena")).toBe(false);
  });

  it("applies only when the department filter is all", () => {
    expect(shouldApplyOrgDepartmentExclude(true, "")).toBe(true);
    expect(shouldApplyOrgDepartmentExclude(true, "all")).toBe(true);
    expect(shouldApplyOrgDepartmentExclude(true, [])).toBe(true);
    expect(shouldApplyOrgDepartmentExclude(false, "")).toBe(false);
    expect(shouldApplyOrgDepartmentExclude(true, "ops-id")).toBe(false);
    expect(shouldApplyOrgDepartmentExclude(true, ["crew-id"])).toBe(false);
  });

  it("resolves stored department ids and report rows", () => {
    expect(
      excludedOrgDepartmentIds([
        { id: "ops", name: "Operations", code: "OPS" },
        { id: "maint", name: "Maintenance", code: "MAINT" },
        { id: "cafe", name: "F&B Cafe", code: "FB_CAFE" },
        { id: "fb", name: "F&B", code: "FB" },
        { id: "crew", name: "Crew / Attendant", code: "CREW" },
        { id: "fec-ops", name: "FEC Operations", code: "FEC_OPS" },
      ]),
    ).toEqual(["ops", "maint", "cafe", "fb"]);

    expect(recordHiddenByOrgDepartmentExclude({ department: "Maintenance" })).toBe(true);
    expect(recordHiddenByOrgDepartmentExclude({ scope: "Inflatapark" })).toBe(false);
    expect(recordHiddenByOrgDepartmentExclude({ note: "stub" })).toBe(false);
  });
});
