import { APPROVED_PR_STATUSES, PENDING_PR_STATUSES } from "@/lib/events/constants";

export const COMMITTED_PR_STATUSES = new Set<string>([
  ...PENDING_PR_STATUSES,
  ...APPROVED_PR_STATUSES,
]);

export interface LineAmounts {
  original_amount?: number;
  approved_changes?: number;
  revised_amount?: number;
  committed_amount?: number;
  actual_amount?: number;
  forecast_amount?: number;
  category_code?: string;
  category_id?: string;
}

export interface LineTotals {
  original: number;
  approvedChanges: number;
  revised: number;
  committed: number;
  actual: number;
  forecast: number;
  varianceForecast: number;
  varianceCommitted: number;
  remaining: number;
}

export interface RevenueInputs {
  contractValue: number;
  additionalRevenue: number;
  changeOrders: number;
  discounts: number;
  taxes: number;
}

export interface InvoiceAmounts {
  status: string;
  base_amount?: number;
  paid_amount?: number;
}

export interface BudgetAlert {
  kind: "line_threshold" | "forecast_over_revised" | "contingency_usage" | "pr_exceeds_category";
  categoryId?: string;
  categoryCode?: string;
  lineId?: string;
  prId?: string;
  amount: number;
  pct?: number;
}

export interface LinkedPrInput {
  id: string;
  status: string;
  total_amount: number;
  cost_category_id: string | null;
}

