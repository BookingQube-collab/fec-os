import { describe, expect, it } from "vitest";

import { aggregatePayrollRows, isPayrollBlockingDay, isPayrollReady } from "./payroll";

describe("payroll readiness", () => {
  it("blocks missed punch and review days", () => {
    expect(isPayrollBlockingDay({ status: "present", missed_punch: false })).toBe(false);
    expect(isPayrollBlockingDay({ status: "present", missed_punch: true })).toBe(true);
    expect(isPayrollBlockingDay({ status: "review_required" })).toBe(true);
  });

  it("aggregates a mapped employee for payroll export", () => {
    const rows = aggregatePayrollRows([
      {
        staff_id: "a",
        staff_name: "Aisha",
        employee_code: "E3-1",
        status: "present",
        worked_minutes: 480,
        overtime_minutes: 0,
      },
      {
        staff_id: "a",
        staff_name: "Aisha",
        employee_code: "E3-1",
        status: "late",
        late_minutes: 12,
        worked_minutes: 470,
        overtime_minutes: 0,
      },
      { staff_id: null, status: "present", worked_minutes: 480 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      staffName: "Aisha",
      daysPresent: 2,
      daysLate: 1,
      workedMinutes: 950,
      payrollReady: true,
    });
    expect(isPayrollReady(rows[0])).toBe(true);
  });

  it("marks a missed punch as not payroll-ready", () => {
    const [row] = aggregatePayrollRows([
      { staff_id: "b", staff_name: "Bilal", status: "missed_punch", missed_punch: true, worked_minutes: 240 },
    ]);
    expect(row.payrollReady).toBe(false);
    expect(row.missedPunches).toBe(1);
  });
});
