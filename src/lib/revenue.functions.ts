"use server";

import { z } from "zod";

import { syncBookingQubeRevenueToDb } from "@/lib/bookingqube-sync";
import { monthStartInQatar, shouldUseMockApi, todayInQatar } from "@/lib/integrations/bookingqube";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";

const LocationOpt = z
  .object({ locationId: z.string().uuid().nullable().optional() })
  .default({});

export interface RevenueDayPoint {
  date: string;
  revenue: number;
  ebitda: number;
  footfall: number | null;
}

export interface RevenuePace {
  location_id: string | null;
  period_days: number;
  current_total: number;
  prior_total: number;
  pace_pct: number;
  series: RevenueDayPoint[];
  forecast_next_14d: number;
}

export interface BranchMonthlyProgress {
  location_id: string;
  code: string;
  name: string;
  month_start: string;
  target_revenue: number;
  mtd_revenue: number;
  progress_pct: number;
  days: Array<{ date: string; revenue: number }>;
}

export interface MonthlyRevenueProgress {
  month_start: string;
  month_label: string;
  today: string;
  estate_target: number;
  estate_mtd: number;
  estate_progress_pct: number;
  branches: BranchMonthlyProgress[];
  last_synced_at: string | null;
  last_sync_source: "api" | "mock" | null;
  api_mode: "api" | "mock";
}

export interface BookingQubeSyncStatus {
  last_synced_at: string | null;
  last_source: "api" | "mock" | null;
  last_rows_upserted: number | null;
  api_mode: "api" | "mock";
}

async function requireBookingQubeSync(context: AuthContext) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw error;
  const roleList = (roles ?? []).map((r) => r.role as AppRole);
  if (!canUserDo(roleList, "revenue.sync_bookingqube")) {
    throw new Error("Forbidden: finance role required to sync BookingQube revenue");
  }
}

async function readLastBookingQubeSync(
  context: AuthContext,
): Promise<{ synced_at: string | null; source: "api" | "mock" | null; rows: number | null }> {
  const { data, error } = await context.supabase
    .from("audit_log")
    .select("created_at, after")
    .eq("action", "bookingqube.sync")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    // RLS may block non-exec users — fall through to snapshot timestamp
  } else if (data) {
    const after = data.after as { synced_at?: string; source?: "api" | "mock"; rows_upserted?: number } | null;
    return {
      synced_at: after?.synced_at ?? data.created_at,
      source: after?.source ?? null,
      rows: after?.rows_upserted ?? null,
    };
  }

  const { data: snap } = await context.supabase
    .from("financial_snapshots")
    .select("updated_at")
    .eq("period_kind", "day")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    synced_at: snap?.updated_at ?? null,
    source: null,
    rows: null,
  };
}

export const getRevenuePace = createAuthenticatedAction(
  LocationOpt,
  async (data, context) => {
    const period_days = 30;
    const since = new Date(Date.now() - period_days * 86400_000).toISOString().slice(0, 10);
    const priorSince = new Date(Date.now() - period_days * 2 * 86400_000).toISOString().slice(0, 10);

    let q = context.supabase
      .from("financial_snapshots")
      .select("period_start, revenue, ebitda, footfall")
      .eq("period_kind", "day")
      .gte("period_start", priorSince)
      .order("period_start");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;

    const dayMap = new Map<string, RevenueDayPoint>();
    for (const r of rows ?? []) {
      const d = r.period_start;
      const cur = dayMap.get(d) ?? { date: d, revenue: 0, ebitda: 0, footfall: 0 };
      cur.revenue += Number(r.revenue ?? 0);
      cur.ebitda += Number(r.ebitda ?? 0);
      cur.footfall = (cur.footfall ?? 0) + Number(r.footfall ?? 0);
      dayMap.set(d, cur);
    }

    const allSeries = [...dayMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    const currentSeries = allSeries.filter((p) => p.date >= since);
    const priorSeries = allSeries.filter((p) => p.date < since);

    const current_total = currentSeries.reduce((a, p) => a + p.revenue, 0);
    const prior_total = priorSeries.reduce((a, p) => a + p.revenue, 0);
    const pace_pct = prior_total > 0 ? ((current_total - prior_total) / prior_total) * 100 : 0;

    const values = currentSeries.map((p) => p.revenue);
    const n = values.length;
    const avg14 = n > 0 ? values.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, n) : 0;
    const forecast_next_14d = avg14 * 14;

    return {
      location_id: data.locationId ?? null,
      period_days,
      current_total,
      prior_total,
      pace_pct,
      series: currentSeries.slice(-30),
      forecast_next_14d,
    } satisfies RevenuePace;
  },
  { defaultInput: {}, auth: { capability: "revenue.view" } },
);

