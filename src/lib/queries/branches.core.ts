import type { AuthContext } from "@/lib/server/auth";

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

function computeScore(b: Omit<BranchScore, "score">): number {
  const revScore = Math.min(40, (b.revenue_30d / 500_000) * 40);
  const marginScore = Math.min(20, b.margin_pct);
  const opsPenalty =
    b.urgent_tickets * 12 + b.open_tickets * 2 + b.incidents_30d * 8 + b.complaints_open * 4;
  const bookingBonus = Math.min(10, b.bookings_30d * 0.5);
  return Math.max(0, Math.round(revScore + marginScore + bookingBonus - opsPenalty));
}

export async function fetchBranchLeague(context: AuthContext): Promise<BranchScore[]> {
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

  return (locations ?? [])
    .map((loc) => {
      const rev = revMap.get(loc.id) ?? { revenue: 0, ebitda: 0 };
      const locTickets = (tickets.data ?? []).filter((t) => t.location_id === loc.id);
      const partial = {
        location_id: loc.id,
        code: loc.code,
        name: loc.name,
        city: loc.city,
        revenue_30d: rev.revenue,
        ebitda_30d: rev.ebitda,
        margin_pct: rev.revenue > 0 ? (rev.ebitda / rev.revenue) * 100 : 0,
        open_tickets: locTickets.length,
        urgent_tickets: locTickets.filter((t) => t.priority === "urgent").length,
        incidents_30d: (incidents.data ?? []).filter((i) => i.location_id === loc.id).length,
        complaints_open: (complaints.data ?? []).filter((c) => c.location_id === loc.id).length,
        bookings_30d: (bookings.data ?? []).filter((b) => b.location_id === loc.id).length,
      };
      return { ...partial, score: computeScore(partial) };
    })
    .sort((a, b) => b.score - a.score);
}
