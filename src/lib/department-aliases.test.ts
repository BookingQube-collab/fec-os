import { describe, expect, it } from "vitest";

import {
  departmentLabelsMatch,
  departmentMatchKeys,
  expandDepartmentAliasIds,
  isAliasedDepartmentLabel,
  normalizeDepartmentMatchKey,
} from "./department-aliases";

describe("department aliases", () => {
  it("normalizes underscores and spaces for match keys", () => {
    expect(normalizeDepartmentMatchKey("FEC Operations")).toBe("fec operations");
    expect(normalizeDepartmentMatchKey("FEC_OPS")).toBe("fec ops");
    expect(normalizeDepartmentMatchKey("  Operations ")).toBe("operations");
  });

  it("treats Operations and FEC Operations as the same team", () => {
    expect(departmentLabelsMatch("Operations", "FEC Operations")).toBe(true);
    expect(departmentLabelsMatch("FEC Operations", "Operations")).toBe(true);
    expect(departmentLabelsMatch("OPS", "FEC_OPS")).toBe(true);
    expect(departmentLabelsMatch("Operations", "Site Operations")).toBe(false);
    expect(departmentLabelsMatch("Operations", "Maintenance")).toBe(false);
  });

  it("expands catalog ids across the Operations alias group", () => {
    const catalog = [
      { id: "ho-ops", name: "Operations", code: "OPS" },
      { id: "fec-ops", name: "FEC Operations", code: "FEC_OPS" },
      { id: "maint", name: "Maintenance", code: "MAINT" },
    ];
    expect(expandDepartmentAliasIds(catalog[0], catalog).sort()).toEqual(["fec-ops", "ho-ops"]);
    expect(expandDepartmentAliasIds(catalog[1], catalog).sort()).toEqual(["fec-ops", "ho-ops"]);
    expect(expandDepartmentAliasIds(catalog[2], catalog)).toEqual(["maint"]);
    expect(isAliasedDepartmentLabel("Operations")).toBe(true);
    expect(isAliasedDepartmentLabel("Maintenance")).toBe(false);
    expect(departmentMatchKeys("FEC Operations").has("operations")).toBe(true);
  });
});
