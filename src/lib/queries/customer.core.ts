import type { AuthContext } from "@/lib/server/auth";

export async function fetchComplaints(
  context: AuthContext,
  filters: { locationId?: string | null; status?: string | null } = {},
) {
  let q = context.supabase
    .from("complaints")
    .select(
      "id, location_id, channel, severity, category, summary, guest_name, guest_contact, status, ai_triage, created_at, resolved_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.status) q = q.eq("status", filters.status as "new" | "investigating" | "resolved" | "escalated" | "dismissed");
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}
