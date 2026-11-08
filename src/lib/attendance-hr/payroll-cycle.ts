/**
 * Per-location payroll cycle (additive). Sites stay on FEC 28–27 by default.
 * HO may set calendar_month (1–last) without changing company-wide monthly create.
 */

import { monthBounds } from "@/lib/attendance-hr/roster-period";

export const PAYROLL_CYCLE_FEC_28_27 = "fec_28_27" as const;
export const PAYROLL_CYCLE_CALENDAR_MONTH = "calendar_month" as const;

export const PAYROLL_CYCLES = [PAYROLL_CYCLE_FEC_28_27, PAYROLL_CYCLE_CALENDAR_MONTH] as const;
export type PayrollCycleKind = (typeof PAYROLL_CYCLES)[number];

export function normalizePayrollCycle(value: unknown): PayrollCycleKind {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (v === PAYROLL_CYCLE_CALENDAR_MONTH || v === "calendar" || v === "1_31") {
    return PAYROLL_CYCLE_CALENDAR_MONTH;
  }
  return PAYROLL_CYCLE_FEC_28_27;
}

/** Bounds for a named YYYY-MM under the given cycle. */
export function periodBoundsForCycle(
  month: string,
  cycle: PayrollCycleKind | string | null | undefined,
): { month: string; dateFrom: string; dateTo: string; cycle: PayrollCycleKind } {
  const ym = month.slice(0, 7);
  const kind = normalizePayrollCycle(cycle);
  if (kind === PAYROLL_CYCLE_CALENDAR_MONTH) {
    const [year, mo] = ym.split("-").map(Number);
    if (!year || !mo) return { month: ym, dateFrom: `${ym}-01`, dateTo: `${ym}-01`, cycle: kind };
    const last = new Date(Date.UTC(year, mo, 0)).getUTCDate();
    return {
      month: ym,
      dateFrom: `${ym}-01`,
      dateTo: `${ym}-${String(last).padStart(2, "0")}`,
      cycle: kind,
    };
  }
  const fec = monthBounds(ym);
  return { month: ym, dateFrom: fec.dateFrom, dateTo: fec.dateTo, cycle: kind };
}
