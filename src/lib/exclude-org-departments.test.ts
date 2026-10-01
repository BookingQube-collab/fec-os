import { describe, expect, it } from "vitest";

import {
  ALL_ORG_DEPARTMENTS_CHECKED,
  activeShowOnlyOrgDepartments,
  displayDepartmentShown,
  orgDepartmentIdsFor,
  orgFocusDepartmentOfName,
  recordMatchesOrgShowOnly,
  staffMatchesOrgShowOnly,
  type OrgDepartmentChecks,
  type OrgFocusDepartment,
} from "./exclude-org-departments";

const people: { id: string; department_names: string[]; department?: string | null }[] = [
  { id: "ops", department_names: ["Operations"], department: "Operations" },
  { id: "operation", department_names: ["operation"] },
  { id: "maint", department_names: ["Maintenance"] },
  { id: "typo", department_names: ["maintenace"] },
  { id: "cafe", department_names: ["F&B Cafe"] },
  { id: "fb", department_names: ["F&B"] },
  { id: "fnb", department_names: ["FnB Cafe"] },
  { id: "crew", department_names: ["Crew / Attendant"] },
  { id: "manager", department_names: ["F&B Manager"] },
  { id: "barista", department_names: ["Barista"] },
  { id: "chef", department_names: ["Chef"] },
  { id: "fec-ops", department_names: ["FEC Operations"] },
  { id: "blank", department_names: [], department: null },
  { id: "both", department_names: ["Crew / Attendant", "Operations"], department: "Crew / Attendant" },
];

function shown(showOnly: readonly OrgFocusDepartment[]) {
  return people.filter((person) => staffMatchesOrgShowOnly(person, showOnly)).map((person) => person.id);
}

describe("org focus department names", () => {
  it("matches operations, maintenance, and f&b cafe including close labels", () => {
    expect(orgFocusDepartmentOfName("Operations")).toBe("operations");
    expect(orgFocusDepartmentOfName("operation")).toBe("operations");
    expect(orgFocusDepartmentOfName("Maintenance")).toBe("maintenance");
    expect(orgFocusDepartmentOfName("maintenace")).toBe("maintenance");
    expect(orgFocusDepartmentOfName("F&B Cafe")).toBe("fb_cafe");
    expect(orgFocusDepartmentOfName("F&B")).toBe("fb_cafe");
    expect(orgFocusDepartmentOfName("FnB Cafe")).toBe("fb_cafe");
    expect(orgFocusDepartmentOfName("F and B Cafe")).toBe("fb_cafe");
    expect(orgFocusDepartmentOfName("OPS")).toBe("operations");
    expect(orgFocusDepartmentOfName("FB_CAFE")).toBe("fb_cafe");
  });

  it("does not treat lookalikes as F&B Cafe, Operations, or Maintenance", () => {
    expect(orgFocusDepartmentOfName("Crew / Attendant")).toBeNull();
    expect(orgFocusDepartmentOfName("Barista")).toBeNull();
    expect(orgFocusDepartmentOfName("Chef")).toBeNull();
    expect(orgFocusDepartmentOfName("Food")).toBeNull();
    expect(orgFocusDepartmentOfName("FEC Operations")).toBeNull();
    expect(orgFocusDepartmentOfName("Site Operations")).toBeNull();
    expect(orgFocusDepartmentOfName("F&B Operations")).toBeNull();
    expect(orgFocusDepartmentOfName("F&B Manager")).toBeNull();
    expect(orgFocusDepartmentOfName("F&B Cashier")).toBeNull();
    expect(orgFocusDepartmentOfName("Maintenance Assistant / Electrician")).toBeNull();
    expect(orgFocusDepartmentOfName("Cashier")).toBeNull();
  });
});

