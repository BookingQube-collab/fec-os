import { describe, expect, it } from "vitest";

import { parseDepartmentHierarchyLabel } from "./staff-departments";

describe("parseDepartmentHierarchyLabel", () => {
  it("keeps plain department names as top-level", () => {
    expect(parseDepartmentHierarchyLabel("Finance")).toEqual({
      parentName: null,
      name: "Finance",
    });
    expect(parseDepartmentHierarchyLabel("Design/Creative")).toEqual({
      parentName: null,
      name: "Design/Creative",
    });
  });

  it("parses spaced Parent / Child as hierarchy", () => {
    expect(parseDepartmentHierarchyLabel("Operations / IT")).toEqual({
      parentName: "Operations",
      name: "IT",
    });
  });

  it("returns null for blank", () => {
    expect(parseDepartmentHierarchyLabel("")).toBeNull();
    expect(parseDepartmentHierarchyLabel(null)).toBeNull();
  });
});
