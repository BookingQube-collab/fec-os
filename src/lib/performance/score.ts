/**
 * Employee performance score calculation helpers.
 * Supports higher/lower-is-better, 120% cap, weighted totals, rating bands.
 * Auto KPI actuals are pulled in `auto-actuals.ts` then scored here.
 */

export type RatingBand = "excellent" | "good" | "needs_attention" | "poor";

export const DEFAULT_RATING_BANDS: Record<RatingBand, { min: number; label: string }> = {
  excellent: { min: 90, label: "Excellent" },
  good: { min: 80, label: "Good" },
  needs_attention: { min: 70, label: "Needs Attention" },
  poor: { min: 0, label: "Poor" },
};

export const DEFAULT_KPI_WEIGHTAGE = {
  maxTotalPct: 100,
  maxCapPct: 120,
  kraWeightPct: 40,
  kpiWeightPct: 60,
} as const;

/** Consecutive EOM wins blocked beyond this (config constant; UI polish deferred). */
export const EOM_MAX_CONSECUTIVE_WINS = 2;

export const EOM_ELIGIBILITY = {
  minAttendancePct: 95,
  minEvaluationScore: 85,
  disallowOpenPip: true,
  maxConsecutiveWins: EOM_MAX_CONSECUTIVE_WINS,
  requireManagerApproval: true,
} as const;

export type ScoreInput = {
  actual: number;
  target: number;
  higherIsBetter?: boolean;
  /** Cap achievement % before converting to 0–100 score points (default 120). */
  maxCapPct?: number;
};

/**
 * Achievement % vs target, capped (default 120%), then clamped to 0–maxCap.
 * Higher-is-better: actual/target * 100
 * Lower-is-better: target/actual * 100 (when actual > 0); 100% if actual <= target
 */
export function computeAchievementPct(input: ScoreInput): number {
  const { actual, target, higherIsBetter = true, maxCapPct = DEFAULT_KPI_WEIGHTAGE.maxCapPct } = input;
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return 0;

  let pct: number;
  if (higherIsBetter) {
    if (target === 0) return actual === 0 ? 100 : maxCapPct;
    pct = (actual / target) * 100;
  } else {
    if (actual <= 0 && target <= 0) return 100;
    if (actual <= 0) return maxCapPct;
    if (target === 0) return actual === 0 ? 100 : 0;
    // Hitting or beating (lower) target → at least 100%
    pct = (target / actual) * 100;
  }

  return Math.min(Math.max(pct, 0), maxCapPct);
}

/** Normalize achievement % to a 0–100 score contribution (cap still applied). */
export function normalizeScore(input: ScoreInput): number {
  const pct = computeAchievementPct(input);
  const cap = input.maxCapPct ?? DEFAULT_KPI_WEIGHTAGE.maxCapPct;
  // Map 0..cap → 0..100 so 120% achievement can yield 100 after weight, while preserving relative over-performance in weighted form
  return Math.min((pct / 100) * 100, cap);
}

export function weightedScore(normalized: number, weightPct: number): number {
  if (!Number.isFinite(normalized) || !Number.isFinite(weightPct) || weightPct <= 0) return 0;
  return (normalized * weightPct) / 100;
}

export type WeightedItem = {
  normalizedScore: number;
  weightPct: number;
};

export function sumWeightedScores(items: WeightedItem[]): number {
  return items.reduce((sum, item) => sum + weightedScore(item.normalizedScore, item.weightPct), 0);
}

/** Validate template weights sum to ~100% (tolerance 0.01). */
export function weightsSumTo100(weights: number[], tolerance = 0.01): boolean {
  const total = weights.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return Math.abs(total - 100) <= tolerance;
}

export function ratingBandForScore(
  score: number,
  bands: Record<RatingBand, { min: number }> = DEFAULT_RATING_BANDS,
): RatingBand {
  if (score >= bands.excellent.min) return "excellent";
  if (score >= bands.good.min) return "good";
  if (score >= bands.needs_attention.min) return "needs_attention";
  return "poor";
}

/**
 * Blend KRA + KPI section scores using configured weights (default 40/60).
 */
export function blendEvaluationScore(
  kraScore: number,
  kpiScore: number,
  kraWeightPct = DEFAULT_KPI_WEIGHTAGE.kraWeightPct,
  kpiWeightPct = DEFAULT_KPI_WEIGHTAGE.kpiWeightPct,
): number {
  const totalW = kraWeightPct + kpiWeightPct || 100;
  return (kraScore * kraWeightPct + kpiScore * kpiWeightPct) / totalW;
}

export type EomEligibilityInput = {
  attendancePct: number | null;
  evaluationScore: number | null;
  hasOpenPip: boolean;
  consecutiveWins: number;
};

export type EomEligibilityResult = {
  eligible: boolean;
  reasons: string[];
};

export function checkEomEligibility(input: EomEligibilityInput): EomEligibilityResult {
  const reasons: string[] = [];
  const { minAttendancePct, minEvaluationScore, disallowOpenPip, maxConsecutiveWins } = EOM_ELIGIBILITY;

  if (input.attendancePct == null || input.attendancePct < minAttendancePct) {
    reasons.push(`attendance_below_${minAttendancePct}`);
  }
  if (input.evaluationScore == null || input.evaluationScore < minEvaluationScore) {
    reasons.push(`score_below_${minEvaluationScore}`);
  }
  if (disallowOpenPip && input.hasOpenPip) {
    reasons.push("open_pip");
  }
  if (input.consecutiveWins >= maxConsecutiveWins) {
    reasons.push(`max_consecutive_wins_${maxConsecutiveWins}`);
  }

  return { eligible: reasons.length === 0, reasons };
}
