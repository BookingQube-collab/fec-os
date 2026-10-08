import { describe, expect, it } from "vitest";

import { HR_POLICY_DEFAULTS } from "./hr-policy";
import {
  countEosStages,
  eosNextAction,
  eosStage,
  noticeRuleRows,
  settlementLines,
} from "./hr-eos";

const flags = {
  assetClearance: false,
  deptClearance: false,
  financeClearance: false,
};

describe("eos stage groups real statuses", () => {
  it("groups resignations into draft, review, approved, completed, and closed", () => {
    expect(eosStage("resignation", "draft")).toBe("draft");
    expect(eosStage("resignation", "submitted")).toBe("review");
    expect(eosStage("resignation", "pending_override_approval")).toBe("review");
    expect(eosStage("resignation", "approved")).toBe("approved");
    expect(eosStage("resignation", "serving_notice")).toBe("approved");
    expect(eosStage("resignation", "completed")).toBe("completed");
    expect(eosStage("resignation", "cancelled")).toBe("closed");
    expect(eosStage("resignation", "withdrawn")).toBe("closed");
  });

  it("groups terminations without treating apply as a resignation completion", () => {
    expect(eosStage("termination", "draft")).toBe("draft");
    expect(eosStage("termination", "pending_hr_approval")).toBe("review");
    expect(eosStage("termination", "pending_exec_approval")).toBe("review");
    expect(eosStage("termination", "approved")).toBe("approved");
    expect(eosStage("termination", "applied")).toBe("completed");
    expect(eosStage("termination", "withdrawn")).toBe("closed");
    expect(eosStage("termination", "mystery")).toBe("closed");
  });

  it("counts only the stages it was given", () => {
    expect(
      countEosStages(["draft", "review", "review", "completed", "closed"]),
    ).toEqual({
      draft: 1,
      review: 2,
      approved: 0,
      completed: 1,
      closed: 1,
    });
  });
});

describe("eos next action", () => {
  it("asks HR to approve a submitted resignation", () => {
    expect(eosNextAction({ kind: "resignation", status: "submitted", ...flags })).toBe(
      "approve_resignation",
    );
  });

  it("asks for the notice override before a normal approval", () => {
    expect(
      eosNextAction({ kind: "resignation", status: "pending_override_approval", ...flags }),
    ).toBe("approve_notice_override");
  });

  it("points serving notice at clearance until the flags or the checklist are done", () => {
    expect(eosNextAction({ kind: "resignation", status: "serving_notice", ...flags })).toBe(
      "finish_clearance",
    );
    expect(
      eosNextAction({
        kind: "resignation",
        status: "serving_notice",
        ...flags,
        clearanceRemaining: 0,
      }),
    ).toBe("clearance_done_serving");
  });

  it("keeps a draft termination from looking finished", () => {
    expect(eosNextAction({ kind: "termination", status: "draft", ...flags })).toBe(
      "review_draft_termination",
    );
    expect(eosNextAction({ kind: "termination", status: "pending_exec_approval", ...flags })).toBe(
      "approve_termination_exec",
    );
    expect(eosNextAction({ kind: "termination", status: "approved", ...flags })).toBe(
      "apply_termination",
    );
  });

  it("closes cancelled cases", () => {
    expect(eosNextAction({ kind: "resignation", status: "cancelled", ...flags })).toBe("case_closed");
    expect(eosNextAction({ kind: "termination", status: "applied", ...flags, assetClearance: true, deptClearance: true, financeClearance: true })).toBe(
      "case_complete",
    );
  });
});

describe("settlement lines", () => {
  it("returns nothing when the stub is empty", () => {
    expect(settlementLines({})).toEqual([]);
    expect(settlementLines(null)).toEqual([]);
  });

  it("labels known figures and still shows other stored scalars", () => {
    expect(
      settlementLines({
        note: "paid by cheque",
        gratuity: 12000,
        nested: { skip: true },
        blank: "",
        net: 9000,
      }),
    ).toEqual([
      { key: "gratuity", value: "12000", known: true },
      { key: "net", value: "9000", known: true },
      { key: "note", value: "paid by cheque", known: false },
    ]);
  });
});

describe("notice rule rows", () => {
  it("uses policy days and treats secondment as non-contractual unless policy says so", () => {
    const rows = noticeRuleRows(HR_POLICY_DEFAULTS.notice);
    const secondment = rows.find((row) => row.key === "secondment_days");
    const senior = rows.find((row) => row.key === "higher_mgmt_gt_4y_days");
    expect(secondment).toMatchObject({ days: 7, contractual: false });
    expect(senior).toMatchObject({ days: 90, contractual: true });
  });

  it("reads an override from the live policy object", () => {
    const rows = noticeRuleRows({ ...HR_POLICY_DEFAULTS.notice, permanent_days: 45, secondment_contractual: true });
    expect(rows.find((row) => row.key === "permanent_days")?.days).toBe(45);
    expect(rows.find((row) => row.key === "secondment_days")?.contractual).toBe(true);
  });
});
