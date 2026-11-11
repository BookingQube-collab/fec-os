import { describe, expect, it } from "vitest";

import { isEventHireEmployeeCode } from "@/lib/events/event-hire-employee-code";
import {
  excludeEventWorkforceFromMonthlyModules,
  isEventWorkforceDemoDepartment,
  isEventWorkforceStaff,
} from "@/lib/events/event-workforce-staff";

describe("isEventHireEmployeeCode", () => {
  it("matches EVT-* hire / demo codes only", () => {
    expect(isEventHireEmployeeCode("EVT-CRW01")).toBe(true);
    expect(isEventHireEmployeeCode("evt-ibr22")).toBe(true);
    expect(isEventHireEmployeeCode(" EVT-LBR40 ")).toBe(true);
    expect(isEventHireEmployeeCode("UA-DM-CSH01")).toBe(false);
    expect(isEventHireEmployeeCode("HO-STF01")).toBe(false);
    expect(isEventHireEmployeeCode(null)).toBe(false);
    expect(isEventHireEmployeeCode("")).toBe(false);
  });
});

describe("isEventWorkforceStaff", () => {
  it("detects EVT codes, Event demo department, and Place Vendôme home", () => {
    expect(isEventWorkforceStaff({ employee_code: "EVT-CRW01" })).toBe(true);
    expect(isEventWorkforceStaff({ employeeCode: "EVT-IBR22" })).toBe(true);
    expect(isEventWorkforceStaff({ department: "Event demo" })).toBe(true);
    expect(isEventWorkforceStaff({ department: "event  demo" })).toBe(true);
    expect(isEventWorkforceStaff({ location_code: "PLACE-VEDOME-MALL" })).toBe(true);
    expect(isEventWorkforceStaff({ locationCode: "place-vedome-mall" })).toBe(true);
  });

  it("keeps Ops / F&B / Head Office venue staff", () => {
    expect(
      isEventWorkforceStaff({
        employee_code: "UA-DM-CSH01",
        department: "Operations",
        location_code: "UA-DM",
      }),
    ).toBe(false);
    expect(
      isEventWorkforceStaff({
        employee_code: "HO-STF01",
        department: "Human Resources",
        location_code: "HO",
      }),
    ).toBe(false);
    expect(
      isEventWorkforceStaff({
        employee_code: "CB-DSM-STF01",
        department: "F&B Cafe",
        location_code: "CB-DSM",
      }),
    ).toBe(false);
    expect(isEventWorkforceDemoDepartment("Operations")).toBe(false);
    expect(isEventWorkforceDemoDepartment("Crew / Attendant")).toBe(false);
  });

  it("filters monthly collections without touching non-event rows", () => {
    const rows = [
      { id: "e1", employee_code: "EVT-CRW01", department: "Event demo" },
      { id: "ops", employee_code: "INF-CC-STF01", department: "Operations" },
      { id: "ho", employeeCode: "HO-STF02", department: "Finance", locationCode: "HO" },
    ];
    expect(
      excludeEventWorkforceFromMonthlyModules(rows, (row) => row).map((row) => row.id),
    ).toEqual(["ops", "ho"]);
  });
});
