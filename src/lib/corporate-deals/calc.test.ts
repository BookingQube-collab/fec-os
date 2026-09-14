import { describe, expect, it } from "vitest";

import {
  activePartnerCount,
  aggregatorShare,
  comparePeriods,
  metricTotals,
  partnerTotalRows,
  rollupByPartner,
} from "./calc";
import { PARTNER_MASTER } from "./constants";
import { classifyRow, parsePromoExportCsv, stripHtmlDescription } from "./parse";
import type { DealMetricRow } from "./calc";

/** Synthetic W37 partner totals matching workbook acceptance. */
function w37Rows(): DealMetricRow[] {
  // 12 active master partners; 68% aggregator share on QAR 12,750.50
  const aggDiscount = 12750.5 * 0.68;
  const corpDiscount = 12750.5 - aggDiscount;
  return [
    { partner_name: "Urban Point", category: "Aggregator BOGO", times_used: 80, tickets: 240, total_discount: aggDiscount * 0.55 },
    { partner_name: "My Book", category: "Aggregator BOGO", times_used: 30, tickets: 90, total_discount: aggDiscount * 0.25 },
    { partner_name: "Entertainer", category: "Aggregator BOGO", times_used: 14, tickets: 42, total_discount: aggDiscount * 0.12 },
    { partner_name: "Classmate", category: "Aggregator BOGO", times_used: 8, tickets: 24, total_discount: aggDiscount * 0.08 },
    { partner_name: "Al Jazeera Imtiyazat", category: "Corporate discount", times_used: 20, tickets: 60, total_discount: corpDiscount * 0.3 },
    { partner_name: "QIB", category: "Corporate discount", times_used: 15, tickets: 45, total_discount: corpDiscount * 0.2 },
    { partner_name: "Qatar Airways", category: "Corporate discount", times_used: 10, tickets: 30, total_discount: corpDiscount * 0.15 },
    { partner_name: "Dar App", category: "Corporate discount", times_used: 8, tickets: 20, total_discount: corpDiscount * 0.1 },
    { partner_name: "Imtyazat", category: "Corporate discount", times_used: 4, tickets: 12, total_discount: corpDiscount * 0.08 },
    { partner_name: "MyBenefit", category: "Corporate discount", times_used: 3, tickets: 8, total_discount: corpDiscount * 0.07 },
    { partner_name: "DHL", category: "Corporate discount", times_used: 1, tickets: 3, total_discount: corpDiscount * 0.05 },
    { partner_name: "QNB Rewards", category: "Corporate discount", times_used: 1, tickets: 2, total_discount: corpDiscount * 0.05 },
    // Internal — must not affect partner totals
    {
      partner_name: null,
      category: "Internal / promotion",
      times_used: 50,
      tickets: 50,
      total_discount: 5000,
    },
    // Unmapped — visible, not silently in partner KPIs... wait, "Not on master" is in partner totals.
    // Unmapped is NOT in PARTNER_TOTAL_CATEGORIES — excluded from KPI but must surface.
    { partner_name: null, category: "Unmapped", times_used: 7, tickets: 7, total_discount: 100 },
  ];
}

function sepMtdRows(): DealMetricRow[] {
  // W37 (12 active) + Huawei + Bein = 14; pad volume on existing partners to hit MTD totals
  const w37 = w37Rows().filter((r) => r.category !== "Internal / promotion" && r.category !== "Unmapped");
  const extra: DealMetricRow[] = [
    { partner_name: "Huawei", category: "Corporate discount", times_used: 1, tickets: 1, total_discount: 1 },
    { partner_name: "Bein", category: "Corporate discount", times_used: 1, tickets: 1, total_discount: 1 },
    { partner_name: "Urban Point", category: "Aggregator BOGO", times_used: 50, tickets: 151, total_discount: 2800 },
    { partner_name: "Al Jazeera Imtiyazat", category: "Corporate discount", times_used: 16, tickets: 40, total_discount: 1151.7 },
  ];
  const combined = [...w37, ...extra];
  const t = metricTotals(combined);
  combined.push({
    partner_name: "Urban Point",
    category: "Aggregator BOGO",
    times_used: 350 - t.redemptions,
    tickets: 1037 - t.tickets,
    total_discount: 21102.2 - t.discount,
  });
  return combined;
}

describe("corporate deals parse", () => {
  it("strips HTML and nbsp from description", () => {
    expect(stripHtmlDescription("<b>QIB</b>&nbsp;staff")).toBe("QIB staff");
  });

  it("parses BookingQube-shaped CSV", () => {
    const csv = `promocode_id,promocode,description,company_name,period_week,times_used,booking_lines,tickets,total_discount
1,ENT01,<p>Entertainer</p>,NULL,2026-W37,2,2,6,40.5
2,LOYAL,loyalty pass cafe,,2026-W37,1,1,1,10`;
    const rows = parsePromoExportCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].company_name).toBeNull();
    expect(rows[0].description).toBe("Entertainer");
    expect(rows[0].total_discount).toBe(40.5);
  });

  it("defaults unknown codes to Unmapped", () => {
    const hit = classifyRow({ promocode: "ZZZ999", description: "mystery deal" }, new Map());
    expect(hit.category).toBe("Unmapped");
  });

  it("flags internal / promotion from description", () => {
    const hit = classifyRow({ promocode: "JR1", description: "junior media-pass" }, new Map());
    expect(hit.category).toBe("Internal / promotion");
  });
});

describe("corporate deals calc — acceptance W37 / Sep MTD", () => {
  it("excludes Internal / promotion and Unmapped from partner KPI totals", () => {
    const rows = w37Rows();
    expect(partnerTotalRows(rows).every((r) => r.category !== "Internal / promotion")).toBe(true);
    expect(partnerTotalRows(rows).every((r) => r.category !== "Unmapped")).toBe(true);
    const t = metricTotals(rows);
    expect(t.redemptions).toBe(194);
    expect(t.tickets).toBe(576);
    expect(t.discount).toBeCloseTo(12750.5, 2);
    expect(activePartnerCount(rows)).toBe(12);
    expect(aggregatorShare(rows)).toBeCloseTo(0.68, 2);
  });

  it("Sep MTD hits acceptance totals with 14 active partners", () => {
    const rows = sepMtdRows();
    const t = metricTotals(rows);
    expect(t.redemptions).toBe(350);
    expect(t.tickets).toBe(1037);
    expect(t.discount).toBeCloseTo(21102.2, 2);
    expect(activePartnerCount(rows)).toBe(14);
  });

  it("previous-week message before week 2", () => {
    const cmp = comparePeriods(w37Rows(), null);
    expect(cmp.message).toMatch(/week 2/i);
    expect(cmp.delta_redemptions).toBeNull();
  });

  it("rolls all 21 master partners including zero usage", () => {
    const rollup = rollupByPartner(w37Rows());
    expect(rollup).toHaveLength(PARTNER_MASTER.length);
    expect(rollup.filter((p) => p.status === "Active")).toHaveLength(12);
  });
});