export const getBranchPnL = createAuthenticatedActionNoInput(async (context) => {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: fin, error } = await context.supabase
    .from("financial_snapshots")
    .select("location_id, revenue, ebitda, footfall, locations(name, code)")
    .eq("period_kind", "day")
    .gte("period_start", since);
  if (error) throw error;

  const byLoc = new Map<
    string,
    { location_id: string; name: string; code: string; revenue: number; ebitda: number; footfall: number }
  >();
  for (const r of fin ?? []) {
    const loc = r.locations as { name: string; code: string } | null;
    const cur = byLoc.get(r.location_id) ?? {
      location_id: r.location_id,
      name: loc?.name ?? "—",
      code: loc?.code ?? "—",
      revenue: 0,
      ebitda: 0,
      footfall: 0,
    };
    cur.revenue += Number(r.revenue ?? 0);
    cur.ebitda += Number(r.ebitda ?? 0);
    cur.footfall += Number(r.footfall ?? 0);
    byLoc.set(r.location_id, cur);
  }

  return [...byLoc.values()]
    .map((b) => ({
      ...b,
      margin_pct: b.revenue > 0 ? (b.ebitda / b.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}, { auth: { capability: "revenue.view" } });

export const listLeakageCases = createAuthenticatedAction(
  LocationOpt,
  async (data, context) => {
    let q = context.supabase
      .from("leakage_cases")
      .select(
        "id, location_id, category, hypothesis, estimated_loss, recovered_amount, status, detected_on, root_cause",
      )
      .order("detected_on", { ascending: false })
      .limit(100);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "revenue.view" } },
);

export const getAssetRoiLeague = createAuthenticatedAction(
  LocationOpt,
  async (data, context) => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    let attrQ = context.supabase.from("attractions").select("id, location_id, name, status").order("name");
    if (data.locationId) attrQ = attrQ.eq("location_id", data.locationId);
    const { data: attractions, error } = await attrQ;
    if (error) throw error;

    const results = await Promise.all(
      (attractions ?? []).map(async (a) => {
        const { data: assets } = await context.supabase
          .from("assets")
          .select("id")
          .eq("attraction_id", a.id);
        const assetIds = (assets ?? []).map((x) => x.id);

        const [{ count: tickets_30d }, { count: open_work_orders }] = await Promise.all([
          context.supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("attraction_id", a.id)
            .gte("created_at", since),
          assetIds.length
            ? context.supabase
                .from("work_orders")
                .select("id", { count: "exact", head: true })
                .in("asset_id", assetIds)
                .not("status", "in", "(completed,cancelled)")
            : Promise.resolve({ count: 0 }),
        ]);
        return {
          attraction_id: a.id,
          name: a.name,
          status: a.status,
          tickets_30d: tickets_30d ?? 0,
          open_work_orders: open_work_orders ?? 0,
        };
      }),
    );
    return results.sort((a, b) => b.tickets_30d - a.tickets_30d);
  },
  { defaultInput: {}, auth: { capability: "revenue.view" } },
);

export const analyzeLeakageCase = createAuthenticatedAction(
  z.object({ caseId: z.string().uuid() }),
  async (data, context) => {
    const { data: leakCase, error } = await context.supabase
      .from("leakage_cases")
      .select("*")
      .eq("id", data.caseId)
      .single();
    if (error) throw error;

    const apiKey = process.env.LOVABLE_API_KEY;
    let analysis = "AI RCA unavailable (no LOVABLE_API_KEY).";
    if (apiKey) {
      const prompt = `You are a revenue assurance analyst. Write a concise root-cause analysis (max 150 words) for this leakage case with 3 recommended actions.\n\n${JSON.stringify(leakCase, null, 2)}`;
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (resp.ok) {
          const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          analysis = json.choices?.[0]?.message?.content?.trim() ?? analysis;
        }
      } catch (e) {
        analysis = `AI call failed: ${(e as Error).message}`;
      }
    }

    await context.supabase
      .from("leakage_cases")
      .update({ root_cause: analysis.slice(0, 2000) })
      .eq("id", data.caseId);

    await context.supabase.from("ai_artifacts").insert({
      kind: "leakage_rca",
      title: `Leakage RCA: ${leakCase.category}`,
      content: { case_id: data.caseId, analysis },
      model: "google/gemini-3-flash-preview",
      location_id: leakCase.location_id,
      created_by: context.userId,
    });

    return { analysis };
  },
  { auth: { capability: "revenue.investigate_leakage" } },
);

