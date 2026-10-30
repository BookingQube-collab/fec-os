/** Event PM Phase 8 — earned-value lite (SPI/CPI proxies, not full EVM). */

export type EvLiteInput = {
  /** 0–100 task/overall progress */
  progressPct: number;
  /** YYYY-MM-DD window used for planned progress */
  start: string | null;
  end: string | null;
  today: string;
  /** Budget / BAC (revised) — finance only */
  budgetRevised?: number | null;
  /** Actual cost — finance only */
  actualCost?: number | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
};

export type EvLiteResult = {
  plannedPct: number | null;
  progressPct: number;
  /** Schedule performance index lite: progress / planned (1.0 = on plan) */
  spi: number | null;
  /** Cost performance index lite: EV / AC when money present */
  cpi: number | null;
  earnedValue: number | null;
  actualCost: number | null;
  /** Hours utilization proxy when money absent */
  hoursVariance: number | null;
  hoursUtilizationPct: number | null;
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function daysInclusive(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Planned % of schedule elapsed between start and end (0–100). */
export function plannedProgressPct(
  start: string | null,
  end: string | null,
  today: string,
): number | null {
  if (!start || !end || end < start) return null;
  if (today <= start) return 0;
  if (today >= end) return 100;
  const span = daysInclusive(start, end);
  if (span <= 0) return 100;
  const elapsed = daysInclusive(start, today);
  return clampPct((elapsed / span) * 100);
}

export function roundIndex(n: number | null, digits = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Lightweight EV: EV = progress% × BAC; SPI = progress / planned;
 * CPI = EV / AC. Hours variance when cost data is missing.
 */
export function computeEvLite(input: EvLiteInput): EvLiteResult {
  const progressPct = clampPct(input.progressPct);
  const plannedPct = plannedProgressPct(input.start, input.end, input.today);
  const spi =
    plannedPct != null && plannedPct > 0
      ? roundIndex(progressPct / plannedPct)
      : plannedPct === 0 && progressPct >= 0
        ? roundIndex(progressPct > 0 ? 2 : 1)
        : null;

  const bac = input.budgetRevised != null && Number.isFinite(input.budgetRevised) ? Number(input.budgetRevised) : null;
  const ac = input.actualCost != null && Number.isFinite(input.actualCost) ? Number(input.actualCost) : null;
  const earnedValue = bac != null ? Math.round(((progressPct / 100) * bac) * 100) / 100 : null;
  const cpi =
    earnedValue != null && ac != null && ac > 0
      ? roundIndex(earnedValue / ac)
      : earnedValue != null && ac === 0
        ? roundIndex(earnedValue > 0 ? 2 : 1)
        : null;

  const est = Number(input.estimatedHours) || 0;
  const act = Number(input.actualHours) || 0;
  const hoursVariance = est > 0 || act > 0 ? Math.round((act - est) * 100) / 100 : null;
  const hoursUtilizationPct = est > 0 ? Math.round((act / est) * 1000) / 10 : null;

  return {
    plannedPct: plannedPct == null ? null : Math.round(plannedPct * 10) / 10,
    progressPct: Math.round(progressPct * 10) / 10,
    spi,
    cpi,
    earnedValue,
    actualCost: ac,
    hoursVariance,
    hoursUtilizationPct,
  };
}
