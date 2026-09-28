/**
 * Scoring for FEC_Master_KRA_Scorecard.xlsx.
 *
 * Site reviews (INF-CC and the other six templates) use the Review Guide /
 * sheet formulas: active weight by role, row check, readiness, then
 * score = ROUND(SUM(points) / SUMIF(status, "Applicable", active weight) * 100, 1).
 *
 * The Master KRA tab is marked historical. Its bands and weights differ and
 * live in the legacy* helpers.
 */

export const KRA_ROLES = ["Cashier", "Attendant", "Dual Role", "Supervisor"] as const;
export type KraRole = (typeof KRA_ROLES)[number];

export const KRA_LINE_STATUSES = ["Pending", "Applicable", "N/A"] as const;
export type KraLineStatus = (typeof KRA_LINE_STATUSES)[number];

export const KRA_CRITICAL_STATUSES = ["Pending", "Clear", "Review required"] as const;
export type KraCriticalStatus = (typeof KRA_CRITICAL_STATUSES)[number];

export type KraLineInput = {
  status: KraLineStatus;
  /** Active weight already resolved for the review role (column H). */
  activeWeight: number;
  rating: number | null;
  actualResult: string;
  evidence: string;
};

export type KraReviewHeader = {
  employeeLinked: boolean;
  reviewPeriod: string;
  reviewerName: string;
  assignedPost: string;
  role: string | null;
  /** Cashier share for Dual Role. Sheet default is 0.5. Ignored for other roles. */
  cashierShare: number | null;
  criticalStatus: KraCriticalStatus;
};

export type RowCheck = "Ready" | "Excluded" | "Incomplete";

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isKraRole(value: string | null | undefined): value is KraRole {
  return KRA_ROLES.includes(value as KraRole);
}

/** Column H: role picks cashier / attendant / supervisor weight; dual blends by cashier share. */
export function activeWeight(
  role: KraRole,
  cashierWeight: number,
  attendantWeight: number,
  supervisorWeight: number,
  cashierShare: number,
): number {
  if (role === "Cashier") return cashierWeight;
  if (role === "Attendant") return attendantWeight;
  if (role === "Supervisor") return supervisorWeight;
  return cashierWeight * cashierShare + attendantWeight * (1 - cashierShare);
}

function blank(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === "";
}

