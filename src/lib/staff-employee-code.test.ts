import { describe, expect, it } from "vitest";

import {
  assertInternalEmployeeCode,
  generateEmployeeCode,
  isPreservableEmployeeCode,
  isQidShapedCode,
  roleTokenKind,
} from "./staff-employee-code";

describe("isQidShapedCode", () => {
  it("accepts 8–11 digit Qatar IDs and rejects venue codes", () => {
    expect(isQidShapedCode("29160813855")).toBe(true);
    expect(isQidShapedCode("29248485361")).toBe(true);
    expect(isQidShapedCode("12345678")).toBe(true);
    expect(isQidShapedCode("INF-CC-BM")).toBe(false);
    expect(isQidShapedCode("INF-CC-STF03")).toBe(false);
    expect(isQidShapedCode("KDS-CC-TEMP-01")).toBe(false);
  });
});

describe("generateEmployeeCode", () => {
  it("uses BM then VS then BM2 for venue supervisors", () => {
    const used = new Set<string>(["INF-CC-BM"]);
    expect(generateEmployeeCode("INF-CC", used, { staffRole: "venue_supervisor" })).toBe("INF-CC-VS");
    expect(generateEmployeeCode("INF-CC", used, { jobTitle: "Branch Manager" })).toBe("INF-CC-BM2");
  });

  it("uses CSH / TEC / STF sequences and stays unique globally", () => {
    const used = new Set<string>(["KDS-CC-CSH", "INF-CC-STF03"]);
    expect(generateEmployeeCode("KDS-CC", used, { staffRole: "cashier" })).toBe("KDS-CC-CSH01");
    expect(generateEmployeeCode("WM-VM", used, { staffRole: "technician" })).toBe("WM-VM-TEC");
    expect(generateEmployeeCode("INF-CC", used, { staffRole: "crew" })).toBe("INF-CC-STF01");
    expect(generateEmployeeCode("INF-CC", used, { staffRole: "crew" })).toBe("INF-CC-STF02");
    expect(generateEmployeeCode("INF-CC", used, { staffRole: "crew" })).toBe("INF-CC-STF04");
  });

  it("never emits a QID-shaped value", () => {
    const used = new Set<string>(["29160813855"]);
    const code = generateEmployeeCode("INF-CC", used, { staffRole: "crew" });
    expect(isQidShapedCode(code)).toBe(false);
    expect(code).toBe("INF-CC-STF01");
  });
});

describe("assertInternalEmployeeCode", () => {
  it("rejects QID-shaped codes and QID copies", () => {
    expect(() => assertInternalEmployeeCode("29160813855")).toThrow(/not a QID/i);
    expect(() => assertInternalEmployeeCode("INF-CC-BM", "INF-CC-BM")).toThrow(/same as QID/i);
    expect(assertInternalEmployeeCode("inf-cc-stf03")).toBe("INF-CC-STF03");
  });
});

describe("isPreservableEmployeeCode", () => {
  it("keeps venue codes and drops numeric / QID copies", () => {
    expect(isPreservableEmployeeCode("INF-CC-BM")).toBe(true);
    expect(isPreservableEmployeeCode("INF-CC-STF03")).toBe(true);
    expect(isPreservableEmployeeCode("29160813855")).toBe(false);
    expect(isPreservableEmployeeCode("29160813855", "29160813855")).toBe(false);
    expect(isPreservableEmployeeCode(null)).toBe(false);
  });
});

describe("roleTokenKind", () => {
  it("maps supervisor / cashier / technician / default", () => {
    expect(roleTokenKind({ staffRole: "venue_supervisor" })).toBe("BM");
    expect(roleTokenKind({ jobTitle: "Cashier" })).toBe("CSH");
    expect(roleTokenKind({ staffRole: "technician" })).toBe("TEC");
    expect(roleTokenKind({ staffRole: "crew" })).toBe("STF");
  });
});
