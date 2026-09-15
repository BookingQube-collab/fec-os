import { describe, expect, it } from "vitest";

import {
  activePartnerCount,
  aggregatorShare,
  comparePeriods,
  dormantPartners,
  loyaltyInHouseByCode,
  metricTotals,
  partnerTotalRows,
  partnersWithNoUsageThisMonth,
  rollupByPartner,
  rollupByVenue,
} from "./calc";
import { PARTNER_MASTER } from "./constants";
import { classifyRow, parsePromoExportCsv, stripHtmlDescription, venueFromEventTitle } from "./parse";
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
    {
      partner_name: null,
      category: "Internal / promotion",
      times_used: 50,
      tickets: 50,
      total_discount: 5000,
    },
    { partner_name: null, category: "Unmapped", times_used: 7, tickets: 7, total_discount: 100 },
  ];
}

/** Revised PDF W37 venue split (partner totals only). */
function w37VenueRows(): DealMetricRow[] {
  return [
    {
      partner_name: "Imtyazat",
      category: "Corporate discount",
      venue: "Urban Arena",
      times_used: 67,
      tickets: 241,
      total_discount: 3914.75,
    },
    {
      partner_name: "Urban Point",
      category: "Aggregator BOGO",
      venue: "InflataPark",
      times_used: 58,
      tickets: 148,
      total_discount: 3273.5,
    },
    {
      partner_name: "Qatar Airways",
      category: "Corporate discount",
      venue: "Kids City Driving School",
      times_used: 45,
      tickets: 158,
      total_discount: 3230.75,
    },
    {
      partner_name: "My Book",
      category: "Aggregator BOGO",
      venue: "Crayons & Bricks Vendome",
      times_used: 24,
      tickets: 29,
      total_discount: 2331.5,
    },
  ];
}

function sepMtdRows(): DealMetricRow[] {
  // Revised PDF Sep MTD: 351 / 1,042 / 21,132.95 / 14 active
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
    times_used: 351 - t.redemptions,
    tickets: 1042 - t.tickets,
    total_discount: 21132.95 - t.discount,
  });
  return combined;
}