function integerRating(rating: number | null): boolean {
  return typeof rating === "number" && Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

/**
 * Column N. N/A is Excluded only when evidence/approval is present and the rating cell is blank.
 * Applicable is Ready only when weight > 0, rating is an integer 1–5, and actual + evidence are filled.
 */
export function rowCheck(line: KraLineInput): RowCheck {
  if (line.status === "N/A") {
    if (!blank(line.evidence) && line.rating == null) return "Excluded";
    return "Incomplete";
  }
  if (line.status === "Applicable") {
    if (
      line.activeWeight > 0 &&
      integerRating(line.rating) &&
      !blank(line.actualResult) &&
      !blank(line.evidence)
    ) {
      return "Ready";
    }
    return "Incomplete";
  }
  return "Incomplete";
}

/** Column M: points only when the row check is Ready. */
export function linePoints(line: KraLineInput): number {
  if (rowCheck(line) !== "Ready" || line.rating == null) return 0;
  return (line.activeWeight * line.rating) / 5;
}

/** Cell J7. */
export function reviewReadiness(header: KraReviewHeader, lines: KraLineInput[]): string {
  if (
    !header.employeeLinked ||
    blank(header.reviewPeriod) ||
    blank(header.reviewerName) ||
    blank(header.assignedPost)
  ) {
    return "Complete review details";
  }
  if (!isKraRole(header.role)) return "Select valid role";
  if (header.role === "Dual Role") {
    const share = header.cashierShare;
    if (typeof share !== "number" || Number.isNaN(share) || share < 0 || share > 1) {
      return "Check duty share";
    }
  }
  if (lines.some((line) => rowCheck(line) === "Incomplete")) return "Evidence incomplete";
  const applicable = lines.reduce(
    (sum, line) => sum + (line.status === "Applicable" ? line.activeWeight : 0),
    0,
  );
  if (applicable === 0) return "No applicable weight";
  return "Ready";
}

/** Cell B7. Blank until the review is Ready. */
export function kraScore(readiness: string, lines: KraLineInput[]): number | null {
  if (readiness !== "Ready") return null;
  const points = lines.reduce((sum, line) => sum + linePoints(line), 0);
  const denominator = lines.reduce(
    (sum, line) => sum + (line.status === "Applicable" ? line.activeWeight : 0),
    0,
  );
  if (denominator === 0) return null;
  return round1((points / denominator) * 100);
}

/** Cell E7. Site bands are 90 / 70 / 50 / 30, not the historical Master KRA bands. */
export function classification(
  readiness: string,
  score: number | null,
  criticalStatus: KraCriticalStatus,
): string {
  if (readiness !== "Ready" || score == null) return "Incomplete";
  if (criticalStatus === "Review required") return "Management review required";
  if (criticalStatus !== "Clear") return "Critical review pending";
  if (score >= 90) return "Outstanding";
  if (score >= 70) return "Exceeds Expectations";
  if (score >= 50) return "Meets Expectations";
  if (score >= 30) return "Needs Improvement";
  return "Unsatisfactory";
}

export function scoreReview(header: KraReviewHeader, lines: KraLineInput[]) {
  const readiness = reviewReadiness(header, lines);
  const score = kraScore(readiness, lines);
  return {
    readiness,
    score,
    classification: classification(readiness, score, header.criticalStatus),
    lines: lines.map((line) => ({
      rowCheck: rowCheck(line),
      points: linePoints(line),
    })),
  };
}

export type LegacyBehaviorRatings = {
  guestService: number;
  teamwork: number;
  reliability: number;
  initiative: number;
  zoneKnowledge: number;
  attendance: number;
};

function weighted(rating: number, points: number): number {
  return (rating / 5) * points;
}

/** Historical Master KRA cashier formula (column L when role is Cashier). */
export function legacyCashierScore(ratings: LegacyBehaviorRatings): number {
  return round1(
    weighted(ratings.reliability, 25) +
      weighted(ratings.guestService, 20) +
      weighted(ratings.initiative, 15) +
      weighted(ratings.zoneKnowledge, 15) +
      weighted(ratings.attendance, 10) +
      weighted(ratings.teamwork, 10) +
      weighted(ratings.reliability, 5),
  );
}

/** Historical Master KRA attendant formula. */
export function legacyAttendantScore(ratings: LegacyBehaviorRatings): number {
  return round1(
    weighted(ratings.reliability, 25) +
      weighted(ratings.zoneKnowledge, 20) +
      weighted(ratings.guestService, 15) +
      weighted(ratings.initiative, 15) +
      weighted(ratings.attendance, 10) +
      weighted(ratings.teamwork, 10) +
      weighted(ratings.reliability, 5),
  );
}

/** Dual Role on the historical sheet is the average of the two rounded role scores. */
export function legacyKraScore(
  role: "Cashier" | "Attendant" | "Dual Role",
  ratings: LegacyBehaviorRatings,
): number {
  if (role === "Cashier") return legacyCashierScore(ratings);
  if (role === "Attendant") return legacyAttendantScore(ratings);
  return round1((legacyCashierScore(ratings) + legacyAttendantScore(ratings)) / 2);
}

/** Historical classification bands: 90 / 80 / 70 / 60. */
export function legacyClassification(score: number): string {
  if (score >= 90) return "Outstanding";
  if (score >= 80) return "Exceeds Expectations";
  if (score >= 70) return "Meets Expectations";
  if (score >= 60) return "Needs Improvement";
  return "Unsatisfactory";
}
