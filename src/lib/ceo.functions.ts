"use server";

import { createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import { getBranchLeague } from "@/lib/branches.functions";

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

export const getCeoOverview = createAuthenticatedActionNoInput(async (context) => {
  const league = await getBranchLeague();
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
    ? { name: byRev[0].name, revenue: byRev[0].revenue_30d }
    : null;
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
          (briefRow.content as { narrative?: string })?.narrative ??
          String(briefRow.content ?? ""),
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
  } satisfies CeoOverview;
}, { auth: { capability: "ceo.view_dashboard" } });

export const generateDailyBrief = createAuthenticatedActionNoInput(async (context) => {
  const overview = await getCeoOverview();
  const league = await getBranchLeague();

  const apiKey = process.env.LOVABLE_API_KEY;
  let narrative = "AI daily brief unavailable (no LOVABLE_API_KEY).";
  if (apiKey) {
    const prompt = `You are the COO of a Qatar family entertainment centre group. Write a concise daily executive brief (max 250 words) covering: (1) Estate headline numbers, (2) Branches needing attention today, (3) Top 3 operational priorities, (4) One positive signal. Use QAR and branch names.\n\nOverview:\n${JSON.stringify(overview, null, 2)}\n\nBranch league:\n${JSON.stringify(league.slice(0, 8), null, 2)}`;
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

  const { data: row, error } = await context.supabase
    .from("ai_artifacts")
    .insert({
      kind: "daily_brief",
      title: `Daily brief ${new Date().toISOString().slice(0, 10)}`,
      content: { overview, narrative },
      model: "google/gemini-3-flash-preview",
      created_by: context.userId,
    })
    .select()
    .single();
  if (error) throw error;
  return row;
}, { auth: { capability: "ceo.read_brief" } });

export const generatePnLCommentary = createAuthenticatedActionNoInput(async (context) => {
  const league = await getBranchLeague();
  const rows = league.map((b) => ({
    branch: b.name,
    code: b.code,
    revenue_30d: b.revenue_30d,
    ebitda_30d: b.ebitda_30d,
    margin_pct: b.margin_pct,
    score: b.score,
  }));

  const apiKey = process.env.LOVABLE_API_KEY;
  let narrative = "AI commentary unavailable (no LOVABLE_API_KEY).";
  if (apiKey) {
    const prompt = `You are the group CFO commentary writer for a Qatar family entertainment centre group. Write a concise P&L commentary (max 200 words) in 4 sections: (1) Group headline, (2) Winners and why, (3) Underperformers and likely drivers, (4) Three specific actions for the leadership team this week. Be specific with branch names and numbers. Data:\n${JSON.stringify(rows, null, 2)}`;
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

  const { data: row, error } = await context.supabase
    .from("ai_artifacts")
    .insert({
      kind: "pnl_commentary",
      title: `P&L commentary ${new Date().toISOString().slice(0, 10)}`,
      content: { rows, narrative },
      model: "google/gemini-3-flash-preview",
      created_by: context.userId,
    })
    .select()
    .single();
  if (error) throw error;
  return row;
}, { auth: { capability: "ceo.view_dashboard" } });
