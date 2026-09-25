import { describe, expect, it } from "vitest";

import {
  aggregatePayrollRows,
  formatPayrollBlockReasons,
  isPayrollBlockingDay,
  isPayrollReady,
  payrollBlockReasonCode,
} from "./payroll";

describe("payroll readiness", () => {
  it("blocks missed punch and review days", () => {
    expect(isPayrollBlockingDay({ status: "present", missed_punch: false })).toBe(false);
    expect(isPayrollBlockingDay({ status: "present", missed_punch: true })).toBe(true);
    expect(isPayrollBlockingDay({ status: "review_required" })).toBe(true);
    expect(payrollBlockReasonCode({ status: "present", missed_punch: true })).toBe("missed_punch");
    expect(payrollBlockReasonCode({ status: "review_required" })).toBe("review_required");
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
      blockReasons: [],
      blockDays: [],
    });
    expect(isPayrollReady(rows[0])).toBe(true);
  });

  it("marks a missed punch as not payroll-ready but still present for day-rate pay", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "b",
        staff_name: "Bilal",
        work_date: "2026-08-03",
        status: "missed_punch",
        missed_punch: true,
        worked_minutes: 240,
      },
    ]);
    expect(row.daysPresent).toBe(1);
    expect(row.payrollReady).toBe(false);
    expect(row.missedPunches).toBe(1);
    expect(row.blockReasons).toEqual([{ code: "missed_punch", count: 1 }]);
    expect(row.blockDays).toEqual([{ workDate: "2026-08-03", code: "missed_punch" }]);
    expect(formatPayrollBlockReasons(row.blockReasons)).toEqual(["Missed punch"]);
  });

  it("counts short_hours as present while still blocking payroll", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "c",
        staff_name: "Carla",
        work_date: "2026-08-01",
        status: "short_hours",
        worked_minutes: 360,
        overtime_minutes: 0,
      },
      {
        staff_id: "c",
        staff_name: "Carla",
        work_date: "2026-08-02",
        status: "present",
        worked_minutes: 480,
        overtime_minutes: 30,
      },
    ]);
    expect(row.daysPresent).toBe(2);
    expect(row.overtimeMinutes).toBe(30);
    expect(row.payrollReady).toBe(false);
    expect(row.blockingDays).toBe(1);
    expect(row.blockReasons).toEqual([{ code: "short_hours", count: 1 }]);
    expect(formatPayrollBlockReasons(row.blockReasons)).toEqual(["Undertime (short hours)"]);
  });

  it("tallies mixed block reasons without dropping codes", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "d",
        staff_name: "Dana",
        work_date: "2026-08-10",
        status: "incomplete",
        worked_minutes: 120,
      },
      {
        staff_id: "d",
        staff_name: "Dana",
        work_date: "2026-08-11",
        status: "review_required",
        worked_minutes: 0,
      },
      {
        staff_id: "d",
        staff_name: "Dana",
        work_date: "2026-08-12",
        status: "present",
        missed_punch: true,
        worked_minutes: 400,
      },
    ]);
    expect(row.payrollReady).toBe(false);
    expect(row.blockReasons).toEqual([
      { code: "incomplete", count: 1 },
      { code: "missed_punch", count: 1 },
      { code: "review_required", count: 1 },
    ]);
    expect(formatPayrollBlockReasons(row.blockReasons)).toEqual([
      "Incomplete attendance",
      "Missed punch",
      "Review required",
    ]);
  });

  it("collapses multisite ABSENT fillers so Present matches listing", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "osman",
        staff_name: "Abdallah Osman",
        employee_code: "UA-DM-CSH01",
        work_date: "2026-09-01",
        status: "absent",
        punch_count: 0,
        worked_minutes: 0,
      },
      {
        staff_id: "osman",
        staff_name: "Abdallah Osman",
        employee_code: "UA-DM-CSH01",
        work_date: "2026-09-01",
        status: "present",
        punch_count: 2,
        worked_minutes: 480,
      },
      {
        staff_id: "osman",
        staff_name: "Abdallah Osman",
        employee_code: "UA-DM-CSH01",
        work_date: "2026-09-02",
        status: "late",
        late_minutes: 10,
        punch_count: 2,
        worked_minutes: 470,
      },
    ]);
    expect(row.daysPresent).toBe(2);
    expect(row.daysAbsent).toBe(0);
    expect(row.payrollReady).toBe(true);
  });

  it("counts unpaid_leave days separately from absences", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "u",
        staff_name: "Uma",
        work_date: "2026-08-01",
        status: "absent",
      },
      {
        staff_id: "u",
        staff_name: "Uma",
        work_date: "2026-08-02",
        status: "unpaid_leave",
      },
      {
        staff_id: "u",
        staff_name: "Uma",
        work_date: "2026-08-03",
        status: "present",
        punch_count: 2,
        worked_minutes: 480,
      },
    ]);
    expect(row.daysAbsent).toBe(1);
    expect(row.daysUnpaidLeave).toBe(1);
    expect(row.daysPresent).toBe(1);
  });

  it("does not double-count the same staff day across locations", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "a",
        staff_name: "A",
        work_date: "2026-09-10",
        status: "present",
        punch_count: 2,
        worked_minutes: 400,
      },
      {
        staff_id: "a",
        staff_name: "A",
        work_date: "2026-09-10",
        status: "present",
        punch_count: 2,
        worked_minutes: 420,
      },
    ]);
    expect(row.daysPresent).toBe(1);
  });
});
