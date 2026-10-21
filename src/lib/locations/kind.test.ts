import { describe, expect, it } from "vitest";

import {
  isBranchLocationKind,
  isGeoPunchLocationKind,
  normalizeLocationKind,
  WAREHOUSE_LOCATION_CODE,
} from "./kind";

describe("location kind", () => {
  it("defaults unknown values to branch", () => {
    expect(normalizeLocationKind(null)).toBe("branch");
    expect(normalizeLocationKind("branch")).toBe("branch");
    expect(normalizeLocationKind("warehouse")).toBe("warehouse");
    expect(normalizeLocationKind("other")).toBe("branch");
  });

  it("keeps warehouses out of branch pickers but in geo punch lists", () => {
    expect(isBranchLocationKind("branch")).toBe(true);
    expect(isBranchLocationKind("warehouse")).toBe(false);
    expect(isGeoPunchLocationKind("warehouse")).toBe(true);
    expect(isGeoPunchLocationKind("branch")).toBe(true);
    expect(WAREHOUSE_LOCATION_CODE).toBe("WHSE");
  });
});
