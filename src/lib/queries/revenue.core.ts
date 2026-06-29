import { monthStartInQatar, shouldUseMockApi, todayInQatar } from "@/lib/integrations/bookingqube";
import type { AuthContext } from "@/lib/server/auth";

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

async function readLastBookingQubeSync(context: AuthContext) {
  const { data, error } = await context.supabase
    .from("audit_log")
    .select("created_at, after")
    .eq("action", "bookingqube.sync")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    // RLS may block non-exec users
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

  return { synced_at: snap?.updated_at ?? null, source: null as "api" | "mock" | null, rows: null };
}

export async function fetchRevenuePace(
  context: AuthContext,
  locationId?: string | null,
): Promise<RevenuePace> {
  const period_days = 30;
  const since = new Date(Date.now() - period_days * 86400_000).toISOString().slice(0, 10);
  const priorSince = new Date(Date.now() - period_days * 2 * 86400_000).toISOString().slice(0, 10);

  let q = context.supabase
    .from("financial_snapshots")
    .select("period_start, revenue, ebitda, footfall")
    .eq("period_kind", "day")
    .gte("period_start", priorSince)
    .order("period_start");
  if (locationId) q = q.eq("location_id", locationId);
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

  return {
    location_id: locationId ?? null,
    period_days,
    current_total,
    prior_total,
    pace_pct,
    series: currentSeries.slice(-30),
    forecast_next_14d: avg14 * 14,
  };
}

export async function fetchBranchPnL(context: AuthContext) {
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
}

export async function fetchLeakageCases(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("leakage_cases")
    .select(
      "id, location_id, category, hypothesis, estimated_loss, recovered_amount, status, detected_on, root_cause",
    )
    .order("detected_on", { ascending: false })
    .limit(100);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}

export async function fetchAssetRoiLeague(context: AuthContext, locationId?: string | null) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  let attrQ = context.supabase.from("attractions").select("id, location_id, name, status").order("name");
  if (locationId) attrQ = attrQ.eq("location_id", locationId);
  const { data: attractions, error } = await attrQ;
  if (error) throw error;

  const results = await Promise.all(
    (attractions ?? []).map(async (a) => {
      const { data: assets } = await context.supabase.from("assets").select("id").eq("attraction_id", a.id);
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
}

export async function fetchMonthlyRevenueProgress(
  context: AuthContext,
  locationId?: string | null,
): Promise<MonthlyRevenueProgress> {
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
  if (locationId) targetQ = targetQ.eq("location_id", locationId);

  let dayQ = context.supabase
    .from("financial_snapshots")
    .select("location_id, period_start, revenue, locations(name, code)")
    .eq("period_kind", "day")
    .gte("period_start", month_start)
    .lte("period_start", today)
    .order("period_start");
  if (locationId) dayQ = dayQ.eq("location_id", locationId);

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
  };
}

export async function fetchBookingQubeSyncStatus(context: AuthContext): Promise<BookingQubeSyncStatus> {
  const lastSync = await readLastBookingQubeSync(context);
  return {
    last_synced_at: lastSync.synced_at,
    last_source: lastSync.source,
    last_rows_upserted: lastSync.rows,
    api_mode: shouldUseMockApi() ? "mock" : "api",
  };
}
