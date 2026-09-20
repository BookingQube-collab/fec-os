import { describe, expect, it } from "vitest";

import {
  assertLeaveTransition,
  canTransitionLeave,
  countLeaveDays,
  defaultLeaveApprovalSteps,
} from "./hr-leave";
import {
  annualAccrualFromHireDate,
  canUseCompOff,
  compassionateDaysFromPolicy,
  detectLeaveConflicts,
  hasHardLeaveOverlap,
} from "./hr-advanced";
import { HR_POLICY_DEFAULTS } from "./hr-policy";

describe("leave status transitions", () => {
  it("lets an employee cancel a pending request only", () => {
    expect(canTransitionLeave("pending", "cancelled", "employee")).toBe(true);
    expect(canTransitionLeave("pending", "approved", "employee")).toBe(false);
    expect(canTransitionLeave("approved", "cancelled", "employee")).toBe(false);
  });

  it("lets HR approve or reject pending leave, not cancelled rows", () => {
    expect(canTransitionLeave("pending", "approved", "hr")).toBe(true);
    expect(canTransitionLeave("pending", "rejected", "hr")).toBe(true);
    expect(canTransitionLeave("cancelled", "approved", "hr")).toBe(false);
    expect(canTransitionLeave("approved", "rejected", "hr")).toBe(false);
  });

  it("lets manager/ops reject but not final-approve via transition map", () => {
    expect(canTransitionLeave("pending", "rejected", "manager")).toBe(true);
    expect(canTransitionLeave("pending", "approved", "manager")).toBe(false);
  });

  it("throws on an illegal transition", () => {
    expect(() => assertLeaveTransition("rejected", "approved", "hr")).toThrow(/cannot move/);
  });

  it("counts inclusive calendar days", () => {
    expect(countLeaveDays("2026-08-28", "2026-08-28")).toBe(1);
    expect(countLeaveDays("2026-08-28", "2026-08-30")).toBe(3);
    expect(countLeaveDays("2026-08-30", "2026-08-28")).toBe(0);
  });

  it("seeds manager → ops → hr approval ladder", () => {
    expect(defaultLeaveApprovalSteps().map((s) => s.stepRole)).toEqual(["manager", "ops", "hr"]);
  });
});

describe("annual accrual from hire_date (AT#8 leave)", () => {
  it("is ineligible before hire year", () => {
    const r = annualAccrualFromHireDate({
      hireDate: "2027-03-01",
      year: 2026,
      annualDays: 21,
      fromHireDate: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.accruedDays).toBe(0);
  });

  it("pro-rates months from mid-year hire", () => {
    const r = annualAccrualFromHireDate({
      hireDate: "2026-07-01",
      year: 2026,
      annualDays: 21,
      fromHireDate: true,
      asOfDate: "2026-12-31",
    });
    expect(r.eligible).toBe(true);
    expect(r.monthsAccrued).toBe(6);
    expect(r.accruedDays).toBe(10.5);
  });

  it("gives full allotment when hired before the year", () => {
    const r = annualAccrualFromHireDate({
      hireDate: "2024-01-15",
      year: 2026,
      annualDays: 21,
      fromHireDate: true,
      asOfDate: "2026-12-31",
    });
    expect(r.eligible).toBe(true);
    expect(r.monthsAccrued).toBe(12);
    expect(r.accruedDays).toBe(21);
  });

  it("skips pro-rate when annual_from_hire_date is false", () => {
    const r = annualAccrualFromHireDate({
      hireDate: "2026-10-01",
      year: 2026,
      annualDays: 21,
      fromHireDate: false,
    });
    expect(r.accruedDays).toBe(21);
  });
});

describe("overlap prevention", () => {
  it("hard-blocks overlapping leave requests", () => {
    const conflicts = detectLeaveConflicts({
      dateFrom: "2026-08-28",
      dateTo: "2026-08-30",
      overlappingLeave: [{ dateFrom: "2026-08-30", dateTo: "2026-09-01", status: "pending" }],
    });
    expect(hasHardLeaveOverlap(conflicts)).toBe(true);
  });

  it("does not hard-block roster-only conflicts", () => {
    const conflicts = detectLeaveConflicts({
      dateFrom: "2026-08-28",
      dateTo: "2026-08-30",
      rosterDates: ["2026-08-29"],
    });
    expect(hasHardLeaveOverlap(conflicts)).toBe(false);
  });
});

describe("compassionate defaults from policy", () => {
  it("uses Qatar 5 / outside 11 from policy defaults", () => {
    expect(compassionateDaysFromPolicy(HR_POLICY_DEFAULTS.leave, "inside_qatar")).toBe(5);
    expect(compassionateDaysFromPolicy(HR_POLICY_DEFAULTS.leave, "outside_qatar")).toBe(11);
  });
});

describe("comp-off expiry", () => {
  it("blocks use after expiry unless HR exception", () => {
    expect(
      canUseCompOff({
        expiresOn: "2026-01-01",
        asOfDate: "2026-02-01",
        remainingDays: 1,
      }),
    ).toBe(false);
    expect(
      canUseCompOff({
        expiresOn: "2026-01-01",
        asOfDate: "2026-02-01",
        remainingDays: 1,
        hrException: true,
      }),
    ).toBe(true);
  });
});