describe("corporate deals parse", () => {
  it("strips HTML and nbsp from description", () => {
    expect(stripHtmlDescription("<b>QIB</b>&nbsp;staff")).toBe("QIB staff");
  });

  it("parses event-wise BookingQube CSV and maps event_title to venue", () => {
    const csv = `promocode_id,promocode,description,company_name,event_id,event_title,period_week,times_used,booking_lines,tickets,total_discount
1,ENT01,<p>Entertainer</p>,NULL,e1,Urban Arena - Doha Mall,2026-W37,2,2,6,40.5
2,LOYAL,loyalty pass cafe,,e2,Kids City Driving School,2026-W37,1,1,1,10`;
    const rows = parsePromoExportCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].event_title).toBe("Urban Arena - Doha Mall");
    expect(rows[0].company_name).toBeNull();
    expect(rows[0].description).toBe("Entertainer");
    expect(rows[0].total_discount).toBe(40.5);
    const cls = classifyRow(rows[0], new Map());
    expect(cls.venue).toBe("Urban Arena");
  });

  it("maps event titles to PDF venue labels", () => {
    expect(venueFromEventTitle("Urban Arena - Doha Mall")).toBe("Urban Arena");
    expect(venueFromEventTitle("Inflatapark - City Center")).toBe("InflataPark");
    expect(venueFromEventTitle("Kids City Driving School")).toBe("Kids City Driving School");
    expect(venueFromEventTitle("Crayons & Bricks - Vendome Mall")).toBe("Crayons & Bricks Vendome");
    expect(venueFromEventTitle("KDS")).toBe("Kids City Driving School");
  });

  it("defaults unknown codes to Unmapped", () => {
    const hit = classifyRow({ promocode: "ZZZ999", description: "mystery deal", event_title: null }, new Map());
    expect(hit.category).toBe("Unmapped");
  });

  it("flags internal / promotion from description", () => {
    const hit = classifyRow({ promocode: "JR1", description: "junior media-pass", event_title: null }, new Map());
    expect(hit.category).toBe("Internal / promotion");
  });

  it("export event_title wins over code-mapping venue", () => {
    const map = new Map([
      [
        "ent01",
        {
          promocode: "ENT01",
          partner_name: "Entertainer",
          category: "Aggregator BOGO" as const,
          venue: "Cafe",
        },
      ],
    ]);
    const hit = classifyRow(
      { promocode: "ENT01", description: "Entertainer", event_title: "InflataPark" },
      map,
    );
    expect(hit.venue).toBe("InflataPark");
    expect(hit.partner_name).toBe("Entertainer");
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

  it("Sep MTD hits revised PDF totals with 14 active partners", () => {
    const rows = sepMtdRows();
    const t = metricTotals(rows);
    expect(t.redemptions).toBe(351);
    expect(t.tickets).toBe(1042);
    expect(t.discount).toBeCloseTo(21132.95, 2);
    expect(activePartnerCount(rows)).toBe(14);
  });

  it("W37 venue split matches revised PDF", () => {
    const split = rollupByVenue(w37VenueRows());
    expect(split).toHaveLength(4);
    expect(split[0]).toMatchObject({
      venue: "Urban Arena",
      redemptions: 67,
      tickets: 241,
      corporate_redemptions: 67,
      aggregator_redemptions: 0,
    });
    expect(split[0].discount).toBeCloseTo(3914.75, 2);
    expect(split[0].share).toBeCloseTo(0.35, 2);
    expect(split.map((s) => s.venue)).toEqual([
      "Urban Arena",
      "InflataPark",
      "Kids City Driving School",
      "Crayons & Bricks Vendome",
    ]);
    const t = metricTotals(w37VenueRows());
    expect(t.redemptions).toBe(194);
    expect(t.tickets).toBe(576);
    expect(t.discount).toBeCloseTo(12750.5, 2);
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

  it("dormant partners: month-zero vs week-only (brief W37 shape)", () => {
    // Brief WEEK columns: week redemptions, month redemptions
    const weekActive = [
      "Imtyazat",
      "Qatar Airways",
      "Urban Point",
      "Public Health Sector (Sogha)",
      "My Book",
      "Entertainer",
      "Qatar Foundation",
      "Qatar Investment Authority",
      "Aspire",
      "Al Jazeera Imtiyazat",
      "QNB Rewards",
      "QIB",
    ];
    const weekRows: DealMetricRow[] = weekActive.map((partner_name) => ({
      partner_name,
      category: "Corporate discount",
      times_used: 1,
      tickets: 1,
      total_discount: 1,
    }));
    const monthRows: DealMetricRow[] = [
      ...weekActive.map((partner_name) => ({
        partner_name,
        category: "Corporate discount" as const,
        times_used: 2,
        tickets: 2,
        total_discount: 2,
      })),
      { partner_name: "Bein", category: "Corporate discount", times_used: 1, tickets: 6, total_discount: 53 },
      {
        partner_name: "Qatar Living Deals",
        category: "Aggregator BOGO",
        times_used: 1,
        tickets: 1,
        total_discount: 100,
      },
    ];

    const monthZero = partnersWithNoUsageThisMonth(monthRows);
    expect(monthZero).toEqual([
      "Dar App",
      "Classmate",
      "MyBenefit",
      "DHL",
      "Huawei",
      "Qatar Media Corporation",
      "Snoonu Employees",
    ]);

    const dormant = dormantPartners(weekRows, monthRows);
    expect(dormant).toHaveLength(9);
    expect(dormant.filter((d) => d.kind === "month").map((d) => d.partner_name)).toEqual(monthZero);
    expect(dormant.filter((d) => d.kind === "week").map((d) => d.partner_name)).toEqual([
      "Qatar Living Deals",
      "Bein",
    ]);
    expect(dormant.find((d) => d.partner_name === "Dar App")?.redemption_mechanism).toBe("Dar community app");
    expect(dormant.find((d) => d.partner_name === "Dar App")?.action).toMatch(/listing is live/i);
    expect(dormant.find((d) => d.partner_name === "Bein")?.action).toMatch(/no action needed/i);
  });

  it("rolls up loyalty / in-house codes separately from partner totals", () => {
    const week: DealMetricRow[] = [
      {
        promocode: "loyaltykds",
        description: "loyalty pass free city pass",
        partner_name: null,
        category: "Internal / promotion",
        venue: "Kids City Driving School",
        times_used: 7,
        tickets: 7,
        total_discount: 315,
      },
      {
        promocode: "cafe50",
        description: "50% off on cafe",
        partner_name: null,
        category: "Internal / promotion",
        venue: "Urban Arena",
        times_used: 31,
        tickets: 36,
        total_discount: 247.5,
      },
      {
        partner_name: "Urban Point",
        category: "Aggregator BOGO",
        times_used: 27,
        tickets: 27,
        total_discount: 1000,
      },
    ];
    const month: DealMetricRow[] = [
      {
        promocode: "loyaltykds",
        partner_name: null,
        category: "Internal / promotion",
        venue: "Kids City Driving School",
        times_used: 13,
        tickets: 13,
        total_discount: 585,
      },
      {
        promocode: "loyalty",
        description: "Loyalty customer free rookie pass",
        partner_name: null,
        category: "Internal / promotion",
        venue: "Urban Arena",
        times_used: 1,
        tickets: 1,
        total_discount: 45,
      },
      {
        promocode: "cafe50",
        partner_name: null,
        category: "Internal / promotion",
        venue: "Urban Arena",
        times_used: 63,
        tickets: 78,
        total_discount: 443.5,
      },
    ];
    const loy = loyaltyInHouseByCode(week, month);
    expect(loy.map((r) => r.promocode)).toEqual(["cafe50", "loyaltykds", "loyalty"]);
    expect(loy[0]).toMatchObject({ week_redemptions: 31, week_tickets: 36, month_redemptions: 63 });
    expect(loy.find((r) => r.promocode === "loyalty")?.week_redemptions).toBe(0);
    expect(metricTotals([...week, ...month]).redemptions).toBe(27);
  });
});
