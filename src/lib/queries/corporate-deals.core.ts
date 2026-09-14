import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import {
  activePartnerCount,
  aggregatorMethodChangeCaveat,
  aggregatorShare,
  categorySplit,
  comparePeriods,
  corporateVsAggregator,
  metricTotals,
  monthlyTrend,
  partnersWithNoUsageThisMonth,
  rollupByPartner,
  unmappedCodes,
  weeklyTrend,
  type DealMetricRow,
} from "@/lib/corporate-deals/calc";
import { PARTNER_MASTER, type DealCategory, type ImportKind } from "@/lib/corporate-deals/constants";
import {
  classifyRow,
  detectImportPeriod,
  normalizeIsoWeek,
  normalizePeriodMonth,
  parsePromoExportCsv,
  type CodeMappingLookup,
} from "@/lib/corporate-deals/parse";

function requireEdit(context: AuthContext) {
  if (!canUserDo(context.roles ?? [], "corporate_deals.edit")) {
    throw new ForbiddenError("corporate_deals.edit");
  }
}

function asMetric(row: Record<string, unknown>, period?: { iso_week?: string; period_month?: string }): DealMetricRow {
  return {
    times_used: Number(row.times_used) || 0,
    tickets: Number(row.tickets) || 0,
    total_discount: Number(row.total_discount) || 0,
    partner_name: (row.partner_name as string | null) ?? null,
    category: (row.category as DealCategory) || "Unmapped",
    venue: (row.venue as string | null) ?? null,
    iso_week: period?.iso_week ?? (row.iso_week as string | null) ?? null,
    period_month: period?.period_month ?? (row.period_month as string | null) ?? null,
  };
}

async function loadCodeMap(context: AuthContext): Promise<{
  byCode: Map<string, CodeMappingLookup>;
  partnersByName: Map<string, string>;
}> {
  const [{ data: codes }, { data: partners }] = await Promise.all([
    context.supabase.from("corporate_deal_codes").select("promocode, category, venue, partner_id"),
    context.supabase.from("corporate_deal_partners").select("id, name"),
  ]);
  const partnersByName = new Map((partners ?? []).map((p) => [String(p.name), String(p.id)]));
  const partnerNameById = new Map((partners ?? []).map((p) => [String(p.id), String(p.name)]));
  const byCode = new Map<string, CodeMappingLookup>();
  for (const c of codes ?? []) {
    const partnerName = c.partner_id ? partnerNameById.get(String(c.partner_id)) ?? null : null;
    byCode.set(String(c.promocode).toLowerCase(), {
      promocode: String(c.promocode),
      partner_name: partnerName,
      category: (c.category as DealCategory) || "Unmapped",
      venue: String(c.venue || "Not specified"),
    });
  }
  return { byCode, partnersByName };
}