describe("show only when a department is unchecked", () => {
  it("shows everyone while all three stay checked", () => {
    expect(activeShowOnlyOrgDepartments(ALL_ORG_DEPARTMENTS_CHECKED, "")).toEqual([]);
    expect(activeShowOnlyOrgDepartments(ALL_ORG_DEPARTMENTS_CHECKED, "all")).toEqual([]);
    expect(activeShowOnlyOrgDepartments(ALL_ORG_DEPARTMENTS_CHECKED, [])).toEqual([]);
    expect(shown([])).toEqual(people.map((person) => person.id));
    expect(displayDepartmentShown("Battle Arena", [])).toBe(true);
    expect(displayDepartmentShown(null, [])).toBe(true);
    expect(recordMatchesOrgShowOnly({ note: "stub" }, [])).toBe(true);
  });

  it("shows only Operations when Operations is unchecked", () => {
    const checks: OrgDepartmentChecks = { ...ALL_ORG_DEPARTMENTS_CHECKED, operations: false };
    expect(activeShowOnlyOrgDepartments(checks, "")).toEqual(["operations"]);
    expect(shown(["operations"])).toEqual(["ops", "operation", "both"]);
    expect(displayDepartmentShown("Operations", ["operations"])).toBe(true);
    expect(displayDepartmentShown("F&B Cafe", ["operations"])).toBe(false);
    expect(displayDepartmentShown("F&B Manager", ["operations"])).toBe(false);
    expect(staffMatchesOrgShowOnly({ department: null, department_names: [] }, ["operations"])).toBe(false);
  });

  it("shows only the unchecked departments when two are unchecked", () => {
    const checks: OrgDepartmentChecks = {
      operations: false,
      maintenance: false,
      fb_cafe: true,
    };
    expect(activeShowOnlyOrgDepartments(checks, "all")).toEqual(["operations", "maintenance"]);
    expect(shown(["operations", "maintenance"])).toEqual(["ops", "operation", "maint", "typo", "both"]);
    expect(displayDepartmentShown("F&B Cafe + Maintenance", ["operations", "maintenance"])).toBe(true);
    expect(displayDepartmentShown("F&B Cafe", ["operations", "maintenance"])).toBe(false);
    expect(displayDepartmentShown("F&B", ["operations", "maintenance"])).toBe(false);
    expect(staffMatchesOrgShowOnly({ department_names: ["F&B Manager"] }, ["operations", "maintenance"])).toBe(false);
  });

  it("does not treat F&B Manager as F&B Cafe", () => {
    expect(shown(["fb_cafe"])).toEqual(["cafe", "fb", "fnb"]);
    expect(staffMatchesOrgShowOnly({ department_names: ["F&B Manager"] }, ["fb_cafe"])).toBe(false);
    expect(staffMatchesOrgShowOnly({ department: "Barista" }, ["fb_cafe"])).toBe(false);
    expect(staffMatchesOrgShowOnly({ department: "Chef" }, ["fb_cafe"])).toBe(false);
    expect(displayDepartmentShown("F&B Manager", ["fb_cafe"])).toBe(false);
    expect(displayDepartmentShown("F&B Cafe", ["fb_cafe"])).toBe(true);
  });

  it("clears the restriction when every box is checked again and yields to a chosen department", () => {
    const narrowed: OrgDepartmentChecks = { ...ALL_ORG_DEPARTMENTS_CHECKED, fb_cafe: false };
    expect(activeShowOnlyOrgDepartments(narrowed, "")).toEqual(["fb_cafe"]);
    expect(activeShowOnlyOrgDepartments(ALL_ORG_DEPARTMENTS_CHECKED, "")).toEqual([]);
    expect(activeShowOnlyOrgDepartments(narrowed, "ops-id")).toEqual([]);
    expect(activeShowOnlyOrgDepartments(narrowed, ["crew-id"])).toEqual([]);
  });

  it("resolves stored department ids and report rows for the unchecked set", () => {
    const departments = [
      { id: "ops", name: "Operations", code: "OPS" },
      { id: "maint", name: "Maintenance", code: "MAINT" },
      { id: "cafe", name: "F&B Cafe", code: "FB_CAFE" },
      { id: "fb", name: "F&B", code: "FB" },
      { id: "crew", name: "Crew / Attendant", code: "CREW" },
      { id: "fec-ops", name: "FEC Operations", code: "FEC_OPS" },
      { id: "manager", name: "F&B Manager", code: "FB_MGR" },
    ];
    expect(orgDepartmentIdsFor(departments, [])).toEqual([]);
    expect(orgDepartmentIdsFor(departments, ["operations"])).toEqual(["ops"]);
    expect(orgDepartmentIdsFor(departments, ["operations", "maintenance"])).toEqual(["ops", "maint"]);
    expect(orgDepartmentIdsFor(departments, ["fb_cafe"])).toEqual(["cafe", "fb"]);

    expect(recordMatchesOrgShowOnly({ department: "Maintenance" }, ["maintenance"])).toBe(true);
    expect(recordMatchesOrgShowOnly({ department: "F&B Manager" }, ["fb_cafe"])).toBe(false);
    expect(recordMatchesOrgShowOnly({ scope: "Inflatapark" }, ["operations"])).toBe(false);
    expect(recordMatchesOrgShowOnly({ note: "stub" }, ["operations"])).toBe(false);
  });
});
