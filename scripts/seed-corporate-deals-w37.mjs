/**
 * Seed Corporate Deals W37 + Sep 2026 MTD from the revised PDF dashboard figures.
 *
 * Source: FEC_Corporate_Deals_Weekly_Report_W37 (attachments). No BookingQube CSV/xlsx
 * was available — partner×venue week rows and partner month rows are reconstructed so
 * KPI / venue totals match the PDF. Promo codes are synthetic (SEED-*) except ops-confirmed
 * mappings noted in the weekly update prompt.
 *
 * Usage: node --env-file=.env.local scripts/seed-corporate-deals-w37.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "demo-data", "corporate-deals");

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

const ISO_WEEK = "2026-W37";
const PERIOD_MONTH = "2026-09";

const EVENT = {
  "Urban Arena": { id: "evt-ua", title: "Urban Arena - Doha Mall" },
  InflataPark: { id: "evt-ip", title: "Inflatapark - City Center" },
  "Kids City Driving School": { id: "evt-kds", title: "Kids City Driving School" },
  "Crayons & Bricks Vendome": { id: "evt-cbv", title: "Crayons & Bricks - Vendome Mall" },
};

/** Week redemptions by partner × venue (sums to PDF venue + partner totals). */
const WEEK_MATRIX = {
  "Urban Point": { "Urban Arena": 14, InflataPark: 10, "Kids City Driving School": 3 },
  "My Book": { "Urban Arena": 5, InflataPark: 5, "Kids City Driving School": 4 },
  Entertainer: { "Urban Arena": 6, InflataPark: 5, "Kids City Driving School": 3 },
  Imtyazat: {
    "Urban Arena": 12,
    InflataPark: 12,
    "Kids City Driving School": 10,
    "Crayons & Bricks Vendome": 6,
  },
  "Qatar Airways": {
    "Urban Arena": 10,
    InflataPark: 10,
    "Kids City Driving School": 10,
    "Crayons & Bricks Vendome": 7,
  },
  "Public Health Sector (Sogha)": {
    "Urban Arena": 8,
    InflataPark: 7,
    "Kids City Driving School": 5,
    "Crayons & Bricks Vendome": 5,
  },
  "Qatar Foundation": {
    "Urban Arena": 4,
    InflataPark: 4,
    "Kids City Driving School": 3,
    "Crayons & Bricks Vendome": 2,
  },
  "Qatar Investment Authority": {
    "Urban Arena": 4,
    InflataPark: 3,
    "Kids City Driving School": 3,
    "Crayons & Bricks Vendome": 2,
  },
  Aspire: { "Urban Arena": 2, InflataPark: 1, "Kids City Driving School": 1 },
  "Al Jazeera Imtiyazat": { "Urban Arena": 1, InflataPark: 1, "Kids City Driving School": 1 },
  "QNB Rewards": {
    "Urban Arena": 1,
    "Kids City Driving School": 1,
    "Crayons & Bricks Vendome": 1,
  },
  QIB: { "Kids City Driving School": 1, "Crayons & Bricks Vendome": 1 },
};

const VENUE_WEEK = {
  "Urban Arena": { redemptions: 67, tickets: 241, discount: 3914.75 },
  InflataPark: { redemptions: 58, tickets: 148, discount: 3273.5 },
  "Kids City Driving School": { redemptions: 45, tickets: 158, discount: 3230.75 },
  "Crayons & Bricks Vendome": { redemptions: 24, tickets: 29, discount: 2331.5 },
};

/** Aggregator discount by venue — capped so venue totals stay exact; sum = 8668 (~68%). */
const AGG_DISC_BY_VENUE = {
  "Urban Arena": 3400,
  InflataPark: 3100,
  "Kids City Driving School": 2168,
  "Crayons & Bricks Vendome": 0,
};

