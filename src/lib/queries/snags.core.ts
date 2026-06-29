import type { AuthContext } from "@/lib/server/auth";

const SNAG_STATUSES = [
  "open", "assigned", "in_progress", "waiting_vendor", "waiting_approval",
  "resolved", "verified", "closed", "reopened",
] as const;

export interface SnagFilters {
  locationId?: string | null;
  status?: string | null;
  category?: string | null;
}

export async function fetchSnags(context: AuthContext, filters: SnagFilters = {}) {
  let q = context.supabase
    .from("snag_items")
    .select(
      "id, snag_number, location_id, raised_at, area, department, category, description, severity, priority, status, target_date, risk_score, vendor_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.category) q = q.eq("category", filters.category);
  const { data: rows, error } = await q;
  if (error) throw error;

  const today = new Date().toISOString().slice(0, 10);
  return (rows ?? []).map((r) => ({
    ...r,
    days_open: Math.max(0, Math.floor((Date.now() - new Date(r.raised_at).getTime()) / 86400000)),
    overdue: r.target_date ? r.target_date < today && !["closed", "verified"].includes(r.status) : false,
  }));
}

export async function fetchSnag(context: AuthContext, id: string) {
  const { data: snag, error } = await context.supabase
    .from("snag_items")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const [{ data: photos }, { data: history }] = await Promise.all([
    context.supabase.from("snag_photos").select("*").eq("snag_id", id).order("created_at"),
    context.supabase
      .from("snag_status_history")
      .select("*")
      .eq("snag_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return { ...snag, photos: photos ?? [], history: history ?? [] };
}

export async function fetchSnagDashboard(context: AuthContext, filters: SnagFilters = {}) {
  let q = context.supabase
    .from("snag_items")
    .select("id, location_id, status, severity, target_date");
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  const { data: rows, error } = await q;
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

  const today = new Date().toISOString().slice(0, 10);
  const items = rows ?? [];
  const open = items.filter((i) => !["closed", "verified"].includes(i.status));
  const overdue = open.filter((i) => i.target_date && i.target_date < today);

  const byBranch = new Map<string, { code: string; name: string; open: number; overdue: number }>();
  for (const item of open) {
    const loc = locMap.get(item.location_id);
    const key = item.location_id;
    const bucket = byBranch.get(key) ?? { code: loc?.code ?? "—", name: loc?.name ?? "—", open: 0, overdue: 0 };
    bucket.open += 1;
    if (item.target_date && item.target_date < today) bucket.overdue += 1;
    byBranch.set(key, bucket);
  }

  return {
    total_open: open.length,
    total_overdue: overdue.length,
    by_status: SNAG_STATUSES.reduce(
      (acc, s) => {
        acc[s] = items.filter((i) => i.status === s).length;
        return acc;
      },
      {} as Record<string, number>,
    ),
    by_branch: [...byBranch.values()],
  };
}