export async function fetchCorporateDealPartners(context: AuthContext) {
  const { data, error } = await context.supabase
    .from("corporate_deal_partners")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function fetchCorporateDealCodes(context: AuthContext, opts?: { unmappedOnly?: boolean }) {
  let q = context.supabase.from("corporate_deal_codes").select("*").order("promocode");
  if (opts?.unmappedOnly) q = q.eq("category", "Unmapped");
  const { data, error } = await q;
  if (error) throw error;
  const { data: partners } = await context.supabase.from("corporate_deal_partners").select("id, name");
  const names = new Map((partners ?? []).map((p) => [String(p.id), String(p.name)]));
  return (data ?? []).map((row) => ({
    ...row,
    partner_name: row.partner_id ? names.get(String(row.partner_id)) ?? null : null,
  }));
}

export async function saveCorporateDealCode(
  context: AuthContext,
  input: { id?: string; promocode: string; partner_name?: string | null; category: DealCategory; venue: string; notes?: string | null },
) {
  requireEdit(context);
  const { partnersByName } = await loadCodeMap(context);
  const partner_id = input.partner_name ? partnersByName.get(input.partner_name) ?? null : null;
  const payload = {
    promocode: input.promocode.trim(),
    partner_id,
    category: input.category,
    venue: input.venue || "Not specified",
    notes: input.notes ?? null,
  };
  if (input.id) {
    const { data, error } = await context.supabase
      .from("corporate_deal_codes")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await context.supabase
    .from("corporate_deal_codes")
    .upsert(payload, { onConflict: "promocode" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listCorporateDealWeeks(context: AuthContext): Promise<string[]> {
  const { data, error } = await context.supabase.from("corporate_deal_weekly_log").select("iso_week");
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => String(r.iso_week)))].sort().reverse();
}

async function loadWeekRows(context: AuthContext, isoWeek: string) {
  const { data, error } = await context.supabase
    .from("corporate_deal_weekly_log")
    .select("*")
    .eq("iso_week", isoWeek);
  if (error) throw error;
  return (data ?? []).map((r) => asMetric(r, { iso_week: isoWeek }));
}

async function loadMonthRows(context: AuthContext, periodMonth: string) {
  const { data, error } = await context.supabase
    .from("corporate_deal_month_data")
    .select("*")
    .eq("period_month", periodMonth);
  if (error) throw error;
  return (data ?? []).map((r) => asMetric(r, { period_month: periodMonth }));
}

async function loadAllWeekly(context: AuthContext) {
  const { data, error } = await context.supabase.from("corporate_deal_weekly_log").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => asMetric(r));
}

async function loadAllTrend(context: AuthContext) {
  const { data, error } = await context.supabase.from("corporate_deal_trend_data").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => asMetric(r));
}

