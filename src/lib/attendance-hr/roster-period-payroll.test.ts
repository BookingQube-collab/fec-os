import { describe, expect, it } from "vitest";

import { defaultPayrollPeriod, monthBounds, payrollMonthOf } from "./roster-period";

describe("payroll FEC 28–27 period", () => {
  it("uses the 28th of the previous month through the 27th of the named month", () => {
    expect(monthBounds("2026-08")).toEqual({ dateFrom: "2026-07-28", dateTo: "2026-08-27" });
    expect(monthBounds("2026-01")).toEqual({ dateFrom: "2025-12-28", dateTo: "2026-01-27" });
  });

  it("assigns the 28th onward to the next payroll month", () => {
    expect(payrollMonthOf("2026-08-27")).toBe("2026-08");
    expect(payrollMonthOf("2026-08-28")).toBe("2026-09");
  });

  it("defaults the live payroll run to the current FEC month", () => {
    expect(defaultPayrollPeriod("2026-08-28")).toEqual({
      month: "2026-09",
      dateFrom: "2026-08-28",
      dateTo: "2026-09-27",
    });
  });
});
