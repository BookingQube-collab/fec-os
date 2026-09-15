/**
 * Seed Corporate Deals from FEC_Corporate_Deals_Weekly_Report.xlsx (real BookingQube sheets).
 *
 * Source (preferred): A:/Weekly Meeting/week37/FEC_Corporate_Deals_Weekly_Report.xlsx
 * Fallback: demo-data/corporate-deals/FEC_Corporate_Deals_Weekly_Report.xlsx
 *
 * Usage: node --env-file=.env.local scripts/seed-corporate-deals-w37.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "demo-data", "corporate-deals");

const WORKBOOK_CANDIDATES = [
  "A:/Weekly Meeting/week37/FEC_Corporate_Deals_Weekly_Report.xlsx",
  join(outDir, "FEC_Corporate_Deals_Weekly_Report.xlsx"),
];

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

const ISO_WEEK = "2026-W37";
const PERIOD_MONTH = "2026-09";
const PARTNER_CATS = new Set(["Corporate discount", "Aggregator BOGO", "Not on master"]);

function workbookPath() {
  for (const p of WORKBOOK_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Workbook not found. Tried:\n${WORKBOOK_CANDIDATES.join("\n")}`);
}

function sheetObjects(wb, name) {
  const sh = wb.Sheets[name];
  if (!sh) throw new Error(`Missing sheet: ${name}`);
  return XLSX.utils.sheet_to_json(sh, { range: 3, defval: null }).filter((r) => r.promocode);
}

function str(v) {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function mapLogRow(r, partnersByName, periodKey, periodValue) {
  const partnerName = str(r.Partner);
  const category = str(r.Category) || "Unmapped";
  return {
    [periodKey]: periodValue ?? str(r.period_week) ?? str(r.period_month),
    promocode_id: r.promocode_id != null ? String(r.promocode_id) : null,
    promocode: String(r.promocode).trim(),
    description: str(r.description) || "",
    company_name: str(r.company_name),
    event_id: r.event_id != null && r.event_id !== "" ? String(r.event_id) : null,
    event_title: str(r.event_title),
    times_used: num(r.times_used),
    booking_lines: num(r.booking_lines),
    tickets: num(r.tickets),
    total_discount: round2(num(r.total_discount)),
    partner_id: partnerName ? partnersByName.get(partnerName) ?? null : null,
    partner_name: partnerName,
    category,
    venue: str(r.Venue) || str(r.event_title) || "Not specified",
  };
}

function kpi(rows) {
  const scoped = rows.filter((r) => PARTNER_CATS.has(r.category));
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
    if (!PARTNER_CATS.has(r.category)) continue;
    const v = r.venue || "Not specified";
    map[v] ??= { red: 0, tik: 0, disc: 0, corp: 0, agg: 0 };
    map[v].red += Number(r.times_used);
    map[v].tik += Number(r.tickets);
    map[v].disc = round2(map[v].disc + Number(r.total_discount));
    if (r.category === "Corporate discount") map[v].corp += Number(r.times_used);
    if (r.category === "Aggregator BOGO") map[v].agg += Number(r.times_used);
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
        `"${(r.description || "").replaceAll('"', '""')}"`,
        r.company_name ?? "",
        r.event_id ?? "",
        `"${(r.event_title ?? "").replaceAll('"', '""')}"`,
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

async function replaceTrendAll(rows) {
  // Wipe then insert — trend sheet is the full export window.
  const { error: delErr } = await sb.from("corporate_deal_trend_data").delete().neq("promocode", "__never__");
  if (delErr) throw delErr;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await sb.from("corporate_deal_trend_data").insert(chunk);
    if (error) throw error;
  }
}

async function main() {
  const src = workbookPath();
  console.log("workbook", src);
  mkdirSync(outDir, { recursive: true });
  const cached = join(outDir, "FEC_Corporate_Deals_Weekly_Report.xlsx");
  if (src !== cached) copyFileSync(src, cached);

  const wb = XLSX.readFile(src);
  const { data: partners, error: pErr } = await sb.from("corporate_deal_partners").select("id, name");
  if (pErr) throw pErr;
  const partnersByName = new Map((partners ?? []).map((p) => [p.name, p.id]));
  if (partnersByName.size < 21) {
    console.warn(`Expected 21 partners, got ${partnersByName.size}`);
  }

  const weekRaw = sheetObjects(wb, "Weekly Log").filter((r) => str(r.period_week) === ISO_WEEK);
  const monthRaw = sheetObjects(wb, "Month Data").filter((r) => str(r.period_month) === PERIOD_MONTH);
  const trendRaw = sheetObjects(wb, "Trend Data");
  const codeRaw = XLSX.utils
    .sheet_to_json(wb.Sheets["Code Mapping"], { range: 3, defval: null })
    .filter((r) => r["Promo code"] || r.promocode);

  const weekRows = weekRaw.map((r) => mapLogRow(r, partnersByName, "iso_week", ISO_WEEK));
  const monthRows = monthRaw.map((r) => mapLogRow(r, partnersByName, "period_month", PERIOD_MONTH));
  const trendRows = trendRaw.map((r) => mapLogRow(r, partnersByName, "period_month", str(r.period_month)));

  const weekKpi = kpi(weekRows);
  const monthKpi = kpi(monthRows);
  const weekInternal = weekRows
    .filter((r) => r.category === "Internal / promotion")
    .reduce((s, r) => s + Number(r.times_used), 0);
  const monthInternal = monthRows
    .filter((r) => r.category === "Internal / promotion")
    .reduce((s, r) => s + Number(r.times_used), 0);

  console.log("preflight week", weekKpi, "rows", weekRows.length);
  console.log("preflight week venues", venueRollup(weekRows));
  console.log("preflight month", monthKpi, "rows", monthRows.length);
  console.log("preflight loyalty/in-house week", weekInternal, "month", monthInternal);
  console.log("preflight trend rows", trendRows.length, "codes", codeRaw.length);

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

  writeFileSync(join(outDir, "w37-weekly-seed.csv"), toCsv(weekRows, "period_week"));
  writeFileSync(join(outDir, "2026-09-month-seed.csv"), toCsv(monthRows, "period_month"));
  writeFileSync(
    join(outDir, "README.md"),
    `# Corporate Deals seed (W37 / Sep 2026)

Loaded from \`FEC_Corporate_Deals_Weekly_Report.xlsx\` (Weekly Log / Month Data / Trend Data / Code Mapping).

- Weekly W37: ${weekRows.length} rows → 194 / 576 / 12,750.50 / 12 active
- Month 2026-09: ${monthRows.length} rows → 351 / 1,042 / 21,132.95 / 14 active
- Internal / promotion: week ${weekInternal}, month ${monthInternal}
- Trend: ${trendRows.length} rows (full workbook export)
- Code mapping: ${codeRaw.length} promocodes upserted

Reload: \`node --env-file=.env.local scripts/seed-corporate-deals-w37.mjs\`
`,
  );

  // Code mapping (Partner / Category / Venue columns)
  let mapped = 0;
  for (let i = 0; i < codeRaw.length; i += 100) {
    const chunk = codeRaw.slice(i, i + 100).map((r) => {
      const promocode = String(r["Promo code"] || r.promocode).trim();
      const partnerName = str(r.Partner);
      const category = str(r.Category) || "Unmapped";
      return {
        promocode,
        partner_id: partnerName ? partnersByName.get(partnerName) ?? null : null,
        category,
        venue: str(r.Venue) || "Not specified",
      };
    });
    const { error } = await sb.from("corporate_deal_codes").upsert(chunk, { onConflict: "promocode" });
    if (error) throw error;
    mapped += chunk.length;
  }

  await replacePeriod("corporate_deal_weekly_log", "iso_week", ISO_WEEK, weekRows);
  await replacePeriod("corporate_deal_month_data", "period_month", PERIOD_MONTH, monthRows);
  await replaceTrendAll(trendRows);

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
    (w37 || [])
      .filter((r) => r.category === "Internal / promotion")
      .map((r) => `${r.promocode ?? "?"}:${r.times_used}`),
  );
  console.log("DB trend rows", trendCount, "codes upserted", mapped, "codes total", codeCount);
  console.log("CSV written to", outDir);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