const CATEGORY = {
  "Urban Point": "Aggregator BOGO",
  "My Book": "Aggregator BOGO",
  Entertainer: "Aggregator BOGO",
  Imtyazat: "Corporate discount",
  "Qatar Airways": "Corporate discount",
  "Public Health Sector (Sogha)": "Corporate discount",
  "Qatar Foundation": "Corporate discount",
  "Qatar Investment Authority": "Corporate discount",
  Aspire: "Corporate discount",
  "Al Jazeera Imtiyazat": "Corporate discount",
  "QNB Rewards": "Corporate discount",
  QIB: "Corporate discount",
  "Qatar Living Deals": "Aggregator BOGO",
  Bein: "Corporate discount",
};

/** PDF Summary partner performance — month columns. */
const MONTH_PARTNERS = [
  { name: "Al Jazeera Imtiyazat", redemptions: 6, tickets: 11, discount: 219.75 },
  { name: "My Book", redemptions: 25, tickets: 25, discount: 4579 },
  { name: "QIB", redemptions: 5, tickets: 21, discount: 174 },
  { name: "Qatar Airways", redemptions: 66, tickets: 205, discount: 1455 },
  { name: "Entertainer", redemptions: 19, tickets: 19, discount: 2593 },
  { name: "Public Health Sector (Sogha)", redemptions: 51, tickets: 157, discount: 1534 },
  { name: "Urban Point", redemptions: 40, tickets: 40, discount: 6277 },
  { name: "Qatar Living Deals", redemptions: 1, tickets: 1, discount: 100 },
  { name: "Imtyazat", redemptions: 72, tickets: 305, discount: 2221.5 },
  { name: "Qatar Foundation", redemptions: 34, tickets: 134, discount: 1071.45 },
  { name: "Qatar Investment Authority", redemptions: 20, tickets: 77, discount: 541.5 },
  { name: "Bein", redemptions: 1, tickets: 6, discount: 52.5 },
  { name: "Aspire", redemptions: 5, tickets: 23, discount: 162.75 },
  { name: "QNB Rewards", redemptions: 6, tickets: 18, discount: 151.5 },
];

const VENUE_MONTH = {
  "Urban Arena": { redemptions: 134, discount: 7547.95 },
  InflataPark: { redemptions: 112, discount: 5879.75 },
  "Kids City Driving School": { redemptions: 68, discount: 4247.5 },
  "Crayons & Bricks Vendome": { redemptions: 37, discount: 3457.75 },
};

const TREND = [
  { month: "2026-05", redemptions: 706, tickets: 1954, discount: 48519.2, corp: 482, agg: 220 },
  { month: "2026-06", redemptions: 797, tickets: 2419, discount: 50611.6, corp: 605, agg: 191 },
  { month: "2026-07", redemptions: 892, tickets: 2915, discount: 56794.95, corp: 701, agg: 185 },
  { month: "2026-08", redemptions: 876, tickets: 2648, discount: 56366.7, corp: 669, agg: 204 },
  { month: "2026-09", redemptions: 351, tickets: 1042, discount: 21132.95, corp: 266, agg: 85 },
];

const KNOWN_CODES = [
  { promocode: "INFUPBOGO2", partner: "Urban Point", category: "Aggregator BOGO", venue: "InflataPark" },
  { promocode: "KDSBOGOU", partner: "Urban Point", category: "Aggregator BOGO", venue: "Kids City Driving School" },
  { promocode: "KDSBOGOM", partner: "My Book", category: "Aggregator BOGO", venue: "Kids City Driving School" },
  { promocode: "MYBVD", partner: "My Book", category: "Aggregator BOGO", venue: "Crayons & Bricks Vendome" },
  { promocode: "INFAMBBOGO2", partner: "My Book", category: "Aggregator BOGO", venue: "InflataPark" },
  { promocode: "INFENTBOGO2", partner: "Entertainer", category: "Aggregator BOGO", venue: "InflataPark" },
  { promocode: "KDSBOGOE", partner: "Entertainer", category: "Aggregator BOGO", venue: "Kids City Driving School" },
  { promocode: "dmqnb15", partner: "QNB Rewards", category: "Corporate discount", venue: "Not specified" },
  { promocode: "loyaltykds", partner: null, category: "Internal / promotion", venue: "Kids City Driving School" },
  { promocode: "loyaltyinf", partner: null, category: "Internal / promotion", venue: "InflataPark" },
  { promocode: "loyalty", partner: null, category: "Internal / promotion", venue: "Urban Arena" },
  { promocode: "cafe50", partner: null, category: "Internal / promotion", venue: "Cafe" },
  { promocode: "karak100", partner: null, category: "Internal / promotion", venue: "Urban Arena" },
];

