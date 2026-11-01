import { describe, expect, it } from "vitest";

import {
  CANONICAL_OPERATIONS_LABEL,
  canonicalDepartmentDisplayName,
  dedupeDepartmentOptionsByAlias,
  departmentAggregateKey,
  departmentLabelsMatch,
  departmentMatchKeys,
  expandDepartmentAliasIds,
  formatCanonicalDepartmentDisplay,
  isAliasedDepartmentLabel,
  isOperationsDepartmentLabel,
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
    expect(departmentLabelsMatch("fec operation", "Operations")).toBe(true);
    expect(departmentLabelsMatch("fec op", "Operations")).toBe(true);
    expect(departmentLabelsMatch("Operations", "Site Operations")).toBe(false);
    expect(departmentLabelsMatch("Operations", "Maintenance")).toBe(false);
  });

  it("displays every Operations alias as Operations", () => {
    expect(canonicalDepartmentDisplayName("fec operation")).toBe(CANONICAL_OPERATIONS_LABEL);
    expect(canonicalDepartmentDisplayName("FEC Operations")).toBe(CANONICAL_OPERATIONS_LABEL);
    expect(canonicalDepartmentDisplayName("fec ops")).toBe(CANONICAL_OPERATIONS_LABEL);
    expect(canonicalDepartmentDisplayName("Maintenance")).toBe("Maintenance");
    expect(isOperationsDepartmentLabel("fec op")).toBe(true);
    expect(departmentAggregateKey("fec operation", "x")).toBe("operations");
    expect(departmentAggregateKey("Maintenance", "m1")).toBe("maintenance");
    expect(formatCanonicalDepartmentDisplay(["fec operation", "Operations", "Maintenance"])).toBe(
      "Operations, Maintenance",
    );
    expect(formatCanonicalDepartmentDisplay([], "fec ops")).toBe("Operations");
  });

  it("dedupes Operations filter options to a single Operations row", () => {
    const catalog = [
      { id: "fec-ops", name: "FEC Operations", code: "FEC_OPS" },
      { id: "ho-ops", name: "Operations", code: "OPS" },
      { id: "maint", name: "Maintenance", code: "MAINT" },
    ];
    expect(dedupeDepartmentOptionsByAlias(catalog)).toEqual([
      { id: "ho-ops", name: "Operations", code: "OPS" },
      { id: "maint", name: "Maintenance", code: "MAINT" },
    ]);
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
