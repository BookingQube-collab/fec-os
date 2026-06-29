"use server";

import { createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import { getBranchLeague } from "@/lib/branches.functions";

export interface BoardPackData {
  generated_at: string;
  estate: {
    revenue_30d: number;
    ebitda_30d: number;
    margin_pct: number;
    active_branches: number;
    total_branches: number;
  };
  branches: Array<{
    name: string;
    code: string;
    city: string;
    revenue_30d: number;
    ebitda_30d: number;
    margin_pct: number;
    open_tickets: number;
    urgent_tickets: number;
    incidents_30d: number;
    score: number;
  }>;
  open_leakage: Array<{ category: string; estimated_loss: number; status: string; detected_on: string }>;
  open_incidents_24h: Array<{ severity: string; summary: string; occurred_at: string }>;
  open_complaints: Array<{ channel: string | null; severity: string; summary: string }>;
  open_pos: Array<{ po_number: string; vendor_name: string; amount: number; status: string }>;
  latest_brief?: { title: string | null; narrative: string; created_at: string } | null;
}

export const getBoardPackData = createAuthenticatedActionNoInput(async (context) => {
  const league = await getBranchLeague();
  const since24h = new Date(Date.now() - 86400_000).toISOString();

  const estate_revenue_30d = league.reduce((a, b) => a + b.revenue_30d, 0);
  const estate_ebitda_30d = league.reduce((a, b) => a + b.ebitda_30d, 0);
  const margin_pct = estate_revenue_30d > 0 ? (estate_ebitda_30d / estate_revenue_30d) * 100 : 0;

  const { data: locs } = await context.supabase.from("locations").select("id, status");
  const active_branches = (locs ?? []).filter((l) => l.status === "active").length;
  const total_branches = locs?.length ?? 0;

  const [{ data: leakage }, { data: incidents }, { data: complaints }, { data: pos }, { data: brief }] =
    await Promise.all([
      context.supabase
        .from("leakage_cases")
        .select("category, estimated_loss, status, detected_on")
        .not("status", "in", "(recovered,dismissed)")
        .order("detected_on", { ascending: false })
        .limit(20),
      context.supabase
        .from("incidents")
        .select("severity, summary, occurred_at")
        .gte("occurred_at", since24h)
        .neq("status", "closed")
        .order("occurred_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("complaints")
        .select("channel, severity, summary")
        .not("status", "in", "(resolved,dismissed)")
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("purchase_orders")
        .select("po_number, vendor_name, amount, status")
        .not("status", "in", "(received,closed,rejected)")
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("ai_artifacts")
        .select("title, content, created_at")
        .eq("kind", "daily_brief")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const latest_brief = brief
    ? {
        title: brief.title,
        narrative: (brief.content as { narrative?: string })?.narrative ?? "",
        created_at: brief.created_at,
      }
    : null;

  return {
    generated_at: new Date().toISOString(),
    estate: {
      revenue_30d: estate_revenue_30d,
      ebitda_30d: estate_ebitda_30d,
      margin_pct,
      active_branches,
      total_branches,
    },
    branches: league.map((b) => ({
      name: b.name,
      code: b.code,
      city: b.city,
      revenue_30d: b.revenue_30d,
      ebitda_30d: b.ebitda_30d,
      margin_pct: b.margin_pct,
      open_tickets: b.open_tickets,
      urgent_tickets: b.urgent_tickets,
      incidents_30d: b.incidents_30d,
      score: b.score,
    })),
    open_leakage: (leakage ?? []).map((l) => ({
      category: l.category,
      estimated_loss: Number(l.estimated_loss ?? 0),
      status: l.status,
      detected_on: l.detected_on,
    })),
    open_incidents_24h: incidents ?? [],
    open_complaints: complaints ?? [],
    open_pos: (pos ?? []).map((p) => ({
      po_number: p.po_number,
      vendor_name: p.vendor_name,
      amount: Number(p.amount),
      status: p.status,
    })),
    latest_brief,
  } satisfies BoardPackData;
}, { auth: { capability: "occ.view_estate" } });
