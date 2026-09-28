import { describe, expect, it } from "vitest";

import {
  activeWeight,
  classification,
  kraScore,
  legacyClassification,
  legacyKraScore,
  reviewReadiness,
  rowCheck,
  scoreReview,
  type KraLineInput,
  type KraReviewHeader,
} from "./score";

const header = (overrides: Partial<KraReviewHeader> = {}): KraReviewHeader => ({
  employeeLinked: true,
  reviewPeriod: "September 2026",
  reviewerName: "Site supervisor",
  assignedPost: "Gate",
  role: "Attendant",
  cashierShare: 0.5,
  criticalStatus: "Clear",
  ...overrides,
});

function line(overrides: Partial<KraLineInput> = {}): KraLineInput {
  return {
    status: "Applicable",
    activeWeight: 10,
    rating: 5,
    actualResult: "Observed",
    evidence: "Checklist R01",
    ...overrides,
  };
}

describe("site KRA active weight", () => {
  it("selects the role column and blends dual role by cashier share", () => {
    expect(activeWeight("Cashier", 20, 30, 15, 0.5)).toBe(20);
    expect(activeWeight("Attendant", 20, 30, 15, 0.5)).toBe(30);
    expect(activeWeight("Supervisor", 20, 30, 15, 0.5)).toBe(15);
    expect(activeWeight("Dual Role", 20, 30, 10, 0.5)).toBe(25);
    expect(activeWeight("Dual Role", 20, 30, 10, 0)).toBe(30);
    expect(activeWeight("Dual Role", 20, 30, 10, 1)).toBe(20);
  });
});

describe("site KRA row check", () => {
  it("excludes N/A only when evidence is present and the rating is blank", () => {
    expect(rowCheck(line({ status: "N/A", rating: null, evidence: "No food role" }))).toBe("Excluded");
    expect(rowCheck(line({ status: "N/A", rating: null, evidence: "  " }))).toBe("Incomplete");
    expect(rowCheck(line({ status: "N/A", rating: 3, evidence: "No food role" }))).toBe("Incomplete");
  });

  it("keeps zero-weight applicable rows incomplete", () => {
    expect(rowCheck(line({ activeWeight: 0 }))).toBe("Incomplete");
    expect(rowCheck(line({ status: "Pending" }))).toBe("Incomplete");
    expect(rowCheck(line({ rating: 4.5 }))).toBe("Incomplete");
    expect(rowCheck(line())).toBe("Ready");
  });
});

describe("site KRA score and classification", () => {
  const readyLines: KraLineInput[] = [
    line({ activeWeight: 30, rating: 5 }),
    line({ activeWeight: 65, rating: 4 }),
    line({ status: "N/A", activeWeight: 5, rating: null, actualResult: "", evidence: "No food duties" }),
  ];

  it("normalizes points over applicable weights and rounds to 1 decimal", () => {
    // 30*5/5 + 65*4/5 = 30 + 52 = 82; denominator 95; 82/95*100 = 86.315… → 86.3
    const readiness = reviewReadiness(header(), readyLines);
    expect(readiness).toBe("Ready");
    expect(kraScore(readiness, readyLines)).toBe(86.3);
    expect(classification(readiness, 86.3, "Clear")).toBe("Exceeds Expectations");
  });

  it("blocks the score until details, role, share, and evidence are complete", () => {
    expect(reviewReadiness(header({ reviewPeriod: "" }), readyLines)).toBe("Complete review details");
    expect(reviewReadiness(header({ role: "Lead" }), readyLines)).toBe("Select valid role");
    expect(
      reviewReadiness(header({ role: "Dual Role", cashierShare: 1.5 }), readyLines),
    ).toBe("Check duty share");
    expect(reviewReadiness(header(), [line({ evidence: "" })])).toBe("Evidence incomplete");
    expect(kraScore("Evidence incomplete", readyLines)).toBeNull();
    expect(classification("Evidence incomplete", null, "Clear")).toBe("Incomplete");
  });

  it("uses the site bands and holds classification when critical status is not Clear", () => {
    expect(classification("Ready", 90, "Clear")).toBe("Outstanding");
    expect(classification("Ready", 70, "Clear")).toBe("Exceeds Expectations");
    expect(classification("Ready", 50, "Clear")).toBe("Meets Expectations");
    expect(classification("Ready", 30, "Clear")).toBe("Needs Improvement");
    expect(classification("Ready", 29.9, "Clear")).toBe("Unsatisfactory");
    expect(classification("Ready", 96, "Review required")).toBe("Management review required");
    expect(classification("Ready", 96, "Pending")).toBe("Critical review pending");
  });

  it("scores a full attendant card at 100 when every applicable row is 5 and zero-weight rows are excluded", () => {
    const weights = [30, 8, 6, 6, 5, 10, 5, 10, 5, 5, 5, 0, 5];
    const lines = weights.map((weight) =>
      weight === 0
        ? line({ status: "N/A", activeWeight: 0, rating: null, actualResult: "", evidence: "Not a supervisor duty" })
        : line({ activeWeight: weight, rating: 5 }),
    );
    const result = scoreReview(header(), lines);
    expect(result.readiness).toBe("Ready");
    expect(result.score).toBe(100);
    expect(result.classification).toBe("Outstanding");
  });
});

describe("historical Master KRA formula", () => {
  it("matches EMP-01 cashier ratings on the Master KRA sheet (98, Outstanding)", () => {
    const ratings = {
      guestService: 5,
      teamwork: 5,
      reliability: 5,
      initiative: 5,
      zoneKnowledge: 5,
      attendance: 4,
    };
    const score = legacyKraScore("Cashier", ratings);
    expect(score).toBe(98);
    expect(legacyClassification(score)).toBe("Outstanding");
  });

  it("averages the two rounded role scores for dual role", () => {
    const ratings = {
      guestService: 4,
      teamwork: 4,
      reliability: 4,
      initiative: 4,
      zoneKnowledge: 4,
      attendance: 4,
    };
    expect(legacyKraScore("Cashier", ratings)).toBe(80);
    expect(legacyKraScore("Attendant", ratings)).toBe(80);
    expect(legacyKraScore("Dual Role", ratings)).toBe(80);
    expect(legacyClassification(79.9)).toBe("Meets Expectations");
    expect(legacyClassification(80)).toBe("Exceeds Expectations");
  });
});
