import { describe, expect, it } from "vitest";

import { resolveEarnedBasicQar } from "@/lib/hr-payroll";

import {
  aggregatePayrollRows,
  countListingWorkedDays,
  countPayrollPaidDays,
  formatPayrollBlockReasons,
  isPayrollBlockingDay,
  isPayrollPaidDay,
  isPayrollReady,
  listPayrollPaidDates,
  payrollBlockReasonCode,
} from "./payroll";

describe("payroll readiness", () => {
  it("blocks incomplete punches and status-only review gaps; ignores stale flags when In/Out exist", () => {
    expect(isPayrollBlockingDay({ status: "present", missed_punch: false })).toBe(false);
    expect(isPayrollBlockingDay({ status: "present", missed_punch: true })).toBe(true);
    expect(isPayrollBlockingDay({ status: "review_required" })).toBe(true);
    expect(payrollBlockReasonCode({ status: "present", missed_punch: true })).toBe("missed_punch");
    expect(payrollBlockReasonCode({ status: "review_required" })).toBe("review_required");
    // Stale missed_punch / review_required with a complete pair must not block Ready.
    expect(
      isPayrollBlockingDay({
        status: "review_required",
        missed_punch: true,
        actual_in: "2026-09-30T07:25:13.000Z",
        actual_out: "2026-09-30T17:41:21.000Z",
      }),
    ).toBe(false);
    expect(
      payrollBlockReasonCode({
        status: "missed_punch",
        missed_punch: true,
        actual_in: "2026-09-30T07:25:13.000Z",
        actual_out: "2026-09-30T17:41:21.000Z",
      }),
    ).toBe(null);
    expect(
      payrollBlockReasonCode({
        status: "present",
        missed_punch: false,
        actual_in: "2026-09-30T07:25:13.000Z",
        actual_out: null,
      }),
    ).toBe("missed_punch");
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

  it("marks a checked-in missed punch as not payroll-ready but still a listing worked day", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "b",
        staff_name: "Bilal",
        work_date: "2026-08-03",
        status: "missed_punch",
        missed_punch: true,
        actual_in: "2026-08-03T04:00:00.000Z",
        actual_out: null,
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

  it("counts short_hours as present and does not block payroll (manual payslip fix only)", () => {
    expect(isPayrollBlockingDay({ status: "short_hours" })).toBe(false);
    expect(payrollBlockReasonCode({ status: "short_hours" })).toBe(null);
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
    expect(row.payrollReady).toBe(true);
    expect(row.blockingDays).toBe(0);
    expect(row.blockReasons).toEqual([]);
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

  it("marks complete punches with review_required Ready (Abigial-style listing day)", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "abigial",
        staff_name: "Abigial Danso kumi",
        employee_code: "KDS-CC-STF01",
        work_date: "2026-09-30",
        status: "review_required",
        missed_punch: true,
        actual_in: "2026-09-30T07:25:13.000Z",
        actual_out: "2026-09-30T17:41:21.000Z",
        worked_minutes: 616,
        overtime_minutes: 41,
        punch_count: 2,
      },
    ]);
    expect(row.daysPresent).toBe(1);
    expect(row.payrollReady).toBe(true);
    expect(row.blockingDays).toBe(0);
    expect(row.missedPunches).toBe(0);
    expect(row.blockReasons).toEqual([]);
    expect(row.blockDays).toEqual([]);
  });

  it("still blocks true one-sided punches as Missed punch, not Review required", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "e",
        staff_name: "Eve",
        work_date: "2026-09-30",
        status: "review_required",
        missed_punch: true,
        actual_in: "2026-09-30T07:25:13.000Z",
        actual_out: null,
        punch_count: 1,
      },
    ]);
    expect(row.payrollReady).toBe(false);
    expect(row.blockReasons).toEqual([{ code: "missed_punch", count: 1 }]);
    expect(formatPayrollBlockReasons(row.blockReasons)).toEqual(["Missed punch"]);
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
      {
        staff_id: "u",
        staff_name: "Uma",
        work_date: "2026-08-04",
        status: "annual_leave",
      },
      {
        staff_id: "u",
        staff_name: "Uma",
        work_date: "2026-08-05",
        status: "sick_leave",
      },
    ]);
    expect(row.daysAbsent).toBe(1);
    expect(row.daysUnpaidLeave).toBe(1);
    expect(row.daysLeave).toBe(3);
    // Present + annual leave + sick leave are paid; unpaid leave / absent are not.
    expect(row.daysPresent).toBe(3);
    expect(row.submittedOtMinutes).toBe(0);
  });

  it("treats weekly off and annual leave as paid entitlement days", () => {
    const days = [
      {
        staff_id: "jolina",
        staff_name: "Jolina",
        work_date: "2026-10-12",
        status: "present",
        actual_in: "2026-10-12T09:10:00.000Z",
        actual_out: "2026-10-12T19:00:00.000Z",
        punch_count: 2,
        worked_minutes: 530,
      },
      {
        staff_id: "jolina",
        staff_name: "Jolina",
        work_date: "2026-10-14",
        status: "weekly_off",
      },
      {
        staff_id: "jolina",
        staff_name: "Jolina",
        work_date: "2026-10-15",
        status: "annual_leave",
      },
      {
        staff_id: "jolina",
        staff_name: "Jolina",
        work_date: "2026-10-16",
        status: "unpaid_leave",
      },
      {
        staff_id: "jolina",
        staff_name: "Jolina",
        work_date: "2026-10-17",
        status: "absent",
      },
    ];
    expect(isPayrollPaidDay(days[0]!)).toBe(true);
    expect(isPayrollPaidDay(days[1]!)).toBe(true);
    expect(isPayrollPaidDay(days[2]!)).toBe(true);
    expect(isPayrollPaidDay(days[3]!)).toBe(false);
    expect(isPayrollPaidDay(days[4]!)).toBe(false);
    expect(countListingWorkedDays(days, "jolina")).toBe(1);
    expect(countPayrollPaidDays(days, "jolina")).toBe(3);
    expect(listPayrollPaidDates(days, "jolina")).toEqual([
      "2026-10-12",
      "2026-10-14",
      "2026-10-15",
    ]);
    const [row] = aggregatePayrollRows(days);
    expect(row.daysPresent).toBe(3);
    expect(row.daysLeave).toBe(2);
    expect(row.daysUnpaidLeave).toBe(1);
    expect(row.daysAbsent).toBe(1);
    const periodDays = 30;
    const earned = resolveEarnedBasicQar({
      dailyPay: false,
      contractBasicQar: 6000,
      dailyRateQar: null,
      workedDays: countPayrollPaidDays(days, "jolina"),
      periodDays,
    });
    expect(earned).toBe(Math.round(((6000 / periodDays) * 3 + Number.EPSILON) * 100) / 100);
  });

  it("pays joker day-rate for week off and annual leave like worked days", () => {
    const paidDays = 18 + 4 + 2; // present + weekly offs + annual leave
    const dayRate = 150;
    expect(
      resolveEarnedBasicQar({
        dailyPay: true,
        contractBasicQar: 0,
        dailyRateQar: dayRate,
        workedDays: paidDays,
        periodDays: 30,
      }),
    ).toBe(Math.round((dayRate * paidDays + Number.EPSILON) * 100) / 100);
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

  it("counts listing worked days, including a stale absent row that has punches", () => {
    const days = [
      {
        staff_id: "s",
        staff_name: "Sara",
        work_date: "2026-09-01",
        status: "absent",
        actual_in: "2026-09-01T05:00:00.000Z",
        actual_out: "2026-09-01T14:00:00.000Z",
        worked_minutes: 540,
        punch_count: 2,
      },
      {
        staff_id: "s",
        staff_name: "Sara",
        work_date: "2026-09-02",
        status: "absent",
        actual_in: null,
        actual_out: null,
        punch_count: 0,
      },
      {
        staff_id: "s",
        staff_name: "Sara",
        work_date: "2026-09-03",
        status: "weekly_off",
      },
      {
        staff_id: "s",
        staff_name: "Sara",
        work_date: "2026-09-04",
        status: "missed_punch",
        missed_punch: true,
      },
    ];
    expect(countListingWorkedDays(days, "s")).toBe(1);
    // Paid days = punched present + weekly off (absent / open missed punch unpaid).
    expect(countPayrollPaidDays(days, "s")).toBe(2);
    const [row] = aggregatePayrollRows(days);
    expect(row.daysPresent).toBe(2);
    const periodDays = 31;
    const earned = resolveEarnedBasicQar({
      dailyPay: false,
      contractBasicQar: 7800,
      dailyRateQar: null,
      workedDays: 10,
      periodDays,
    });
    expect(earned).not.toBe(7800);
    expect(earned).toBe(Math.round(((7800 / periodDays) * 10 + Number.EPSILON) * 100) / 100);
  });

  it("does not count days before hire date as absences", () => {
    const [row] = aggregatePayrollRows([
      {
        staff_id: "sarah",
        staff_name: "Sarah Oxel",
        work_date: "2026-09-16",
        status: "absent",
        hire_date: "2026-09-17",
      },
      {
        staff_id: "sarah",
        staff_name: "Sarah Oxel",
        work_date: "2026-09-10",
        status: "weekly_off",
        hire_date: "2026-09-17",
      },
      {
        staff_id: "sarah",
        staff_name: "Sarah Oxel",
        work_date: "2026-09-17",
        status: "absent",
        hire_date: "2026-09-17",
      },
      {
        staff_id: "sarah",
        staff_name: "Sarah Oxel",
        work_date: "2026-09-18",
        status: "absent",
      },
    ]);
    expect(row.daysAbsent).toBe(2);
  });
});
