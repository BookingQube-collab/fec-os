import { describe, expect, it } from "vitest";

import { HR_POLICY_DEFAULTS } from "./hr-policy";
import { evaluateWarningEscalation, warningPolicyFromSection } from "./hr-warnings";
import { rosterMissingStaffMutation } from "./hr-policy";
import {
  assertNoticeOverrideAllowed,
  assertTerminationCanApply,
  assertTerminationTypeAllowed,
  draftTerminationFromProbationFlag,
  exitAutoTerminateGuard,
  lengthOfServiceDays,
  suggestNoticePeriod,
} from "./hr-exit";

const today = "2026-09-20";
const notice = {
  ...HR_POLICY_DEFAULTS.notice,
  higher_mgmt_lte_2y_days: 30,
  higher_mgmt_gt_2_lte_4y_days: 60,
  higher_mgmt_gt_4y_days: 90,
  secondment_days: 7,
  secondment_contractual: false,
};

describe("AT#9 notice suggested from category + service length", () => {
  it("higher management ≤2y → 1 month", () => {
    const s = suggestNoticePeriod({
      category: "higher_mgmt",
      hireDate: "2025-01-01",
      asOf: today,
      policy: notice,
    });
    expect(s.band).toBe("higher_mgmt_lte_2y");
    expect(s.suggestedDays).toBe(30);
    expect(s.contractual).toBe(true);
    expect(s.lengthOfServiceYears).toBeLessThanOrEqual(2);
  });

  it("higher management >2–4y → 2 months", () => {
    const s = suggestNoticePeriod({
      category: "higher_mgmt",
      hireDate: "2023-01-01",
      asOf: today,
      policy: notice,
    });
    expect(s.band).toBe("higher_mgmt_gt_2_lte_4y");
    expect(s.suggestedDays).toBe(60);
    expect(s.lengthOfServiceYears).toBeGreaterThan(2);
    expect(s.lengthOfServiceYears).toBeLessThanOrEqual(4);
  });

  it("higher management >4y → 3 months", () => {
    const s = suggestNoticePeriod({
      category: "higher_mgmt",
      hireDate: "2020-01-01",
      asOf: today,
      policy: notice,
    });
    expect(s.band).toBe("higher_mgmt_gt_4y");
    expect(s.suggestedDays).toBe(90);
  });

  it("operations permanent → 1 month", () => {
    const s = suggestNoticePeriod({
      category: "operations",
      hireDate: "2024-01-01",
      asOf: today,
      policy: notice,
    });
    expect(s.suggestedDays).toBe(30);
    expect(s.band).toBe("operations");
  });

  it("secondment → ≥1 week, non-contractual by default", () => {
    const s = suggestNoticePeriod({
      category: "secondment",
      hireDate: "2025-06-01",
      asOf: today,
      policy: notice,
    });
    expect(s.suggestedDays).toBe(7);
    expect(s.contractual).toBe(false);
    expect(s.band).toBe("secondment");
  });

  it("calculates service length from hire_date", () => {
    expect(lengthOfServiceDays("2026-09-01", "2026-09-20")).toBe(19);
  });
});

describe("AT#10 notice override requires reason + approval", () => {
  it("same as suggested needs no override", () => {
    expect(
      assertNoticeOverrideAllowed({
        suggestedDays: 30,
        requiredNoticeDays: 30,
        overrideReason: null,
        approved: false,
      }),
    ).toEqual({ overridden: false });
  });

  it("override without reason throws", () => {
    expect(() =>
      assertNoticeOverrideAllowed({
        suggestedDays: 30,
        requiredNoticeDays: 14,
        overrideReason: "  ",
        approved: true,
      }),
    ).toThrow(/mandatory reason/i);
  });

  it("override without approval throws", () => {
    expect(() =>
      assertNoticeOverrideAllowed({
        suggestedDays: 30,
        requiredNoticeDays: 14,
        overrideReason: "Business need",
        approved: false,
      }),
    ).toThrow(/requires approval/i);
  });

  it("override with reason + approval ok", () => {
    expect(
      assertNoticeOverrideAllowed({
        suggestedDays: 30,
        requiredNoticeDays: 14,
        overrideReason: "Mutual agreement",
        approved: true,
      }),
    ).toEqual({ overridden: true });
  });
});

describe("termination never applied without authorize path", () => {
  it("rejects missing dual approval", () => {
    expect(() =>
      assertTerminationCanApply({
        status: "approved",
        hrApprovedBy: "u1",
        execApprovedBy: null,
      }),
    ).toThrow(/dual approval/i);
  });

  it("rejects same user for both slots", () => {
    expect(() =>
      assertTerminationCanApply({
        status: "approved",
        hrApprovedBy: "u1",
        execApprovedBy: "u1",
      }),
    ).toThrow(/distinct/i);
  });

  it("rejects non-approved status", () => {
    expect(() =>
      assertTerminationCanApply({
        status: "draft",
        hrApprovedBy: "u1",
        execApprovedBy: "u2",
      }),
    ).toThrow(/status/i);
  });

  it("allows apply when dual-approved and status=approved", () => {
    expect(() =>
      assertTerminationCanApply({
        status: "approved",
        hrApprovedBy: "u1",
        execApprovedBy: "u2",
      }),
    ).not.toThrow();
  });

  it("probation flag opens draft only — never terminates staff", () => {
    const d = draftTerminationFromProbationFlag();
    expect(d.status).toBe("draft");
    expect(d.staffStatusTerminated).toBe(false);
    expect(d.autoTerminatesStaff).toBe(false);
    expect(d.requiresApproval).toBe(true);
  });

  it("higher_mgmt cannot use payment_in_lieu", () => {
    expect(() => assertTerminationTypeAllowed("higher_mgmt", "payment_in_lieu")).toThrow();
    expect(() => assertTerminationTypeAllowed("higher_mgmt", "immediate")).not.toThrow();
    expect(() => assertTerminationTypeAllowed("operations", "payment_in_lieu")).not.toThrow();
  });
});

describe("warning/roster still cannot auto-terminate (regression)", () => {
  it("warning escalation never terminates", () => {
    const policy = warningPolicyFromSection(HR_POLICY_DEFAULTS.warning);
    const escalation = evaluateWarningEscalation({
      activeCount: 3,
      onProbation: false,
      policy,
    });
    expect(escalation.autoTerminate).toBe(false);
    expect(escalation.staffStatusTerminated).toBe(false);
    expect(exitAutoTerminateGuard().autoTerminate).toBe(false);
  });

  it("roster missing staff flags for review only", () => {
    const m = rosterMissingStaffMutation();
    expect(m.auto_terminated).toBe(false);
    expect(m.flagged_for_hr_review).toBe(true);
  });
});