export const generateForecastNarrative = createAuthenticatedAction(
  LocationOpt,
  async (data, context) => {
    const pace = await getRevenuePace({ locationId: data.locationId ?? null });
    const series = pace.series;
    const n = series.length;
    const values = series.map((p) => p.revenue);
    const avg14 = n > 0 ? values.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, n) : 0;
    const avg30 = n > 0 ? values.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, n) : 0;
    const prev14 = n > 14 ? values.slice(-28, -14).reduce((a, b) => a + b, 0) / 14 : avg14;
    const drift = (avg14 - prev14) / 14;
    const horizonDays = 90;
    const forecast14 = Array.from({ length: 14 }, (_, i) => avg14 + drift * (i + 1));
    const forecast90 = Array.from({ length: horizonDays }, (_, i) => avg30 + drift * (i + 1));
    const total14 = forecast14.reduce((a, b) => a + b, 0);
    const total90 = forecast90.reduce((a, b) => a + b, 0);

    const apiKey = process.env.LOVABLE_API_KEY;
    let narrative = "AI forecast narrative unavailable (no LOVABLE_API_KEY).";
    if (apiKey) {
      const prompt = `You are a revenue forecasting analyst for a Qatar family entertainment centre. Given the time series and naive baseline forecasts below, write a 150-word narrative covering: (1) Whether the trajectory is healthy, (2) Key risks to the 14d and 90d numbers (seasonality, surge, capacity), (3) Two specific revenue-protection actions. Be concrete and use QAR.\n\nLast ${n} days:\n${JSON.stringify(series.slice(-30), null, 2)}\n\nBaseline forecast totals: 14d = QAR ${Math.round(total14)}, 90d = QAR ${Math.round(total90)}.`;
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (resp.ok) {
          const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          narrative = json.choices?.[0]?.message?.content?.trim() ?? narrative;
        } else {
          narrative = `AI gateway error ${resp.status}.`;
        }
      } catch (e) {
        narrative = `AI call failed: ${(e as Error).message}`;
      }
    }

    const { data: row, error: insErr } = await context.supabase
      .from("ai_artifacts")
      .insert({
        kind: "forecast",
        title: `Revenue forecast ${new Date().toISOString().slice(0, 10)}`,
        content: { total_14d: total14, total_90d: total90, narrative },
        model: "google/gemini-3-flash-preview",
        location_id: data.locationId ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (insErr) throw insErr;
    return { total_14d: total14, total_90d: total90, narrative, artifact_id: row.id };
  },
  { defaultInput: {}, auth: { capability: "revenue.view" } },
);

const LeakageStatusEnum = z.enum(["detected", "investigating", "confirmed", "recovered", "dismissed"]);