export function money(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function revisedBudget(original: number, approvedChanges: number) {
  return money(original) + money(approvedChanges);
}

export function remainingBudget(revised: number, committed: number) {
  return money(revised) - money(committed);
}

export type BudgetHealth = "under" | "on" | "over";

/** Under / on / over from remaining (revised − committed) and optional forecast. */
export function budgetHealth(input: {
  revised: number;
  committed: number;
  forecast?: number;
  tolerance?: number;
}): BudgetHealth | null {
  const revised = money(input.revised);
  const committed = money(input.committed);
  const forecast = input.forecast == null ? null : money(input.forecast);
  const tolerance = input.tolerance ?? 0.005;
  if (revised <= 0 && committed <= 0 && (forecast == null || forecast <= 0)) return null;
  const rem = remainingBudget(revised, committed);
  const forecastOver = forecast != null && varianceForecast(revised, forecast) < -tolerance;
  if (rem < -tolerance || forecastOver) return "over";
  if (Math.abs(rem) <= tolerance) return "on";
  return "under";
}

export function overBudgetLines<T extends LineAmounts>(lines: T[]): T[] {
  return lines.filter((line) => {
    const revised = lineRevised(line);
    return (
      remainingBudget(revised, money(line.committed_amount)) < -0.005 ||
      varianceForecast(revised, money(line.forecast_amount)) < -0.005
    );
  });
}

export function unlinkedPrs<T extends { cost_category_id: string | null; status: string }>(prs: T[]): T[] {
  return prs.filter((pr) => !pr.cost_category_id && pr.status !== "cancelled" && pr.status !== "rejected");
}

export function varianceForecast(revised: number, forecast: number) {
  return money(revised) - money(forecast);
}

export function varianceCommitted(revised: number, committed: number) {
  return money(revised) - money(committed);
}

/** Underspend vs revised budget = revised − actual. Negative means overspend. */
export function savedVsBudget(revised: number, actual: number) {
  return money(revised) - money(actual);
}

export function savedVsBudgetPct(revised: number, actual: number): number | null {
  const rev = money(revised);
  if (rev <= 0) return null;
  return (savedVsBudget(rev, actual) / rev) * 100;
}

export function portfolioLineFinance(lines: LineAmounts[], extraCommitted = 0) {
  const t = sumBudgetLines(lines);
  return {
    revised: t.revised,
    actual: t.actual,
    committed: t.committed + money(extraCommitted),
    savedVsBudget: savedVsBudget(t.revised, t.actual),
  };
}

export function finalRevenue(r: RevenueInputs) {
  return money(r.contractValue) + money(r.additionalRevenue) + money(r.changeOrders) - money(r.discounts) + money(r.taxes);
}

export function marginPct(revenue: number, cost: number): number | null {
  if (revenue <= 0) return null;
  return ((revenue - cost) / revenue) * 100;
}

export function lineRevised(line: LineAmounts) {
  if (line.approved_changes != null) return revisedBudget(money(line.original_amount), money(line.approved_changes));
  return money(line.revised_amount);
}

export function sumBudgetLines(lines: LineAmounts[]): LineTotals {
  const totals: LineTotals = {
    original: 0,
    approvedChanges: 0,
    revised: 0,
    committed: 0,
    actual: 0,
    forecast: 0,
    varianceForecast: 0,
    varianceCommitted: 0,
    remaining: 0,
  };
  for (const line of lines) {
    const original = money(line.original_amount);
    const approved = line.approved_changes != null ? money(line.approved_changes) : money(line.revised_amount) - original;
    const revised = revisedBudget(original, approved);
    totals.original += original;
    totals.approvedChanges += approved;
    totals.revised += revised;
    totals.committed += money(line.committed_amount);
    totals.actual += money(line.actual_amount);
    totals.forecast += money(line.forecast_amount);
  }
  totals.varianceForecast = varianceForecast(totals.revised, totals.forecast);
  totals.varianceCommitted = varianceCommitted(totals.revised, totals.committed);
  totals.remaining = remainingBudget(totals.revised, totals.committed);
  return totals;
}

export function outstandingReceivable(invoices: InvoiceAmounts[]): number | null {
  if (!invoices.length) return null;
  return invoices
    .filter((inv) => inv.status !== "draft")
    .reduce((sum, inv) => sum + Math.max(0, money(inv.base_amount) - money(inv.paid_amount)), 0);
}

export function recognizedRevenue(invoices: InvoiceAmounts[]) {
  return invoices.reduce((sum, inv) => sum + money(inv.paid_amount), 0);
}

export function isCommittedPr(status: string) {
  return COMMITTED_PR_STATUSES.has(status) && status !== "draft" && status !== "returned";
}

export function prCommittedTotal(prs: LinkedPrInput[]) {
  return prs.filter((pr) => isCommittedPr(pr.status)).reduce((sum, pr) => sum + money(pr.total_amount), 0);
}

export function evaluateBudgetAlerts(input: {
  lines: Array<LineAmounts & { id?: string }>;
  prs?: LinkedPrInput[];
  lineThresholdPct?: number;
  contingencyUsagePct?: number;
}): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  const threshold = money(input.lineThresholdPct);
  const contingencyCap = money(input.contingencyUsagePct) || 80;

  for (const line of input.lines) {
    const revised = lineRevised(line);
    const forecast = money(line.forecast_amount);
    if (forecast > revised + 0.005) {
      alerts.push({
        kind: "forecast_over_revised",
        lineId: line.id,
        categoryId: line.category_id,
        categoryCode: line.category_code,
        amount: forecast - revised,
      });
    }
    if (revised > 0 && threshold > 0) {
      const overrunPct = ((forecast - revised) / revised) * 100;
      if (overrunPct > threshold + 0.005) {
        alerts.push({
          kind: "line_threshold",
          lineId: line.id,
          categoryId: line.category_id,
          categoryCode: line.category_code,
          amount: forecast - revised,
          pct: overrunPct,
        });
      }
    }
  }

  const contingency = input.lines.filter((l) => l.category_code === "contingency");
  if (contingency.length) {
    const t = sumBudgetLines(contingency);
    if (t.revised > 0) {
      const used = Math.max(t.forecast, t.actual);
      const pct = (used / t.revised) * 100;
      if (pct >= contingencyCap - 0.005) {
        alerts.push({
          kind: "contingency_usage",
          categoryCode: "contingency",
          amount: used,
          pct,
        });
      }
    }
  }

  const prs = input.prs ?? [];
  const byCat = new Map<string, number>();
  for (const line of input.lines) {
    if (!line.category_id) continue;
    byCat.set(line.category_id, (byCat.get(line.category_id) ?? 0) + lineRevised(line));
  }
  const committedByCat = new Map<string, number>();
  for (const line of input.lines) {
    if (!line.category_id) continue;
    committedByCat.set(line.category_id, (committedByCat.get(line.category_id) ?? 0) + money(line.committed_amount));
  }
  for (const pr of prs) {
    if (!pr.cost_category_id || !isCommittedPr(pr.status)) continue;
    committedByCat.set(pr.cost_category_id, (committedByCat.get(pr.cost_category_id) ?? 0) + money(pr.total_amount));
  }
  for (const pr of prs) {
    if (!pr.cost_category_id || pr.status === "cancelled" || pr.status === "rejected") continue;
    const revised = byCat.get(pr.cost_category_id);
    if (revised == null) continue;
    const others = (committedByCat.get(pr.cost_category_id) ?? 0) - (isCommittedPr(pr.status) ? money(pr.total_amount) : 0);
    const after = others + money(pr.total_amount);
    if (after > revised + 0.005) {
      alerts.push({
        kind: "pr_exceeds_category",
        prId: pr.id,
        categoryId: pr.cost_category_id,
        amount: after - revised,
      });
    }
  }

  return alerts;
}
