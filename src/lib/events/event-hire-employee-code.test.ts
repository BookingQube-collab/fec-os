import { describe, expect, it } from "vitest";

import {
  eventRoleCodeToken,
  generateEventHireEmployeeCode,
  isEventHireEmployeeCode,
  previewEventHireEmployeeCode,
} from "@/lib/events/event-hire-employee-code";

describe("isEventHireEmployeeCode", () => {
  it("recognizes EVT-* workforce codes", () => {
    expect(isEventHireEmployeeCode("EVT-CRW01")).toBe(true);
    expect(isEventHireEmployeeCode("evt-csh01")).toBe(true);
    expect(isEventHireEmployeeCode("UA-DM-CSH01")).toBe(false);
  });
});

describe("eventRoleCodeToken", () => {
  it("maps known event roles to demo-compatible tokens", () => {
    expect(eventRoleCodeToken("crew")).toBe("CRW");
    expect(eventRoleCodeToken("cashier")).toBe("CSH");
    expect(eventRoleCodeToken("labour")).toBe("LBR");
    expect(eventRoleCodeToken("cleaner")).toBe("CLN");
    expect(eventRoleCodeToken("maintenance")).toBe("MNT");
    expect(eventRoleCodeToken("management")).toBe("MGT");
  });

  it("abbreviates custom role codes", () => {
    expect(eventRoleCodeToken("usher")).toBe("USH");
    expect(eventRoleCodeToken("custom_role")).toBe("CUS");
  });
});

describe("generateEventHireEmployeeCode", () => {
  it("allocates unique EVT-{token}{nn} codes", () => {
    const used = new Set<string>(["EVT-CRW01"]);
    expect(generateEventHireEmployeeCode("crew", used)).toBe("EVT-CRW02");
    expect(generateEventHireEmployeeCode("crew", used)).toBe("EVT-CRW03");
    expect(generateEventHireEmployeeCode("cashier", used)).toBe("EVT-CSH01");
    expect(used.has("EVT-CRW02")).toBe(true);
  });
});

describe("previewEventHireEmployeeCode", () => {
  it("does not mutate the existing list", () => {
    const existing = ["EVT-LBR01"];
    expect(previewEventHireEmployeeCode("labour", existing)).toBe("EVT-LBR02");
    expect(existing).toEqual(["EVT-LBR01"]);
  });
});
