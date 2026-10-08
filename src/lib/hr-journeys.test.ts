import { describe, expect, it } from "vitest";

import {
  addDays,
  isTaskOverdue,
  journeyGates,
  payrollReviewCurrent,
  taskDisplayStatus,
  taskSatisfied,
  trainingSatisfied,
  type JourneyTask,
  type SalaryPackage,
} from "./hr-journeys";

const today = "2026-10-05";

function task(partial: Partial<JourneyTask> & Pick<JourneyTask, "id" | "title">): JourneyTask {
  return {
    section: "day1",
    required: true,
    status: "pending",
    ownerRole: "hr",
    ownerStaffId: "owner",
    dueOn: "2026-10-10",
    evidence: null,
    needsReview: false,
    reviewStatus: "not_required",
    reviewerStaffId: null,
    ...partial,
  };
}

function salary(partial: Partial<SalaryPackage> = {}): SalaryPackage {
  return {
    id: "p1",
    effectiveOn: "2026-05-01",
    createdAt: "2026-05-01T08:00:00.000Z",
    basicQar: 6750,
    housingQar: 1500,
    transportationQar: 500,
    foodQar: 0,
    otherQar: 0,
    monthlyTotalQar: 8750,
    currency: "QAR",
    reason: "Joining package",
    source: "history",
    ...partial,
  };
}

describe("journey operations", () => {
  it("marks overdue from the due date and leaves due-today open", () => {
    expect(isTaskOverdue(task({ id: "a", title: "A", dueOn: "2026-10-04" }), today)).toBe(true);
    expect(isTaskOverdue(task({ id: "b", title: "B", dueOn: today }), today)).toBe(false);
    expect(isTaskOverdue(task({ id: "c", title: "C", dueOn: "2026-10-04", status: "done" }), today)).toBe(false);
    expect(taskDisplayStatus(task({ id: "a", title: "A", dueOn: "2026-10-01" }), today)).toBe("overdue");
    expect(taskDisplayStatus(task({ id: "d", title: "D", status: "done", needsReview: true, reviewStatus: "awaiting" }), today)).toBe(
      "review_due",
    );
  });

  it("does not treat a waived required task as done", () => {
    const required = task({ id: "a", title: "Contract", status: "skipped" });
    const optional = task({ id: "b", title: "Buddy", required: false, status: "skipped" });
    expect(taskSatisfied(required)).toBe(false);
    expect(taskSatisfied(optional)).toBe(true);
  });

  it("blocks completion while a required gate is open", () => {
    const open = journeyGates({
      tasks: [task({ id: "a", title: "Contract" })],
      acknowledgments: [{ id: "h", title: "Handbook", required: true, status: "pending" }],
      training: [{ id: "t", title: "Induction", required: true, status: "assigned", enrollmentStatus: "ENROLLED" }],
      packages: [],
      payrollReviewedAt: null,
      expiredDocuments: [{ id: "d", title: "QID", docType: "qid", expiryDate: "2026-01-01" }],
    });
    expect(open.canComplete).toBe(false);
    expect(open.gates.find((gate) => gate.id === "tasks")?.outstanding).toBe(1);
    expect(open.percent).toBe(0);

    const closed = journeyGates({
      tasks: [task({ id: "a", title: "Contract", status: "done" })],
      acknowledgments: [{ id: "h", title: "Handbook", required: true, status: "acknowledged" }],
      training: [{ id: "t", title: "Induction", required: true, status: "assigned", enrollmentStatus: "COMPLETED" }],
      packages: [salary()],
      payrollReviewedAt: "2026-05-02T08:00:00.000Z",
      expiredDocuments: [],
    });
    expect(closed.canComplete).toBe(true);
    expect(closed.percent).toBe(100);
  });

  it("reopens payroll review after a later package revision", () => {
    const packages = [salary({ createdAt: "2026-06-01T08:00:00.000Z" })];
    expect(payrollReviewCurrent(packages, "2026-05-02T08:00:00.000Z")).toBe(false);
    expect(payrollReviewCurrent(packages, "2026-06-01T08:00:00.000Z")).toBe(true);
  });

  it("accepts a completed enrollment as required induction", () => {
    expect(
      trainingSatisfied({ id: "t", title: "Induction", required: true, status: "assigned", enrollmentStatus: "COMPLETED" }),
    ).toBe(true);
    expect(
      trainingSatisfied({ id: "t", title: "Induction", required: true, status: "assigned", enrollmentStatus: "IN_PROGRESS" }),
    ).toBe(false);
  });

  it("shifts due dates from the anchor date", () => {
    expect(addDays("2026-05-01", 30)).toBe("2026-05-31");
    expect(addDays("2026-05-01", -7)).toBe("2026-04-24");
  });
});
