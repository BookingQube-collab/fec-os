import { fetchBranchLeague } from "@/lib/queries/branches.core";
import type { AuthContext } from "@/lib/server/auth";

export type CeoBranchHighlight = {
  location_id: string;
  name: string;
  revenue: number;
};

export interface CeoOverview {
  estate_revenue_30d: number;
  estate_ebitda_30d: number;
  estate_margin_pct: number;
  open_urgent_tickets: number;
  incidents_24h: number;
  active_branches: number;
  total_branches: number;
  top_branch: CeoBranchHighlight | null;
  bottom_branch: CeoBranchHighlight | null;
  latest_brief: { id: string; title: string | null; narrative: string; created_at: string } | null;
}

export interface CeoUrgentTicketRow {
  id: string;
  title: string;
  category: string | null;
  priority: string;
  status: string;
  sla_due_at: string | null;
  created_at: string;
  location_id: string;
  location_name: string;
  location_code: string;
}

export interface CeoIncidentRow {
  id: string;
  occurred_at: string;
  category: string;
  severity: string;
  summary: string;
  status: string;
  location_id: string;
  location_name: string;
  location_code: string;
}

async function locationNameMap(context: AuthContext, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, { name: string; code: string }>();
  const { data, error } = await context.supabase
    .from("locations")
    .select("id, name, code")
    .in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((l) => [l.id, { name: l.name, code: l.code }]));
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
  const top_branch = byRev[0]
    ? { location_id: byRev[0].location_id, name: byRev[0].name, revenue: byRev[0].revenue_30d }
    : null;
  const bottom_branch = byRev.length
    ? {
        location_id: byRev[byRev.length - 1].location_id,
        name: byRev[byRev.length - 1].name,
        revenue: byRev[byRev.length - 1].revenue_30d,
      }
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

export async function fetchCeoUrgentTickets(context: AuthContext): Promise<CeoUrgentTicketRow[]> {
  const { data: rows, error } = await context.supabase
    .from("tickets")
    .select("id, location_id, title, category, priority, status, sla_due_at, created_at")
    .eq("priority", "urgent")
    .is("deleted_at", null)
    .not("status", "in", "(resolved,closed,cancelled)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const locMap = await locationNameMap(context, (rows ?? []).map((r) => r.location_id));
  return (rows ?? []).map((r) => {
    const loc = locMap.get(r.location_id);
    return {
      ...r,
      location_name: loc?.name ?? "—",
      location_code: loc?.code ?? "—",
    };
  });
}

export async function fetchCeoIncidents24h(context: AuthContext): Promise<CeoIncidentRow[]> {
  const since24h = new Date(Date.now() - 86400_000).toISOString();
  const { data: rows, error } = await context.supabase
    .from("incidents")
    .select("id, location_id, occurred_at, category, severity, summary, status")
    .gte("occurred_at", since24h)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const locMap = await locationNameMap(context, (rows ?? []).map((r) => r.location_id));
  return (rows ?? []).map((r) => {
    const loc = locMap.get(r.location_id);
    return {
      ...r,
      location_name: loc?.name ?? "—",
      location_code: loc?.code ?? "—",
    };
  });
}
