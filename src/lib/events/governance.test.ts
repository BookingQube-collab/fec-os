import { describe, expect, it } from "vitest";

import {
  allowedBudgetActions,
  assertBudgetTransition,
  budgetIsApprovedLike,
  budgetLinesEditable,
  collectEventEscalations,
  findBudgetTransition,
  nextEscalationLevel,
  riskMatrixBand,
} from "@/lib/events/governance";

describe("event pm phase 7 budget transitions", () => {
  it("allows the draft → submitted → approved → locked path", () => {
    expect(findBudgetTransition("draft", "submit")?.to).toBe("submitted");
    expect(findBudgetTransition("submitted", "approve")?.to).toBe("approved");
    expect(findBudgetTransition("approved", "lock")?.to).toBe("locked");
  });

  it("supports reject and reopen rules", () => {
    expect(findBudgetTransition("submitted", "reject")?.to).toBe("rejected");
    expect(findBudgetTransition("rejected", "reopen")?.to).toBe("draft");
    expect(findBudgetTransition("approved", "reopen")?.to).toBe("draft");
    expect(findBudgetTransition("locked", "reopen")?.to).toBe("draft");
  });

  it("rejects illegal transitions", () => {
    expect(findBudgetTransition("draft", "approve")).toBeNull();
    expect(findBudgetTransition("locked", "submit")).toBeNull();
    expect(findBudgetTransition("approved", "submit")).toBeNull();
    expect(() =>
      assertBudgetTransition({ from: "draft", action: "approve", capabilities: ["events.approve"] }),
    ).toThrow(/cannot approve/i);
  });

  it("enforces capability and reason gates", () => {
    expect(() =>
      assertBudgetTransition({ from: "draft", action: "submit", capabilities: ["events.approve"] }),
    ).toThrow(/events\.finance/);
    expect(
      assertBudgetTransition({ from: "draft", action: "submit", capabilities: ["events.finance"] }).to,
    ).toBe("submitted");
    expect(() =>
      assertBudgetTransition({
        from: "submitted",
        action: "reject",
        capabilities: ["events.approve"],
        reason: "no",
      }),
    ).toThrow(/reason/i);
    expect(
      assertBudgetTransition({
        from: "submitted",
        action: "reject",
        capabilities: ["events.manage"],
        reason: "Overrun too high",
      }).to,
    ).toBe("rejected");
  });

  it("lists allowed actions per status", () => {
    expect(allowedBudgetActions("draft")).toEqual(["submit"]);
    expect(allowedBudgetActions("submitted").sort()).toEqual(["approve", "reject"]);
    expect(allowedBudgetActions("approved").sort()).toEqual(["lock", "reopen"]);
    expect(allowedBudgetActions("locked")).toEqual(["reopen"]);
    expect(allowedBudgetActions("rejected")).toEqual(["reopen"]);
  });

  it("locks line edits outside draft/rejected", () => {
    expect(budgetLinesEditable("draft")).toBe(true);
    expect(budgetLinesEditable("rejected")).toBe(true);
    expect(budgetLinesEditable("submitted")).toBe(false);
    expect(budgetLinesEditable("approved")).toBe(false);
    expect(budgetLinesEditable("locked")).toBe(false);
    expect(budgetIsApprovedLike("approved")).toBe(true);
    expect(budgetIsApprovedLike("locked")).toBe(true);
    expect(budgetIsApprovedLike("submitted")).toBe(false);
  });
});

describe("event pm phase 7 risk / escalation helpers", () => {
  it("computes severity matrix bands from likelihood × impact", () => {
    expect(riskMatrixBand("low", "low")).toBe("low");
    expect(riskMatrixBand("medium", "medium")).toBe("medium");
    expect(riskMatrixBand("high", "high")).toBe("high");
    expect(riskMatrixBand("critical", "high")).toBe("critical");
    expect(riskMatrixBand(null, null, "critical")).toBe("critical");
  });

  it("steps escalation levels upward", () => {
    expect(nextEscalationLevel("none")).toBe("team");
    expect(nextEscalationLevel("team")).toBe("pm");
    expect(nextEscalationLevel("pm")).toBe("director");
    expect(nextEscalationLevel("director")).toBe("exec");
    expect(nextEscalationLevel("exec")).toBe("exec");
  });

  it("collects overdue risks, tasks, gates, and issues", () => {
    const items = collectEventEscalations({
      today: "2026-10-30",
      risks: [
        { id: "r1", title: "Permit delay", status: "open", due_date: "2026-10-20", severity: "high" },
        { id: "r2", title: "Closed", status: "closed", due_date: "2026-10-01" },
      ],
      tasks: [
        {
          id: "t1",
          title: "Install",
          status: "in_progress",
          due_date: "2026-10-29",
          escalation_level: "none",
        },
        { id: "t2", title: "Done", status: "completed", due_date: "2026-10-01" },
      ],
      gates: [
        { requirementId: "g1", labelEn: "Budget approved", blocking: true, satisfied: false },
        { requirementId: "g2", labelEn: "OK", blocking: true, satisfied: true },
      ],
      issues: [
        {
          id: "i1",
          title: "Snag",
          status: "open",
          sla_due_date: "2026-10-28",
          severity: "medium",
        },
      ],
    });
    expect(items.map((i) => i.kind).sort()).toEqual(["gate", "issue", "risk", "task"]);
    expect(items.every((i) => i.overdue || i.kind === "gate")).toBe(true);
  });
});