export const getMonthlyRevenueProgress = createAuthenticatedAction(
  LocationOpt,
  async (data, context) => {
    const today = todayInQatar();
    const month_start = monthStartInQatar(today);
    const month_label = new Intl.DateTimeFormat("en-QA", {
      timeZone: "Asia/Qatar",
      month: "long",
      year: "numeric",
    }).format(new Date(`${month_start}T12:00:00+03:00`));

    let targetQ = context.supabase
      .from("financial_snapshots")
      .select("location_id, revenue, locations(name, code)")
      .eq("period_kind", "month_target")
      .eq("period_start", month_start);
    if (data.locationId) targetQ = targetQ.eq("location_id", data.locationId);

    let dayQ = context.supabase
      .from("financial_snapshots")
      .select("location_id, period_start, revenue, locations(name, code)")
      .eq("period_kind", "day")
      .gte("period_start", month_start)
      .lte("period_start", today)
      .order("period_start");
    if (data.locationId) dayQ = dayQ.eq("location_id", data.locationId);

    const [{ data: targets, error: tErr }, { data: days, error: dErr }, lastSync] = await Promise.all([
      targetQ,
      dayQ,
      readLastBookingQubeSync(context),
    ]);
    if (tErr) throw tErr;
    if (dErr) throw dErr;

    const branchMap = new Map<string, BranchMonthlyProgress>();

    for (const t of targets ?? []) {
      const loc = t.locations as { name: string; code: string } | null;
      branchMap.set(t.location_id, {
        location_id: t.location_id,
        code: loc?.code ?? "—",
        name: loc?.name ?? "—",
        month_start,
        target_revenue: Number(t.revenue ?? 0),
        mtd_revenue: 0,
        progress_pct: 0,
        days: [],
      });
    }

    for (const d of days ?? []) {
      const loc = d.locations as { name: string; code: string } | null;
      let branch = branchMap.get(d.location_id);
      if (!branch) {
        branch = {
          location_id: d.location_id,
          code: loc?.code ?? "—",
          name: loc?.name ?? "—",
          month_start,
          target_revenue: 0,
          mtd_revenue: 0,
          progress_pct: 0,
          days: [],
        };
        branchMap.set(d.location_id, branch);
      }
      const rev = Number(d.revenue ?? 0);
      branch.mtd_revenue += rev;
      branch.days.push({ date: d.period_start, revenue: rev });
    }

    const branches = [...branchMap.values()]
      .map((b) => ({
        ...b,
        progress_pct: b.target_revenue > 0 ? (b.mtd_revenue / b.target_revenue) * 100 : 0,
        days: b.days.sort((a, c) => (a.date < c.date ? -1 : 1)),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const estate_target = branches.reduce((a, b) => a + b.target_revenue, 0);
    const estate_mtd = branches.reduce((a, b) => a + b.mtd_revenue, 0);

    return {
      month_start,
      month_label,
      today,
      estate_target,
      estate_mtd,
      estate_progress_pct: estate_target > 0 ? (estate_mtd / estate_target) * 100 : 0,
      branches,
      last_synced_at: lastSync.synced_at,
      last_sync_source: lastSync.source,
      api_mode: shouldUseMockApi() ? "mock" : "api",
    } satisfies MonthlyRevenueProgress;
  },
  { defaultInput: {}, auth: { capability: "revenue.view" } },
);

export const getBookingQubeSyncStatus = createAuthenticatedActionNoInput(async (context) => {
  const lastSync = await readLastBookingQubeSync(context);
  return {
    last_synced_at: lastSync.synced_at,
    last_source: lastSync.source,
    last_rows_upserted: lastSync.rows,
    api_mode: shouldUseMockApi() ? "mock" : "api",
  } satisfies BookingQubeSyncStatus;
}, { auth: { capability: "revenue.view" } });

export const syncBookingQubeRevenue = createAuthenticatedAction(
  z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .default({}),
  async (data, context) => {
    await requireBookingQubeSync(context);
    const email = typeof context.claims.email === "string" ? context.claims.email : null;
    return syncBookingQubeRevenueToDb(supabaseAdmin, {
      from: data.from,
      to: data.to,
      actorId: context.userId,
      actorEmail: email,
    });
  },
  { defaultInput: {}, auth: { capability: "revenue.sync_bookingqube" } },
);

export const updateLeakageStatus = createAuthenticatedAction(
  z.object({
    caseId: z.string().uuid(),
    status: LeakageStatusEnum,
    recoveredAmount: z.number().optional(),
    rootCause: z.string().max(4000).optional(),
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("update_leakage_status", {
      _id: data.caseId,
      _status: data.status,
      _recovered_amount: data.recoveredAmount ?? undefined,
      _root_cause: data.rootCause ?? undefined,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "revenue.investigate_leakage" } },
);
