import { fetchBranchLeague } from "@/lib/queries/branches.core";
import type { AuthContext } from "@/lib/server/auth";

export interface CeoOverview {
  estate_revenue_30d: number;
  estate_ebitda_30d: number;
  estate_margin_pct: number;
  open_urgent_tickets: number;
  incidents_24h: number;
  active_branches: number;
  total_branches: number;
  top_branch: { name: string; revenue: number } | null;
  bottom_branch: { name: string; revenue: number } | null;
  latest_brief: { id: string; title: string | null; narrative: string; created_at: string } | null;
}

export async function fetchCeoOverview(context: AuthContext): Promise<CeoOverview> {
  const league = await fetchBranchLeague(context);
  const estate_revenue_30d = league.reduce((a, b) => a + b.revenue_30d, 0);
  const estate_ebitda_30d = league.reduce((a, b) => a + b.ebitda_30d, 0);
  const estate_margin_pct =
    estate_revenue_30d > 0 ? (estate_ebitda_30d / estate_revenue_30d) * 100 : 0;

  const since24h = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: urgentCount }, { count: inc24 }] = await Promise.all([
    context.supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("priority", "urgent")
      .is("deleted_at", null)
      .not("status", "in", "(resolved,closed,cancelled)"),
    context.supabase
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", since24h),
  ]);

  const { data: locs } = await context.supabase.from("locations").select("id, status");
  const active_branches = (locs ?? []).filter((l) => l.status === "active").length;
  const total_branches = locs?.length ?? 0;

  const byRev = [...league].sort((a, b) => b.revenue_30d - a.revenue_30d);
  const top_branch = byRev[0] ? { name: byRev[0].name, revenue: byRev[0].revenue_30d } : null;
  const bottom_branch = byRev.length
    ? { name: byRev[byRev.length - 1].name, revenue: byRev[byRev.length - 1].revenue_30d }
    : null;

  const { data: briefRow } = await context.supabase
    .from("ai_artifacts")
    .select("id, title, content, created_at")
    .eq("kind", "daily_brief")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latest_brief = briefRow
    ? {
        id: briefRow.id,
        title: briefRow.title,
        narrative:
          (briefRow.content as { narrative?: string })?.narrative ?? String(briefRow.content ?? ""),
        created_at: briefRow.created_at,
      }
    : null;

  return {
    estate_revenue_30d,
    estate_ebitda_30d,
    estate_margin_pct,
    open_urgent_tickets: urgentCount ?? 0,
    incidents_24h: inc24 ?? 0,
    active_branches,
    total_branches,
    top_branch,
    bottom_branch,
    latest_brief,
  };
}
