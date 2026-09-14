import {
  AGGREGATOR_METHOD_CHANGE_ISO_WEEK,
  PARTNER_MASTER,
  PARTNER_TOTAL_CATEGORIES,
  type DealCategory,
} from "./constants";

export interface DealMetricRow {
  times_used: number;
  tickets: number;
  total_discount: number;
  partner_name: string | null;
  category: DealCategory;
  venue?: string | null;
  iso_week?: string | null;
  period_month?: string | null;
}

export interface MetricTotals {
  redemptions: number;
  tickets: number;
  discount: number;
  discount_per_redemption: number;
}

export interface PartnerRollup extends MetricTotals {
  partner_name: string;
  category: DealCategory;
  status: "Active" | "No usage";
}

export interface CategorySplit {
  category: DealCategory;
  redemptions: number;
  tickets: number;
  discount: number;
}

export interface VenueSplit extends MetricTotals {
  venue: string;
  share: number;
}

export interface PeriodCompare {
  current: MetricTotals;
  previous: MetricTotals | null;
  delta_redemptions: number | null;
  delta_tickets: number | null;
  delta_discount: number | null;
  message: string | null;
}

function sum(rows: DealMetricRow[], key: keyof Pick<DealMetricRow, "times_used" | "tickets" | "total_discount">) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export function partnerTotalRows(rows: readonly DealMetricRow[]): DealMetricRow[] {
  return rows.filter((r) => PARTNER_TOTAL_CATEGORIES.has(r.category));
}

export function metricTotals(rows: readonly DealMetricRow[]): MetricTotals {
  const scoped = partnerTotalRows(rows);
  const redemptions = sum(scoped, "times_used");
  const tickets = sum(scoped, "tickets");
  const discount = sum(scoped, "total_discount");
  return {
    redemptions,
    tickets,
    discount,
    discount_per_redemption: redemptions > 0 ? discount / redemptions : 0,
  };
}

export function aggregatorShare(rows: readonly DealMetricRow[]): number {
  const scoped = partnerTotalRows(rows);
  const total = sum(scoped, "total_discount");
  if (total <= 0) return 0;
  const bogo = sum(
    scoped.filter((r) => r.category === "Aggregator BOGO"),
    "total_discount",
  );
  return bogo / total;
}

export function activePartnerCount(rows: readonly DealMetricRow[], masterNames = PARTNER_MASTER.map((p) => p.name)): number {
  const scoped = partnerTotalRows(rows);
  const used = new Set(
    scoped.filter((r) => (r.times_used || 0) > 0 && r.partner_name).map((r) => r.partner_name as string),
  );
  return masterNames.filter((n) => used.has(n)).length;
}

export function rollupByPartner(
  rows: readonly DealMetricRow[],
  monthRowsForStatus?: readonly DealMetricRow[],
): PartnerRollup[] {
  const scoped = partnerTotalRows(rows);
  const monthScoped = monthRowsForStatus ? partnerTotalRows(monthRowsForStatus) : scoped;
  const monthMap = new Map<string, number>();
  for (const r of monthScoped) {
    if (!r.partner_name) continue;
    monthMap.set(r.partner_name, (monthMap.get(r.partner_name) ?? 0) + (r.times_used || 0));
  }

  const map = new Map<string, PartnerRollup>();
  for (const r of scoped) {
    if (!r.partner_name) continue;
    const cur = map.get(r.partner_name) ?? {
      partner_name: r.partner_name,
      category: r.category,
      redemptions: 0,
      tickets: 0,
      discount: 0,
      discount_per_redemption: 0,
      status: "No usage" as const,
    };
    cur.redemptions += r.times_used || 0;
    cur.tickets += r.tickets || 0;
    cur.discount += r.total_discount || 0;
    cur.category = r.category;
    map.set(r.partner_name, cur);
  }

  for (const name of PARTNER_MASTER.map((p) => p.name)) {
    if (!map.has(name)) {
      const master = PARTNER_MASTER.find((p) => p.name === name)!;
      map.set(name, {
        partner_name: name,
        category: master.category,
        redemptions: 0,
        tickets: 0,
        discount: 0,
        discount_per_redemption: 0,
        status: "No usage",
      });
    }
  }

  return [...map.values()]
    .map((p) => ({
      ...p,
      discount_per_redemption: p.redemptions > 0 ? p.discount / p.redemptions : 0,
      status: (monthMap.get(p.partner_name) ?? 0) > 0 ? ("Active" as const) : ("No usage" as const),
    }))
    .sort((a, b) => b.redemptions - a.redemptions || a.partner_name.localeCompare(b.partner_name));
}

export function partnersWithNoUsageThisMonth(monthRows: readonly DealMetricRow[]): string[] {
  const active = new Set(
    partnerTotalRows(monthRows)
      .filter((r) => (r.times_used || 0) > 0 && r.partner_name)
      .map((r) => r.partner_name as string),
  );
  return PARTNER_MASTER.map((p) => p.name).filter((n) => !active.has(n));
}

export function categorySplit(rows: readonly DealMetricRow[]): CategorySplit[] {
  const map = new Map<DealCategory, CategorySplit>();
  for (const r of rows) {
    const cur = map.get(r.category) ?? {
      category: r.category,
      redemptions: 0,
      tickets: 0,
      discount: 0,
    };
    cur.redemptions += r.times_used || 0;
    cur.tickets += r.tickets || 0;
    cur.discount += r.total_discount || 0;
    map.set(r.category, cur);
  }
  return [...map.values()].sort((a, b) => b.discount - a.discount);
}