function previousIsoWeek(isoWeek: string): string | null {
  const m = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  let year = Number(m[1]);
  let week = Number(m[2]) - 1;
  if (week < 1) {
    year -= 1;
    week = 52;
  }
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function monthFromIsoWeek(isoWeek: string): string | null {
  const m = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  // Monday of ISO week
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  return `${ISOweekStart.getFullYear()}-${String(ISOweekStart.getMonth() + 1).padStart(2, "0")}`;
}

export async function fetchCorporateDealReport(context: AuthContext, isoWeek: string) {
  const weeks = await listCorporateDealWeeks(context);
  const weekRows = await loadWeekRows(context, isoWeek);
  const prevWeek = previousIsoWeek(isoWeek);
  const prevRows = prevWeek && weeks.includes(prevWeek) ? await loadWeekRows(context, prevWeek) : null;
  const periodMonth = monthFromIsoWeek(isoWeek);
  const monthRows = periodMonth ? await loadMonthRows(context, periodMonth) : [];
  const allWeekly = await loadAllWeekly(context);
  const trendRows = await loadAllTrend(context);
  const year = Number(isoWeek.slice(0, 4)) || new Date().getFullYear();

  const kpis = metricTotals(weekRows);
  const mtd = metricTotals(monthRows);
  const compare = comparePeriods(weekRows, prevRows);
  const split = corporateVsAggregator(weekRows);
  const partners = rollupByPartner(weekRows, monthRows.length ? monthRows : weekRows);
  const noUsage = partnersWithNoUsageThisMonth(monthRows.length ? monthRows : weekRows);
  const unmapped = unmappedCodes(weekRows);

  return {
    iso_week: isoWeek,
    previous_week: prevWeek,
    period_month: periodMonth,
    weeks,
    kpis: {
      ...kpis,
      active_partners: activePartnerCount(weekRows),
      aggregator_share: aggregatorShare(weekRows),
    },
    mtd: {
      ...mtd,
      active_partners: activePartnerCount(monthRows),
      aggregator_share: aggregatorShare(monthRows),
    },
    compare,
    corporate_vs_aggregator: split,
    top10: partners.filter((p) => p.redemptions > 0).slice(0, 10),
    partners,
    no_usage_partners: noUsage,
    category_split: categorySplit(weekRows),
    weekly_trend: weeklyTrend(allWeekly, year),
    monthly_trend: monthlyTrend(trendRows.length ? trendRows : allWeekly.map((r) => ({
      ...r,
      period_month: r.period_month ?? periodMonth,
    }))),
    unmapped_count: unmapped.length,
    unmapped_codes: unmapped,
    caveat: aggregatorMethodChangeCaveat(isoWeek),
    partner_master: PARTNER_MASTER,
  };
}

export interface ImportPreview {
  kind: ImportKind;
  period: string | null;
  ambiguous: boolean;
  row_count: number;
  duplicate_week: boolean;
  unmapped_codes: string[];
  sample: Array<Record<string, unknown>>;
}

export async function previewCorporateDealImport(
  context: AuthContext,
  input: { csv: string; kind: ImportKind; period?: string | null },
): Promise<ImportPreview> {
  requireEdit(context);
  const parsed = parsePromoExportCsv(input.csv);
  const detected = detectImportPeriod(parsed, input.kind);
  const period = input.period || detected.period;
  const { byCode } = await loadCodeMap(context);
  const unmapped: string[] = [];
  const sample = parsed.slice(0, 20).map((r) => {
    const cls = classifyRow(r, byCode);
    if (cls.category === "Unmapped") unmapped.push(r.promocode);
    return { ...r, ...cls };
  });
  for (const r of parsed.slice(20)) {
    const cls = classifyRow(r, byCode);
    if (cls.category === "Unmapped") unmapped.push(r.promocode);
  }
  let duplicate_week = false;
  if (input.kind === "week" && period) {
    const { count } = await context.supabase
      .from("corporate_deal_weekly_log")
      .select("id", { count: "exact", head: true })
      .eq("iso_week", period);
    duplicate_week = (count ?? 0) > 0;
  }
  return {
    kind: input.kind,
    period,
    ambiguous: detected.ambiguous && !input.period,
    row_count: parsed.length,
    duplicate_week,
    unmapped_codes: [...new Set(unmapped)],
    sample,
  };
}

export async function commitCorporateDealImport(
  context: AuthContext,
  input: { csv: string; kind: ImportKind; period: string; replace?: boolean },
) {
  requireEdit(context);
  const parsed = parsePromoExportCsv(input.csv);
  if (!parsed.length) throw new Error("No rows to import");
  const period =
    input.kind === "week"
      ? normalizeIsoWeek(input.period) ?? input.period
      : normalizePeriodMonth(input.period) ?? input.period;
  if (!period) throw new Error("Reporting period required");

  const { byCode, partnersByName } = await loadCodeMap(context);
  const table =
    input.kind === "week"
      ? "corporate_deal_weekly_log"
      : input.kind === "month"
        ? "corporate_deal_month_data"
        : "corporate_deal_trend_data";
  const periodCol = input.kind === "week" ? "iso_week" : "period_month";

  if (input.kind === "week") {
    const { count } = await context.supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(periodCol, period);
    if ((count ?? 0) > 0 && !input.replace) {
      return { status: "duplicate" as const, period, rows_imported: 0, unmapped_codes: [] as string[] };
    }
    if (input.replace) {
      const { error } = await context.supabase.from(table).delete().eq(periodCol, period);
      if (error) throw error;
    }
  } else {
    // Month / trend: always replace the period (cadence replace)
    const { error } = await context.supabase.from(table).delete().eq(periodCol, period);
    if (error) throw error;
  }

  const unmappedCodesList: string[] = [];
  const newCodeRows: Array<{ promocode: string; category: string; venue: string }> = [];
  const inserts = parsed.map((r) => {
    const cls = classifyRow(r, byCode);
    if (cls.category === "Unmapped") {
      unmappedCodesList.push(r.promocode);
      if (!byCode.has(r.promocode.toLowerCase())) {
        newCodeRows.push({ promocode: r.promocode, category: "Unmapped", venue: "Not specified" });
      }
    }
    return {
      [periodCol]: period,
      promocode_id: r.promocode_id || null,
      promocode: r.promocode,
      description: r.description,
      company_name: r.company_name,
      times_used: r.times_used,
      booking_lines: r.booking_lines,
      tickets: r.tickets,
      total_discount: r.total_discount,
      partner_id: cls.partner_name ? partnersByName.get(cls.partner_name) ?? null : null,
      partner_name: cls.partner_name,
      category: cls.category,
      venue: cls.venue,
    };
  });

  if (newCodeRows.length) {
    const { error } = await context.supabase
      .from("corporate_deal_codes")
      .upsert(newCodeRows, { onConflict: "promocode", ignoreDuplicates: true });
    if (error) throw error;
  }

  // chunk inserts
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { error } = await context.supabase.from(table).insert(chunk);
    if (error) throw error;
  }

  const uniqueUnmapped = [...new Set(unmappedCodesList)];
  if (uniqueUnmapped.length && input.kind === "week") {
    await ensureUnmappedActions(context, period, uniqueUnmapped);
  }

  return {
    status: "ok" as const,
    period,
    rows_imported: inserts.length,
    unmapped_codes: uniqueUnmapped,
  };
}

