import { describe, expect, it } from "vitest";

import { computeAttendanceOvertimeMinutes } from "@/lib/attendance-hr/overtime";

import {
  aggregateOtSummaries,
  assertCanMarkPayrollPosted,
  assertMinClaimableMinutes,
  assertOtTransition,
  canMarkPayrollPosted,
  canTransitionOt,
  computeOtAmountQar,
  hourlyRateFromPay,
  isOtEligible,
  resolveEligibleOtMinutes,
  resolveOtRateMultiplier,
  roundOtMinutes,
} from "./hr-ot";
import { HR_POLICY_DEFAULTS } from "./hr-policy";

describe("OT claim transitions", () => {
  it("lets employee submit draft and cancel submitted", () => {
    expect(canTransitionOt("draft", "submitted", "employee")).toBe(true);
    expect(canTransitionOt("submitted", "cancelled", "employee")).toBe(true);
    expect(canTransitionOt("submitted", "hr_approved", "employee")).toBe(false);
  });

  it("walks manager verify → HR approve → payroll_posted", () => {
    expect(canTransitionOt("submitted", "manager_verified", "manager")).toBe(true);
    expect(canTransitionOt("manager_verified", "hr_approved", "hr")).toBe(true);
    expect(canTransitionOt("hr_approved", "payroll_posted", "hr")).toBe(true);
    expect(canTransitionOt("hr_approved", "payroll_posted", "payroll")).toBe(true);
  });

  it("blocks illegal transitions", () => {
    expect(() => assertOtTransition("payroll_posted", "hr_approved", "hr")).toThrow(/cannot move/);
    expect(() => assertOtTransition("rejected", "submitted", "employee")).toThrow(/cannot move/);
  });
});

describe("AT#3 OT below 1 hour rejected", () => {
  it("rejects minutes below policy minimum after rounding down", () => {
    expect(() => assertMinClaimableMinutes(59, 60, "down")).toThrow(/below minimum/);
    expect(() => assertMinClaimableMinutes(59.9, 60, "down")).toThrow(/below minimum/);
  });

  it("accepts exactly 60 and above", () => {
    expect(assertMinClaimableMinutes(60, 60, "down")).toBe(60);
    expect(assertMinClaimableMinutes(90.7, 60, "down")).toBe(90);
  });

  it("uses policy default min_claimable_minutes of 60", () => {
    expect(HR_POLICY_DEFAULTS.ot.min_claimable_minutes).toBe(60);
  });
});

describe("AT#4 payroll_posted only once", () => {
  it("allows payroll_posted only from hr_approved", () => {
    expect(canMarkPayrollPosted("hr_approved")).toBe(true);
    expect(canMarkPayrollPosted("payroll_posted")).toBe(false);
    expect(canMarkPayrollPosted("manager_verified")).toBe(false);
  });

  it("throws when posting twice or from wrong status", () => {
    expect(() => assertCanMarkPayrollPosted("payroll_posted")).toThrow(/already payroll_posted/);
    expect(() => assertCanMarkPayrollPosted("submitted")).toThrow(/must be hr_approved/);
  });
});

describe("OT rounding and rates", () => {
  it("rounds down/up/minutes", () => {
    expect(roundOtMinutes(90.7, "down")).toBe(90);
    expect(roundOtMinutes(90.1, "up")).toBe(91);
    expect(roundOtMinutes(90.4, "minutes")).toBe(90);
  });

  it("resolves rate multipliers from policy", () => {
    const p = {
      rate_weekday: 1.25,
      rate_weekly_off: 1.5,
      rate_public_holiday: 1.5,
      rate_eid: 2.5,
    };
    expect(resolveOtRateMultiplier("weekday", p)).toBe(1.25);
    expect(resolveOtRateMultiplier("eid", p)).toBe(2.5);
  });

  it("eligibility defaults to secondment category", () => {
    const policy = { eligible_categories: ["secondment"], eligible_staff_ids: [] };
    expect(isOtEligible({ employmentCategory: "secondment", policy })).toBe(true);
    expect(isOtEligible({ employmentCategory: "permanent", policy })).toBe(false);
    expect(
      isOtEligible({
        employmentCategory: "permanent",
        staffId: "s1",
        policy: { ...policy, eligible_staff_ids: ["s1"] },
      }),
    ).toBe(true);
  });
});

describe("OT amount", () => {
  it("computes QAR from hourly × hours × multiplier", () => {
    const hourly = hourlyRateFromPay({ monthlyBasicQar: 4800, hoursPerDay: 8, daysPerMonth: 30 });
    expect(hourly).toBe(20); // 4800/30/8
    expect(
      computeOtAmountQar({ approvedMinutes: 120, rateMultiplier: 1.25, hourlyRateQar: hourly }),
    ).toBe(50);
  });
});

describe("eligible minutes reuse attendance-hr", () => {
  it("prefers stored overtime_minutes over recomputed", () => {
    expect(
      resolveEligibleOtMinutes({
        storedOvertimeMinutes: 75,
        computedOvertimeMinutes: 40,
      }),
    ).toBe(75);
  });

  it("falls back to computeAttendanceOvertimeMinutes output", () => {
    const computed = computeAttendanceOvertimeMinutes({
      workedMinutes: 600,
      scheduledIn: "2026-09-01T09:00:00.000Z",
      scheduledOut: "2026-09-01T18:00:00.000Z",
      actualOut: "2026-09-01T20:00:00.000Z",
    });
    expect(computed).toBe(120);
    expect(resolveEligibleOtMinutes({ computedOvertimeMinutes: computed })).toBe(120);
  });
});

describe("monthly OT summaries", () => {
  it("aggregates by employee and location", () => {
    const rows = [
      {
        staffId: "a",
        staffName: "Ada",
        department: "Ops",
        employmentType: "secondment",
        locationId: "l1",
        locationName: "INF",
        eligibleMinutes: 120,
        approvedMinutes: 120,
        amountQar: 50,
        status: "hr_approved",
      },
      {
        staffId: "a",
        staffName: "Ada",
        department: "Ops",
        employmentType: "secondment",
        locationId: "l1",
        locationName: "INF",
        eligibleMinutes: 60,
        approvedMinutes: 60,
        amountQar: 25,
        status: "payroll_posted",
      },
      {
        staffId: "b",
        staffName: "Bob",
        department: "Ops",
        employmentType: "permanent",
        locationId: "l2",
        locationName: "UA",
        eligibleMinutes: 90,
        approvedMinutes: 0,
        amountQar: 0,
        status: "rejected",
      },
    ];
    const byEmp = aggregateOtSummaries(rows, "employee");
    expect(byEmp).toHaveLength(1);
    expect(byEmp[0].claims).toBe(2);
    expect(byEmp[0].amountQar).toBe(75);

    const byLoc = aggregateOtSummaries(rows, "location");
    expect(byLoc).toHaveLength(1);
    expect(byLoc[0].locationName).toBe("INF");
  });
});
