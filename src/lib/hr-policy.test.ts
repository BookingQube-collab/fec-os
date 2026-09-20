import { describe, expect, it } from "vitest";

import {
  getPolicyDefault,
  HR_POLICY_DEFAULTS,
  leaveAllotmentDefaultsFromPolicy,
  mergePolicySection,
  policyNumber,
  rosterMissingStaffMutation,
} from "./hr-policy";

describe("hr policy defaults", () => {
  it("seeds sick leave at 15 days (not 14)", () => {
    expect(HR_POLICY_DEFAULTS.leave.sick_days).toBe(15);
    expect(getPolicyDefault("leave", "sick_days")).toBe(15);
    expect(leaveAllotmentDefaultsFromPolicy(HR_POLICY_DEFAULTS.leave)).toEqual({
      annual: 21,
      sick: 15,
    });
  });

  it("merges DB rows over defaults without losing unset keys", () => {
    const merged = mergePolicySection("leave", [{ key: "sick_days", value: 20 }]);
    expect(merged.sick_days).toBe(20);
    expect(merged.annual_days).toBe(21);
    expect(merged.maternity_days).toBe(50);
  });

  it("coerces policy numbers safely", () => {
    expect(policyNumber("15", 0)).toBe(15);
    expect(policyNumber(null, 15)).toBe(15);
    expect(policyNumber("nope", 7)).toBe(7);
  });

  it("includes brief defaults for warning, document, ot, payroll", () => {
    expect(HR_POLICY_DEFAULTS.warning.active_threshold).toBe(3);
    expect(HR_POLICY_DEFAULTS.warning.probation_threshold).toBe(1);
    expect(HR_POLICY_DEFAULTS.warning.auto_terminate).toBe(false);
    expect(HR_POLICY_DEFAULTS.document.passport_alert_days).toEqual([180, 90, 60, 30]);
    expect(HR_POLICY_DEFAULTS.document.qid_alert_days).toBe(30);
    expect(HR_POLICY_DEFAULTS.ot.min_claimable_minutes).toBe(60);
    expect(HR_POLICY_DEFAULTS.ot.rounding).toBe("down");
    expect(HR_POLICY_DEFAULTS.payroll.currency).toBe("QAR");
    expect(HR_POLICY_DEFAULTS.payroll.timezone).toBe("Asia/Qatar");
  });
});

describe("roster missing guard", () => {
  it("flags for HR review and never auto-terminates", () => {
    const mutation = rosterMissingStaffMutation();
    expect(mutation.flagged_for_hr_review).toBe(true);
    expect(mutation.auto_terminated).toBe(false);
    expect(mutation).not.toHaveProperty("status");
    expect(mutation).not.toHaveProperty("deleted_at");
  });
});