/** Surface unmapped codes on the shared weekly_review_actions register (not silent). */
async function ensureUnmappedActions(context: AuthContext, isoWeek: string, codes: string[]) {
  const weekStart = isoWeekToMonday(isoWeek);
  if (!weekStart) return;
  let { data: review } = await context.supabase
    .from("weekly_reviews")
    .select("id")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (!review) {
    const weekEnd = addDays(weekStart, 6);
    const { data: created, error } = await context.supabase
      .from("weekly_reviews")
      .insert({
        week_label: `Week ${Number(isoWeek.slice(6))}`,
        week_start: weekStart,
        week_end: weekEnd,
        meeting_date: addDays(weekStart, 1),
        prepared_by: context.user?.id ?? null,
        status: "draft",
        notes: "Auto-created for corporate deals unmapped follow-up",
      })
      .select("id")
      .single();
    if (error) return;
    review = created;
  }
  const action = `Map unmapped promo codes (${codes.length}): ${codes.slice(0, 8).join(", ")}${codes.length > 8 ? "…" : ""}`;
  await context.supabase.from("weekly_review_actions").insert({
    review_id: review.id,
    venue_text: "Corporate deals",
    action,
    owner: "Head of Ops",
    due: "This week",
    status: "open",
    update_note: null,
    source_module: "corporate_deals_unmap",
    sort_order: 900,
  });
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoWeekToMonday(isoWeek: string): string | null {
  const m = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return ISOweekStart.toISOString().slice(0, 10);
}

export async function fetchCorporateDealMomActions(context: AuthContext) {
  const { data, error } = await context.supabase
    .from("weekly_review_actions")
    .select("*")
    .eq("source_module", "corporate_deals_mom")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function saveCorporateDealMomAction(
  context: AuthContext,
  input: {
    id?: string;
    review_id: string;
    venue_text?: string | null;
    action: string;
    owner?: string | null;
    due?: string | null;
    status: "open" | "wip" | "done";
    update_note?: string | null;
    sort_order?: number;
  },
) {
  requireEdit(context);
  const payload = {
    review_id: input.review_id,
    venue_text: input.venue_text ?? null,
    action: input.action,
    owner: input.owner ?? null,
    due: input.due ?? null,
    status: input.status,
    update_note: input.update_note ?? null,
    source_module: "corporate_deals_mom",
    sort_order: input.sort_order ?? 0,
  };
  if (input.id) {
    const { data, error } = await context.supabase
      .from("weekly_review_actions")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await context.supabase
    .from("weekly_review_actions")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchWeeklyLog(context: AuthContext, isoWeek?: string | null) {
  let q = context.supabase.from("corporate_deal_weekly_log").select("*").order("promocode");
  if (isoWeek) q = q.eq("iso_week", isoWeek);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return data ?? [];
}
