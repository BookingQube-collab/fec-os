/**
 * Event Payroll hub display helpers (People → Event Payroll).
 * Pure — no Supabase. Maps real period + line aggregates for mockup KPIs/table.
 */

import type { HrPayrollStatus } from "@/lib/hr-payroll";

export type EventPayrollUiStatus = "completed" | "open" | "in_review";

export type EventPayrollPeriodStats = {
  crewCount: number;
  totalHours: number;
  payrollAmountQar: number;
};

export type EventPayrollKpis = {
  totalPeriods: number;
  totalPeriodsDeltaPct: number | null;
  crewPaid: number;
  crewPaidDeltaPct: number | null;
  totalHours: number;
  payrollAmountQar: number;
  completedPeriods: number;
  completedPct: number;
};

const COMPLETED: ReadonlySet<string> = new Set(["locked", "paid", "processed"]);
const OPEN: ReadonlySet<string> = new Set(["draft", "attendance_validation"]);
const IN_REVIEW: ReadonlySet<string> = new Set([
  "hr_review",
  "finance_review",
  "gm_approved",
]);

export function eventPayrollUiStatus(status: string): EventPayrollUiStatus {
  if (COMPLETED.has(status)) return "completed";
  if (IN_REVIEW.has(status)) return "in_review";
  if (OPEN.has(status)) return "open";
  return "open";
}

export function formatPayrollMonthLabel(
  month: string,
  locale = "en",
): string {
  const m = month.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) return month;
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1, 1));
  return new Intl.DateTimeFormat(locale.startsWith("ar") ? "ar" : "en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatQarAmount(amount: number, locale = "en"): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat(locale.startsWith("ar") ? "ar" : "en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `QAR ${formatted}`;
}

export function formatHours(hours: number, locale = "en"): string {
  const n = Number.isFinite(hours) ? hours : 0;
  return new Intl.NumberFormat(locale.startsWith("ar") ? "ar" : "en", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

type PeriodLike = {
  id: string;
  month: string;
  status: HrPayrollStatus | string;
  dateFrom?: string;
  dateTo?: string;
};

/** Aggregate line rows keyed by period id. */
export function aggregateLineStats(
  lines: Array<{
    periodId: string;
    staffId: string;
    netQar: number;
    workingHours: number | null;
  }>,
): Map<string, EventPayrollPeriodStats> {
  const byPeriod = new Map<
    string,
    { staff: Set<string>; hours: number; amount: number }
  >();
  for (const line of lines) {
    let bucket = byPeriod.get(line.periodId);
    if (!bucket) {
      bucket = { staff: new Set(), hours: 0, amount: 0 };
      byPeriod.set(line.periodId, bucket);
    }
    bucket.staff.add(line.staffId);
    bucket.hours += Number(line.workingHours) || 0;
    bucket.amount += Number(line.netQar) || 0;
  }
  const out = new Map<string, EventPayrollPeriodStats>();
  for (const [id, b] of byPeriod) {
    out.set(id, {
      crewCount: b.staff.size,
      totalHours: Math.round(b.hours * 100) / 100,
      payrollAmountQar: Math.round(b.amount * 100) / 100,
    });
  }
  return out;
}

/**
 * Build KPI strip from filtered periods + optional per-period line stats.
 * Trends compare the newest payroll month vs the previous month (real counts only).
 * `uniqueCrewPaid` should be distinct staff ids across the filtered periods' lines.
 */
export function buildEventPayrollKpis(
  periods: PeriodLike[],
  statsByPeriod: Map<string, EventPayrollPeriodStats>,
  uniqueCrewPaid?: number,
): EventPayrollKpis {
  const totalPeriods = periods.length;
  const completedPeriods = periods.filter((p) => COMPLETED.has(p.status)).length;
  const completedPct =
    totalPeriods > 0 ? Math.round((completedPeriods / totalPeriods) * 1000) / 10 : 0;

  let crewPaidSlots = 0;
  let totalHours = 0;
  let payrollAmountQar = 0;
  for (const p of periods) {
    const s = statsByPeriod.get(p.id);
    if (!s) continue;
    totalHours += s.totalHours;
    payrollAmountQar += s.payrollAmountQar;
    crewPaidSlots += s.crewCount;
  }
  const crewPaid =
    uniqueCrewPaid != null && Number.isFinite(uniqueCrewPaid)
      ? Math.max(0, Math.floor(uniqueCrewPaid))
      : crewPaidSlots;

  const months = [...new Set(periods.map((p) => p.month.slice(0, 7)).filter(Boolean))].sort();
  const newest = months[months.length - 1] ?? null;
  const prev = months.length >= 2 ? months[months.length - 2] : null;

  let totalPeriodsDeltaPct: number | null = null;
  let crewPaidDeltaPct: number | null = null;
  if (newest && prev) {
    const newestPeriods = periods.filter((p) => p.month.slice(0, 7) === newest);
    const prevPeriods = periods.filter((p) => p.month.slice(0, 7) === prev);
    totalPeriodsDeltaPct = pctDelta(newestPeriods.length, prevPeriods.length);
    if (totalPeriodsDeltaPct === 0) totalPeriodsDeltaPct = null;
    const newestCrew = newestPeriods.reduce(
      (n, p) => n + (statsByPeriod.get(p.id)?.crewCount ?? 0),
      0,
    );
    const prevCrew = prevPeriods.reduce(
      (n, p) => n + (statsByPeriod.get(p.id)?.crewCount ?? 0),
      0,
    );
    crewPaidDeltaPct = pctDelta(newestCrew, prevCrew);
    if (crewPaidDeltaPct === 0) crewPaidDeltaPct = null;
  }

  return {
    totalPeriods,
    totalPeriodsDeltaPct,
    crewPaid,
    crewPaidDeltaPct,
    totalHours: Math.round(totalHours * 100) / 100,
    payrollAmountQar: Math.round(payrollAmountQar * 100) / 100,
    completedPeriods,
    completedPct,
  };
}

export function emptyPeriodStats(): EventPayrollPeriodStats {
  return { crewCount: 0, totalHours: 0, payrollAmountQar: 0 };
}