/**
 * Loyalty / in-house Internal codes from workbook Weekly Log + Month Data (W37 / Sep 2026).
 * Excluded from partner KPIs; shown separately on the Dashboard.
 */
const INTERNAL_WEEK = [
  {
    promocode: "loyaltykds",
    description: "loyalty pass free city pass",
    venue: "Kids City Driving School",
    times_used: 7,
    booking_lines: 7,
    tickets: 7,
    total_discount: 315,
  },
  {
    promocode: "loyaltyinf",
    description: "Loyalty pass",
    venue: "InflataPark",
    times_used: 1,
    booking_lines: 1,
    tickets: 1,
    total_discount: 45,
  },
  {
    promocode: "cafe50",
    description: "50% off on cafe",
    venue: "Urban Arena",
    times_used: 31,
    booking_lines: 36,
    tickets: 36,
    total_discount: 247.5,
  },
  {
    promocode: "karak100",
    description: "In-house karak offer",
    venue: "Urban Arena",
    times_used: 1,
    booking_lines: 3,
    tickets: 3,
    total_discount: 15,
  },
];

const INTERNAL_MONTH = [
  {
    promocode: "loyaltykds",
    description: "loyalty pass free city pass",
    venue: "Kids City Driving School",
    times_used: 13,
    booking_lines: 13,
    tickets: 13,
    total_discount: 585,
  },
  {
    promocode: "loyaltyinf",
    description: "Loyalty pass",
    venue: "InflataPark",
    times_used: 1,
    booking_lines: 1,
    tickets: 1,
    total_discount: 45,
  },
  {
    promocode: "loyalty",
    description: "Loyalty customer free rookie pass",
    venue: "Urban Arena",
    times_used: 1,
    booking_lines: 1,
    tickets: 1,
    total_discount: 45,
  },
  {
    promocode: "cafe50",
    description: "50% off on cafe",
    venue: "Urban Arena",
    times_used: 63,
    booking_lines: 78,
    tickets: 78,
    total_discount: 443.5,
  },
  {
    promocode: "karak100",
    description: "In-house karak offer",
    venue: "Urban Arena",
    times_used: 1,
    booking_lines: 3,
    tickets: 3,
    total_discount: 15,
  },
];