/** Partner-total redemptions by venue (event_title-derived). Share of discount. */
export function rollupByVenue(rows: readonly DealMetricRow[]): VenueSplit[] {
  const scoped = partnerTotalRows(rows);
  const map = new Map<string, { redemptions: number; tickets: number; discount: number }>();
  for (const r of scoped) {
    const venue = (r.venue || "Not specified").trim() || "Not specified";
    const cur = map.get(venue) ?? { redemptions: 0, tickets: 0, discount: 0 };
    cur.redemptions += r.times_used || 0;
    cur.tickets += r.tickets || 0;
    cur.discount += r.total_discount || 0;
    map.set(venue, cur);
  }
  const totalRedemptions = [...map.values()].reduce((s, v) => s + v.redemptions, 0);
  return [...map.entries()]
    .map(([venue, v]) => ({
      venue,
      redemptions: v.redemptions,
      tickets: v.tickets,
      discount: v.discount,
      discount_per_redemption: v.redemptions > 0 ? v.discount / v.redemptions : 0,
      // PDF "Share" is of partner redemptions (67/194 ≈ 35%), not discount
      share: totalRedemptions > 0 ? v.redemptions / totalRedemptions : 0,
    }))
    .sort((a, b) => b.redemptions - a.redemptions || a.venue.localeCompare(b.venue));
}

export function comparePeriods(
  currentRows: readonly DealMetricRow[],
  previousRows: readonly DealMetricRow[] | null,
  opts?: { requirePrevious?: boolean; emptyMessage?: string },
): PeriodCompare {
  const current = metricTotals(currentRows);
  if (!previousRows) {
    return {
      current,
      previous: null,
      delta_redemptions: null,
      delta_tickets: null,
      delta_discount: null,
      message: opts?.emptyMessage ?? "Previous-week comparison available from week 2.",
    };
  }
  const previous = metricTotals(previousRows);
  return {
    current,
    previous,
    delta_redemptions: current.redemptions - previous.redemptions,
    delta_tickets: current.tickets - previous.tickets,
    delta_discount: current.discount - previous.discount,
    message: null,
  };
}

export function corporateVsAggregator(rows: readonly DealMetricRow[]): {
  corporate: MetricTotals;
  aggregator: MetricTotals;
  share: number;
} {
  const scoped = partnerTotalRows(rows);
  const corporate = metricTotals(scoped.filter((r) => r.category === "Corporate discount"));
  const aggregator = metricTotals(scoped.filter((r) => r.category === "Aggregator BOGO"));
  return { corporate, aggregator, share: aggregatorShare(scoped) };
}

export function weeklyTrend(
  rows: readonly DealMetricRow[],
  year: number,
): Array<{ iso_week: string; corporate_discount: number; aggregator_discount: number; redemptions: number }> {
  const prefix = `${year}-W`;
  const map = new Map<string, { corporate_discount: number; aggregator_discount: number; redemptions: number }>();
  for (const r of partnerTotalRows(rows)) {
    const w = r.iso_week;
    if (!w || !w.startsWith(prefix)) continue;
    const cur = map.get(w) ?? { corporate_discount: 0, aggregator_discount: 0, redemptions: 0 };
    cur.redemptions += r.times_used || 0;
    if (r.category === "Corporate discount") cur.corporate_discount += r.total_discount || 0;
    if (r.category === "Aggregator BOGO") cur.aggregator_discount += r.total_discount || 0;
    map.set(w, cur);
  }
  return [...map.entries()]
    .map(([iso_week, v]) => ({ iso_week, ...v }))
    .sort((a, b) => a.iso_week.localeCompare(b.iso_week));
}

export function monthlyTrend(
  rows: readonly DealMetricRow[],
  lastN = 13,
): Array<{ period_month: string; corporate_discount: number; aggregator_discount: number }> {
  const map = new Map<string, { corporate_discount: number; aggregator_discount: number }>();
  for (const r of partnerTotalRows(rows)) {
    const m = r.period_month;
    if (!m) continue;
    const cur = map.get(m) ?? { corporate_discount: 0, aggregator_discount: 0 };
    if (r.category === "Corporate discount") cur.corporate_discount += r.total_discount || 0;
    if (r.category === "Aggregator BOGO") cur.aggregator_discount += r.total_discount || 0;
    map.set(m, cur);
  }
  return [...map.entries()]
    .map(([period_month, v]) => ({ period_month, ...v }))
    .sort((a, b) => a.period_month.localeCompare(b.period_month))
    .slice(-lastN);
}

export function aggregatorMethodChangeCaveat(isoWeek: string): string | null {
  if (isoWeek >= AGGREGATOR_METHOD_CHANGE_ISO_WEEK) {
    return "Before May 2026 aggregators used single-use 100% codes; from May 2026 BOGO+staff-ID — tickets/redemption jumps; do not present as growth.";
  }
  return null;
}

export function unmappedCodes(rows: readonly DealMetricRow[]): DealMetricRow[] {
  return rows.filter((r) => r.category === "Unmapped");
}

export function internalPromotionRows(rows: readonly DealMetricRow[]): DealMetricRow[] {
  return rows.filter((r) => r.category === "Internal / promotion");
}
