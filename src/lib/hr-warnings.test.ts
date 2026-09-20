import { describe, expect, it } from "vitest";

import { HR_POLICY_DEFAULTS } from "./hr-policy";
import {
  countActiveWarnings,
  evaluateWarningEscalation,
  isActiveWarning,
  isCasualLeaveBlocked,
  warningPolicyFromSection,
} from "./hr-warnings";
import { applyProbationDecision, isOnProbation } from "./hr-probation";

const today = "2026-09-20";

describe("AT#5 three active warnings escalate without termination", () => {
  it("counts only status=active and non-expired", () => {
    const rows = [
      { status: "active", validUntil: "2026-12-31" },
      { status: "active", validUntil: "2026-12-31" },
      { status: "active", validUntil: "2026-12-31" },
      { status: "withdrawn", validUntil: "2026-12-31" },
      { status: "expired", validUntil: "2026-01-01" },
      { status: "active", validUntil: "2026-01-01" }, // past valid_until → not counted
    ];
    expect(countActiveWarnings(rows, today)).toBe(3);
  });

  it("at threshold 3: formal review + casual block, staff NOT terminated", () => {
    const policy = warningPolicyFromSection(HR_POLICY_DEFAULTS.warning);
    expect(policy.activeThreshold).toBe(3);
    expect(policy.autoTerminate).toBe(false);

    const escalation = evaluateWarningEscalation({
      activeCount: 3,
      onProbation: false,
      policy,
    });

    expect(escalation.requiresFormalReview).toBe(true);
    expect(escalation.blocksCasualLeave).toBe(true);
    expect(escalation.triggersProbationReview).toBe(false);
    expect(escalation.autoTerminate).toBe(false);
    expect(escalation.staffStatusTerminated).toBe(false);
    expect(isCasualLeaveBlocked("emergency", escalation)).toBe(true);
    expect(isCasualLeaveBlocked("annual", escalation)).toBe(false);
  });

  it("below threshold does not escalate", () => {
    const policy = warningPolicyFromSection(HR_POLICY_DEFAULTS.warning);
    const escalation = evaluateWarningEscalation({
      activeCount: 2,
      onProbation: false,
      policy,
    });
    expect(escalation.requiresFormalReview).toBe(false);
    expect(escalation.blocksCasualLeave).toBe(false);
  });
});

describe("AT#6 one warning on probation triggers review not termination", () => {
  it("probation threshold default is 1", () => {
    expect(HR_POLICY_DEFAULTS.warning.probation_threshold).toBe(1);
  });

  it("1 active warning while on probation → probation review, NOT terminate", () => {
    expect(
      isOnProbation({
        probationStart: "2026-06-01",
        probationEnd: "2026-12-01",
        today,
      }),
    ).toBe(true);

    const policy = warningPolicyFromSection(HR_POLICY_DEFAULTS.warning);
    const escalation = evaluateWarningEscalation({
      activeCount: 1,
      onProbation: true,
      policy,
    });

    expect(escalation.triggersProbationReview).toBe(true);
    expect(escalation.requiresFormalReview).toBe(false);
    expect(escalation.autoTerminate).toBe(false);
    expect(escalation.staffStatusTerminated).toBe(false);

    const decision = applyProbationDecision("terminate");
    expect(decision.flagsPhase6Termination).toBe(true);
    expect(decision.autoTerminatesStaff).toBe(false);
    expect(decision.staffStatusTerminated).toBe(false);
  });
});

describe("expired / withdrawn warnings not counted", () => {
  it("ignores expired by status and by valid_until", () => {
    expect(isActiveWarning({ status: "expired", validUntil: "2027-01-01" }, today)).toBe(false);
    expect(isActiveWarning({ status: "withdrawn", validUntil: "2027-01-01" }, today)).toBe(false);
    expect(isActiveWarning({ status: "active", validUntil: "2026-09-01" }, today)).toBe(false);
    expect(isActiveWarning({ status: "active", validUntil: null }, today)).toBe(true);
    expect(isActiveWarning({ status: "acknowledged", validUntil: "2027-01-01" }, today)).toBe(
      false,
    );
  });
});
