"use server";

import { createAuthenticatedActionNoInput } from "@/lib/server/create-action";

export interface BranchScore {
  location_id: string;
  code: string;
  name: string;
  city: string;
  revenue_30d: number;
  ebitda_30d: number;
  margin_pct: number;
  open_tickets: number;
  urgent_tickets: number;
  incidents_30d: number;
  complaints_open: number;
  bookings_30d: number;
  score: number;
}

const since30 = () => new Date(Date.now() - 30 * 86400_000).toISOString();
const since24h = () => new Date(Date.now() - 86400_000).toISOString();

function computeScore(b: Omit<BranchScore, "score">): number {
  const revScore = Math.min(40, (b.revenue_30d / 500_000) * 40);
  const marginScore = Math.min(20, b.margin_pct);
  const opsPenalty =
    b.urgent_tickets * 12 + b.open_tickets * 2 + b.incidents_30d * 8 + b.complaints_open * 4;
  const bookingBonus = Math.min(10, b.bookings_30d * 0.5);
  return Math.max(0, Math.round(revScore + marginScore + bookingBonus - opsPenalty));
}

export const getBranchLeague = createAuthenticatedActionNoInput(async (context) => {
  const since = since30();
  const [{ data: locations, error: locErr }, { data: fin, error: finErr }] = await Promise.all([
    context.supabase
      .from("locations")
      .select("id, code, name, city, status")
      .eq("status", "active")
      .order("code"),
    context.supabase
      .from("financial_snapshots")
      .select("location_id, revenue, ebitda")
      .eq("period_kind", "day")
      .gte("period_start", since.slice(0, 10)),
  ]);
  if (locErr) throw locErr;
  if (finErr) throw finErr;

  const revMap = new Map<string, { revenue: number; ebitda: number }>();
  for (const r of fin ?? []) {
    const cur = revMap.get(r.location_id) ?? { revenue: 0, ebitda: 0 };
    cur.revenue += Number(r.revenue ?? 0);
    cur.ebitda += Number(r.ebitda ?? 0);
    revMap.set(r.location_id, cur);
  }

  const locIds = (locations ?? []).map((l) => l.id);
  const [tickets, incidents, complaints, bookings] = await Promise.all([
    context.supabase
      .from("tickets")
      .select("location_id, priority, status")
      .in("location_id", locIds)
      .is("deleted_at", null)
      .not("status", "in", "(resolved,closed,cancelled)"),
    context.supabase
      .from("incidents")
      .select("location_id")
      .in("location_id", locIds)
      .gte("occurred_at", since),
    context.supabase
      .from("complaints")
      .select("location_id, status")
      .in("location_id", locIds)
      .not("status", "in", "(resolved,dismissed)"),
    context.supabase
      .from("bookings")
      .select("location_id")
      .in("location_id", locIds)
      .gte("created_at", since),
  ]);

  const countBy = (rows: Array<{ location_id: string }> | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.location_id, (m.get(r.location_id) ?? 0) + 1);
    return m;
  };

  const openTickets = tickets.data ?? [];
  const openByLoc = countBy(openTickets);
  const urgentByLoc = new Map<string, number>();
  for (const t of openTickets) {
    if (t.priority === "urgent") {
      urgentByLoc.set(t.location_id, (urgentByLoc.get(t.location_id) ?? 0) + 1);
    }
  }

  const scored: BranchScore[] = (locations ?? []).map((loc) => {
    const finRow = revMap.get(loc.id) ?? { revenue: 0, ebitda: 0 };
    const revenue_30d = finRow.revenue;
    const ebitda_30d = finRow.ebitda;
    const margin_pct = revenue_30d > 0 ? (ebitda_30d / revenue_30d) * 100 : 0;
    const partial: Omit<BranchScore, "score"> = {
      location_id: loc.id,
      code: loc.code,
      name: loc.name,
      city: loc.city,
      revenue_30d,
      ebitda_30d,
      margin_pct,
      open_tickets: openByLoc.get(loc.id) ?? 0,
      urgent_tickets: urgentByLoc.get(loc.id) ?? 0,
      incidents_30d: countBy(incidents.data).get(loc.id) ?? 0,
      complaints_open: countBy(complaints.data).get(loc.id) ?? 0,
      bookings_30d: countBy(bookings.data).get(loc.id) ?? 0,
    };
    return { ...partial, score: computeScore(partial) };
  });

  return scored.sort((a, b) => b.score - a.score);
}, { auth: { capability: "branches.view_pnl" } });