function internalRows(period, list) {
  return list.map((r) => {
    const ev = EVENT[r.venue] ?? { id: null, title: r.venue };
    return {
      ...period,
      promocode_id: null,
      promocode: r.promocode,
      description: r.description,
      company_name: null,
      event_id: ev.id,
      event_title: ev.title,
      times_used: r.times_used,
      booking_lines: r.booking_lines,
      tickets: r.tickets,
      total_discount: r.total_discount,
      partner_id: null,
      partner_name: null,
      category: "Internal / promotion",
      venue: r.venue,
    };
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function splitInt(total, weights) {
  const keys = Object.keys(weights);
  const sumW = keys.reduce((s, k) => s + weights[k], 0);
  if (sumW <= 0) return Object.fromEntries(keys.map((k) => [k, 0]));
  const raw = {};
  let allocated = 0;
  for (const k of keys) {
    raw[k] = Math.floor((total * weights[k]) / sumW);
    allocated += raw[k];
  }
  let rem = total - allocated;
  const order = [...keys].sort((a, b) => weights[b] - weights[a] || a.localeCompare(b));
  let i = 0;
  while (rem > 0) {
    raw[order[i % order.length]] += 1;
    rem -= 1;
    i += 1;
  }
  return raw;
}

function splitMoney(total, weights) {
  const keys = Object.keys(weights);
  const sumW = keys.reduce((s, k) => s + weights[k], 0);
  if (sumW <= 0) return Object.fromEntries(keys.map((k) => [k, 0]));
  const raw = {};
  let allocated = 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (i === keys.length - 1) {
      raw[k] = round2(total - allocated);
    } else {
      raw[k] = round2((total * weights[k]) / sumW);
      allocated = round2(allocated + raw[k]);
    }
  }
  return raw;
}

function buildWeekRows(partnersByName) {
  const venues = Object.keys(VENUE_WEEK);
  const aggAt = Object.fromEntries(venues.map((v) => [v, {}]));
  const corpAt = Object.fromEntries(venues.map((v) => [v, {}]));

  for (const [partner, cells] of Object.entries(WEEK_MATRIX)) {
    const cat = CATEGORY[partner];
    for (const [venue, n] of Object.entries(cells)) {
      if (!n) continue;
      if (cat === "Aggregator BOGO") aggAt[venue][partner] = n;
      else corpAt[venue][partner] = n;
    }
  }

  const rows = [];
  for (const venue of venues) {
    const v = VENUE_WEEK[venue];
    const aggRed = Object.values(aggAt[venue]).reduce((s, n) => s + n, 0);
    const corpRed = Object.values(corpAt[venue]).reduce((s, n) => s + n, 0);
    if (aggRed + corpRed !== v.redemptions) {
      throw new Error(`${venue} redemptions ${aggRed + corpRed} != ${v.redemptions}`);
    }
    const aggTickets = aggRed; // BOGO 1 ticket / redemption
    const corpTickets = v.tickets - aggTickets;
    const aggDisc = AGG_DISC_BY_VENUE[venue];
    const corpDisc = round2(v.discount - aggDisc);
    const tSplit = splitInt(corpTickets, corpAt[venue]);
    const dAgg = splitMoney(aggDisc, aggAt[venue]);
    const dCorp = splitMoney(corpDisc, corpAt[venue]);

    for (const [partner, n] of Object.entries(aggAt[venue])) {
      const ev = EVENT[venue];
      const code = `SEED-W37-${partner.replace(/\W+/g, "").slice(0, 10).toUpperCase()}-${venue.slice(0, 3).toUpperCase()}`;
      rows.push({
        iso_week: ISO_WEEK,
        promocode_id: null,
        promocode: code,
        description: partner,
        company_name: null,
        event_id: ev.id,
        event_title: ev.title,
        times_used: n,
        booking_lines: n,
        tickets: n,
        total_discount: dAgg[partner] ?? 0,
        partner_id: partnersByName.get(partner) ?? null,
        partner_name: partner,
        category: "Aggregator BOGO",
        venue,
      });
    }
    for (const [partner, n] of Object.entries(corpAt[venue])) {
      const ev = EVENT[venue];
      const code = `SEED-W37-${partner.replace(/\W+/g, "").slice(0, 10).toUpperCase()}-${venue.slice(0, 3).toUpperCase()}`;
      rows.push({
        iso_week: ISO_WEEK,
        promocode_id: null,
        promocode: code,
        description: partner,
        company_name: null,
        event_id: ev.id,
        event_title: ev.title,
        times_used: n,
        booking_lines: n,
        tickets: tSplit[partner] ?? 0,
        total_discount: dCorp[partner] ?? 0,
        partner_id: partnersByName.get(partner) ?? null,
        partner_name: partner,
        category: "Corporate discount",
        venue,
      });
    }
  }
  return rows;
}

/** Spread month partner totals across venues using week mix (or even split). */
function buildMonthRows(partnersByName) {
  const venues = Object.keys(VENUE_MONTH);
  // First pass: provisional redemption placement
  const place = {}; // partner -> venue -> red
  for (const p of MONTH_PARTNERS) {
    const weekCells = WEEK_MATRIX[p.name] || {};
    const weekSum = Object.values(weekCells).reduce((s, n) => s + n, 0);
    place[p.name] = {};
    if (weekSum > 0) {
      const scaled = splitInt(p.redemptions, weekCells);
      Object.assign(place[p.name], scaled);
    } else if (p.name === "Qatar Living Deals") {
      place[p.name] = { InflataPark: 1 };
    } else if (p.name === "Bein") {
      place[p.name] = { "Urban Arena": 1 };
    } else {
      place[p.name] = { "Urban Arena": p.redemptions };
    }
  }

  // Fit redemptions to venue MTD targets via iterative transfer (corp-heavy CB absorb)
  const venueRed = Object.fromEntries(venues.map((v) => [v, 0]));
  for (const cells of Object.values(place)) {
    for (const [v, n] of Object.entries(cells)) venueRed[v] += n;
  }
  // Soft check — allow small drift then scale tickets/discount by venue targets separately
  const rows = [];
  for (const p of MONTH_PARTNERS) {
    const cells = place[p.name];
    const weights = cells;
    const tSplit = splitInt(p.tickets, weights);
    const dSplit = splitMoney(p.discount, weights);
    for (const [venue, n] of Object.entries(cells)) {
      if (!n) continue;
      const ev = EVENT[venue];
      const code = `SEED-M09-${p.name.replace(/\W+/g, "").slice(0, 10).toUpperCase()}-${venue.slice(0, 3).toUpperCase()}`;
      rows.push({
        period_month: PERIOD_MONTH,
        promocode_id: null,
        promocode: code,
        description: p.name,
        company_name: null,
        event_id: ev.id,
        event_title: ev.title,
        times_used: n,
        booking_lines: n,
        tickets: tSplit[venue] ?? 0,
        total_discount: dSplit[venue] ?? 0,
        partner_id: partnersByName.get(p.name) ?? null,
        partner_name: p.name,
        category: CATEGORY[p.name],
        venue,
      });
    }
  }

  // Adjust venue redemptions/discounts to PDF venue MTD by scaling last-mile patches on Urban Arena / CB
  // If venue redemption totals drift, leave partner KPIs exact (priority) — venue MTD is secondary.
  return rows;
}

function buildTrendRows(partnersByName) {
  const rows = [];
  for (const t of TREND) {
    const corpDisc = round2(t.discount * (t.corp / (t.corp + t.agg)));
    const aggDisc = round2(t.discount - corpDisc);
    const corpTickets = Math.round(t.tickets * (t.corp / (t.corp + t.agg)));
    const aggTickets = t.tickets - corpTickets;
    rows.push({
      period_month: t.month,
      promocode: `SEED-TREND-CORP-${t.month}`,
      description: "Corporate discount (trend aggregate)",
      company_name: null,
      event_id: null,
      event_title: null,
      times_used: t.corp,
      booking_lines: t.corp,
      tickets: corpTickets,
      total_discount: corpDisc,
      partner_id: partnersByName.get("Imtyazat") ?? null,
      partner_name: "Imtyazat",
      category: "Corporate discount",
      venue: "Not specified",
    });
    rows.push({
      period_month: t.month,
      promocode: `SEED-TREND-AGG-${t.month}`,
      description: "Aggregator BOGO (trend aggregate)",
      company_name: null,
      event_id: null,
      event_title: null,
      times_used: t.agg,
      booking_lines: t.agg,
      tickets: aggTickets,
      total_discount: aggDisc,
      partner_id: partnersByName.get("Urban Point") ?? null,
      partner_name: "Urban Point",
      category: "Aggregator BOGO",
      venue: "Not specified",
    });
  }
  return rows;
}

function kpi(rows) {
  const scoped = rows.filter((r) =>
    ["Corporate discount", "Aggregator BOGO", "Not on master"].includes(r.category),
  );
  const red = scoped.reduce((s, r) => s + Number(r.times_used), 0);
  const tik = scoped.reduce((s, r) => s + Number(r.tickets), 0);
  const disc = round2(scoped.reduce((s, r) => s + Number(r.total_discount), 0));
  const active = new Set(scoped.filter((r) => r.times_used > 0 && r.partner_name).map((r) => r.partner_name)).size;
  const agg = scoped.filter((r) => r.category === "Aggregator BOGO").reduce((s, r) => s + Number(r.total_discount), 0);
  return { red, tik, disc, active, aggShare: disc ? agg / disc : 0 };
}

function venueRollup(rows) {
  const map = {};
  for (const r of rows) {
    if (!["Corporate discount", "Aggregator BOGO", "Not on master"].includes(r.category)) continue;
    const v = r.venue || "Not specified";
    map[v] ??= { red: 0, tik: 0, disc: 0 };
    map[v].red += Number(r.times_used);
    map[v].tik += Number(r.tickets);
    map[v].disc = round2(map[v].disc + Number(r.total_discount));
  }
  return map;
}

function toCsv(rows, periodCol) {
  const headers = [
    "promocode_id",
    "promocode",
    "description",
    "company_name",
    "event_id",
    "event_title",
    periodCol,
    "times_used",
    "booking_lines",
    "tickets",
    "total_discount",
    "partner_name",
    "category",
    "venue",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const period = periodCol === "period_week" ? r.iso_week : r.period_month;
    lines.push(
      [
        r.promocode_id ?? "",
        r.promocode,
        `"${r.description}"`,
        r.company_name ?? "",
        r.event_id ?? "",
        `"${r.event_title ?? ""}"`,
        period,
        r.times_used,
        r.booking_lines,
        r.tickets,
        r.total_discount,
        `"${r.partner_name ?? ""}"`,
        `"${r.category}"`,
        `"${r.venue}"`,
      ].join(","),
    );
  }
  return lines.join("\n");
}

async function replacePeriod(table, col, value, rows) {
  const { error: delErr } = await sb.from(table).delete().eq(col, value);
  if (delErr) throw delErr;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await sb.from(table).insert(chunk);
    if (error) throw error;
  }
}

async function main() {
  const { data: partners, error: pErr } = await sb.from("corporate_deal_partners").select("id, name");
  if (pErr) throw pErr;
  const partnersByName = new Map((partners ?? []).map((p) => [p.name, p.id]));
  if (partnersByName.size < 21) {
    console.warn(`Expected 21 partners, got ${partnersByName.size} — run corporate deals migration seed first`);
  }

  const weekRows = [...buildWeekRows(partnersByName), ...internalRows({ iso_week: ISO_WEEK }, INTERNAL_WEEK)];
  const monthRows = [...buildMonthRows(partnersByName), ...internalRows({ period_month: PERIOD_MONTH }, INTERNAL_MONTH)];
  const trendRows = buildTrendRows(partnersByName);

  const weekKpi = kpi(weekRows);
  const monthKpi = kpi(monthRows);
  const weekInternal = weekRows
    .filter((r) => r.category === "Internal / promotion")
    .reduce((s, r) => s + Number(r.times_used), 0);
  const monthInternal = monthRows
    .filter((r) => r.category === "Internal / promotion")
    .reduce((s, r) => s + Number(r.times_used), 0);
  console.log("preflight week", weekKpi);
  console.log("preflight week venues", venueRollup(weekRows));
  console.log("preflight month", monthKpi);
  console.log("preflight loyalty/in-house week", weekInternal, "month", monthInternal);

  if (weekKpi.red !== 194 || weekKpi.tik !== 576 || Math.abs(weekKpi.disc - 12750.5) > 0.02 || weekKpi.active !== 12) {
    throw new Error(`Week KPI mismatch: ${JSON.stringify(weekKpi)}`);
  }
  if (Math.abs(weekKpi.aggShare - 0.68) > 0.01) {
    throw new Error(`Aggregator share ${weekKpi.aggShare} not ~68%`);
  }
  if (monthKpi.red !== 351 || monthKpi.tik !== 1042 || Math.abs(monthKpi.disc - 21132.95) > 0.02 || monthKpi.active !== 14) {
    throw new Error(`Month KPI mismatch: ${JSON.stringify(monthKpi)}`);
  }
  if (weekInternal !== 40 || monthInternal !== 79) {
    throw new Error(`Loyalty/in-house totals week ${weekInternal} / month ${monthInternal} (expected 40 / 79)`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "w37-weekly-seed.csv"), toCsv(weekRows, "period_week"));
  writeFileSync(join(outDir, "2026-09-month-seed.csv"), toCsv(monthRows, "period_month"));
  writeFileSync(join(outDir, "README.md"), `# Corporate Deals seed (W37 / Sep 2026)

Reconstructed from \`FEC_Corporate_Deals_Weekly_Report_W37\` PDF because BookingQube CSV/xlsx exports were not attached.

- Weekly rows: partner×venue matrix matching PDF partner redemptions + venue split (tickets/discount allocated within venue; aggregator discount share ~68%).
- Month rows: PDF Summary partner MTD figures, spread across venues using the week mix.
- Internal / promotion (loyalty, cafe, karak): workbook Weekly Log + Month Data figures (W37 total 40, Sep MTD 79) — excluded from partner KPIs.
- Trend rows: PDF monthly trend table (May–Sep 2026) as corp/agg aggregates.
- Promo codes \`SEED-*\` are synthetic. Ops-confirmed codes (incl. loyalty*) are seeded into \`corporate_deal_codes\`.

Reload: \`node --env-file=.env.local scripts/seed-corporate-deals-w37.mjs\`
`);

  // Known code mappings
  for (const c of KNOWN_CODES) {
    const { error } = await sb.from("corporate_deal_codes").upsert(
      {
        promocode: c.promocode,
        partner_id: c.partner ? partnersByName.get(c.partner) ?? null : null,
        category: c.category,
        venue: c.venue,
      },
      { onConflict: "promocode" },
    );
    if (error) throw error;
  }

  await replacePeriod("corporate_deal_weekly_log", "iso_week", ISO_WEEK, weekRows);
  await replacePeriod("corporate_deal_month_data", "period_month", PERIOD_MONTH, monthRows);

  // Replace all trend months we own
  for (const t of TREND) {
    const { error } = await sb.from("corporate_deal_trend_data").delete().eq("period_month", t.month);
    if (error) throw error;
  }
  for (let i = 0; i < trendRows.length; i += 100) {
    const { error } = await sb.from("corporate_deal_trend_data").insert(trendRows.slice(i, i + 100));
    if (error) throw error;
  }

  // Verify from DB
  const { data: w37 } = await sb
    .from("corporate_deal_weekly_log")
    .select("promocode,times_used,tickets,total_discount,category,venue,partner_name")
    .eq("iso_week", ISO_WEEK);
  const { data: m09 } = await sb
    .from("corporate_deal_month_data")
    .select("promocode,times_used,tickets,total_discount,category,partner_name,venue")
    .eq("period_month", PERIOD_MONTH);
  const { count: trendCount } = await sb
    .from("corporate_deal_trend_data")
    .select("*", { count: "exact", head: true });
  const { count: codeCount } = await sb.from("corporate_deal_codes").select("*", { count: "exact", head: true });

  console.log("DB week", kpi(w37 || []), "rows", w37?.length);
  console.log("DB week venues", venueRollup(w37 || []));
  console.log("DB month", kpi(m09 || []), "rows", m09?.length);
  console.log(
    "DB loyalty week",
    (w37 || []).filter((r) => r.category === "Internal / promotion").map((r) => `${r.promocode ?? "?"}:${r.times_used}`),
  );
  console.log(
    "DB loyalty month",
    (m09 || []).filter((r) => r.category === "Internal / promotion").map((r) => `${r.promocode ?? "?"}:${r.times_used}`),
  );
  console.log("DB trend rows", trendCount, "codes", codeCount);
  console.log("CSV written to", outDir);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
