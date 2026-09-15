import {
  AGGREGATOR_METHOD_CHANGE_ISO_WEEK,
  DORMANT_DEFAULT_ACTIONS,
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
  promocode?: string | null;
  description?: string | null;
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
  corporate_redemptions: number;
  aggregator_redemptions: number;
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

function redemptionsByPartner(rows: readonly DealMetricRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of partnerTotalRows(rows)) {
    if (!r.partner_name) continue;
    map.set(r.partner_name, (map.get(r.partner_name) ?? 0) + (r.times_used || 0));
  }
  return map;
}

export function partnersWithNoUsageThisMonth(monthRows: readonly DealMetricRow[]): string[] {
  const active = new Set(
    [...redemptionsByPartner(monthRows).entries()].filter(([, n]) => n > 0).map(([name]) => name),
  );
  return PARTNER_MASTER.map((p) => p.name).filter((n) => !active.has(n));
}

export type DormantKind = "month" | "week";

export interface DormantPartner {
  partner_name: string;
  redemption_mechanism: string;
  kind: DormantKind;
  week_redemptions: number;
  month_redemptions: number;
  /** Suggested ops action or status note. */
  action: string;
}

function defaultDormantAction(name: string, kind: DormantKind, monthRedemptions: number): string {
  const known = DORMANT_DEFAULT_ACTIONS[name];
  if (known) return known;
  if (kind === "week") {
    return monthRedemptions === 1
      ? "One redemption earlier in the month; no action needed yet"
      : `${monthRedemptions} redemptions earlier in the month; no action needed yet`;
  }
  const mech = PARTNER_MASTER.find((p) => p.name === name)?.redemption_mechanism ?? "";
  if (/staff\s*id/i.test(mech)) return "Send an offer reminder to the HR contact";
  if (/app|pin|scity/i.test(mech)) return "Confirm the deal is visible in the app";
  return "Confirm the offer is published and promoted";
}

/**
 * Master partners with zero week redemptions.
 * `month` = also zero MTD; `week` = MTD > 0 (quiet this week only).
 * Falls back to week rows as MTD when month data is empty (same as no-usage list).
 */
export function dormantPartners(
  weekRows: readonly DealMetricRow[],
  monthRows: readonly DealMetricRow[],
): DormantPartner[] {
  const weekMap = redemptionsByPartner(weekRows);
  const monthSource = monthRows.length ? monthRows : weekRows;
  const monthMap = redemptionsByPartner(monthSource);
  const hasMonthData = monthRows.length > 0;

  return PARTNER_MASTER.map((p) => {
    const week_redemptions = weekMap.get(p.name) ?? 0;
    const month_redemptions = monthMap.get(p.name) ?? 0;
    if (week_redemptions > 0) return null;
    const kind: DormantKind = !hasMonthData || month_redemptions === 0 ? "month" : "week";
    return {
      partner_name: p.name,
      redemption_mechanism: p.redemption_mechanism,
      kind,
      week_redemptions,
      month_redemptions,
      action: defaultDormantAction(p.name, kind, month_redemptions),
    };
  })
    .filter((p): p is DormantPartner => p != null)
    .sort((a, b) => {
      // Month-long dormant first, then week-quiet; stable master order within each band.
      if (a.kind !== b.kind) return a.kind === "month" ? -1 : 1;
      const ai = PARTNER_MASTER.findIndex((p) => p.name === a.partner_name);
      const bi = PARTNER_MASTER.findIndex((p) => p.name === b.partner_name);
      return ai - bi;
    });
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
  const map = new Map<
    string,
    {
      redemptions: number;
      tickets: number;
      discount: number;
      corporate_redemptions: number;
      aggregator_redemptions: number;
    }
  >();
  for (const r of scoped) {
    const venue = (r.venue || "Not specified").trim() || "Not specified";
    const cur = map.get(venue) ?? {
      redemptions: 0,
      tickets: 0,
      discount: 0,
      corporate_redemptions: 0,
      aggregator_redemptions: 0,
    };
    cur.redemptions += r.times_used || 0;
    cur.tickets += r.tickets || 0;
    cur.discount += r.total_discount || 0;
    if (r.category === "Corporate discount") cur.corporate_redemptions += r.times_used || 0;
    if (r.category === "Aggregator BOGO") cur.aggregator_redemptions += r.times_used || 0;
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
      corporate_redemptions: v.corporate_redemptions,
      aggregator_redemptions: v.aggregator_redemptions,
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
): Array<{
  period_month: string;
  corporate_discount: number;
  aggregator_discount: number;
  corporate_redemptions: number;
  aggregator_redemptions: number;
}> {
  const map = new Map<
    string,
    {
      corporate_discount: number;
      aggregator_discount: number;
      corporate_redemptions: number;
      aggregator_redemptions: number;
    }
  >();
  for (const r of partnerTotalRows(rows)) {
    const m = r.period_month;
    if (!m) continue;
    const cur = map.get(m) ?? {
      corporate_discount: 0,
      aggregator_discount: 0,
      corporate_redemptions: 0,
      aggregator_redemptions: 0,
    };
    if (r.category === "Corporate discount") {
      cur.corporate_discount += r.total_discount || 0;
      cur.corporate_redemptions += r.times_used || 0;
    }
    if (r.category === "Aggregator BOGO") {
      cur.aggregator_discount += r.total_discount || 0;
      cur.aggregator_redemptions += r.times_used || 0;
    }
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

export interface LoyaltyInHouseRow {
  promocode: string;
  description: string | null;
  venue: string;
  week_redemptions: number;
  week_tickets: number;
  month_redemptions: number;
  month_tickets: number;
  /** Previous full calendar month (from trend), when provided. */
  prev_month_redemptions: number;
}

/** Internal / promotion codes (loyalty, cafe, karak) — excluded from partner KPIs. */
export function loyaltyInHouseByCode(
  weekRows: readonly DealMetricRow[],
  monthRows: readonly DealMetricRow[],
  prevMonthRows: readonly DealMetricRow[] = [],
): LoyaltyInHouseRow[] {
  type Acc = LoyaltyInHouseRow;
  const map = new Map<string, Acc>();
  const touch = (r: DealMetricRow, which: "week" | "month" | "prev") => {
    const code = (r.promocode || "").trim() || "(unknown)";
    const key = code.toLowerCase();
    const cur = map.get(key) ?? {
      promocode: code,
      description: r.description ?? null,
      venue: (r.venue || "Not specified").trim() || "Not specified",
      week_redemptions: 0,
      week_tickets: 0,
      month_redemptions: 0,
      month_tickets: 0,
      prev_month_redemptions: 0,
    };
    if (r.description && !cur.description) cur.description = r.description;
    if (r.venue) cur.venue = r.venue;
    if (which === "week") {
      cur.week_redemptions += r.times_used || 0;
      cur.week_tickets += r.tickets || 0;
    } else if (which === "month") {
      cur.month_redemptions += r.times_used || 0;
      cur.month_tickets += r.tickets || 0;
    } else {
      cur.prev_month_redemptions += r.times_used || 0;
    }
    map.set(key, cur);
  };
  for (const r of internalPromotionRows(weekRows)) touch(r, "week");
  for (const r of internalPromotionRows(monthRows)) touch(r, "month");
  for (const r of internalPromotionRows(prevMonthRows)) touch(r, "prev");
  return [...map.values()].sort(
    (a, b) =>
      b.week_redemptions - a.week_redemptions ||
      b.month_redemptions - a.month_redemptions ||
      a.promocode.localeCompare(b.promocode),
  );
}
