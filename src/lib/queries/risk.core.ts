import type { AuthContext } from "@/lib/server/auth";

export interface RiskFilters {
  locationId?: string | null;
  minScore?: number;
  status?: string | null;
}

export async function fetchRiskRegister(context: AuthContext, filters: RiskFilters = {}) {
  let q = context.supabase.from("risk_register").select("*").order("risk_score", { ascending: false });
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.minScore) q = q.gte("risk_score", filters.minScore);
  if (filters.status) q = q.eq("status", filters.status);
  const { data: rows, error } = await q;
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

  return (rows ?? []).map((r) => ({
    ...r,
    risk_score: Number(r.risk_score),
    location_code: locMap.get(r.location_id)?.code ?? "—",
    location_name: locMap.get(r.location_id)?.name ?? "—",
  }));
}

export async function fetchRiskSummary(context: AuthContext, filters: RiskFilters = {}) {
  const rows = await fetchRiskRegister(context, filters);
  return {
    total: rows.length,
    high_risk: rows.filter((r) => r.risk_score >= 15).length,
    medium_risk: rows.filter((r) => r.risk_score >= 8 && r.risk_score < 15).length,
    open: rows.filter((r) => r.status === "open").length,
  };
}
