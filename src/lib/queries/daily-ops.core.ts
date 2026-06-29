import { assertLocationAccess } from "@/lib/server/authorize";
import type { AuthContext } from "@/lib/server/auth";

export interface DailyOpsKpis {
  active_employees: number;
  open_incidents: number;
  critical_open_incidents: number;
  items_needing_reorder: number;
  open_maintenance_issues: number;
  urgent_maintenance_open: number;
  open_complaints: number;
  briefings_filed_today: number;
  by_location: DailyOpsLocationKpis[];
}

export interface DailyOpsLocationKpis {
  code: string;
  name: string;
  location_id: string;
  active_employees: number;
  open_incidents: number;
  critical_open_incidents: number;
  items_needing_reorder: number;
  open_maintenance_issues: number;
  urgent_maintenance_open: number;
  open_complaints: number;
  briefings_filed_today: number;
}

async function resolveLocationIds(context: AuthContext, locationId?: string | null): Promise<string[]> {
  if (locationId) {
    await assertLocationAccess(context, locationId);
    return [locationId];
  }
  const { data: roles, error: roleErr } = await context.supabase
    .from("user_roles")
    .select("role_level, location_ids")
    .eq("user_id", context.userId);
  if (roleErr) throw roleErr;

  const isPortfolio = (roles ?? []).some((r) => Number(r.role_level) >= 80);
  if (isPortfolio) {
    const { data: locs, error } = await context.supabase
      .from("locations")
      .select("id")
      .eq("status", "active");
    if (error) throw error;
    return (locs ?? []).map((l) => l.id);
  }

  const ids = new Set<string>();
  for (const r of roles ?? []) {
    for (const id of r.location_ids ?? []) ids.add(id);
  }
  return [...ids];
}

export async function fetchDailyOpsKpis(
  context: AuthContext,
  locationId?: string | null,
): Promise<DailyOpsKpis> {
  const locationIds = await resolveLocationIds(context, locationId);
  if (!locationIds.length) {
    return {
      active_employees: 0,
      open_incidents: 0,
      critical_open_incidents: 0,
      items_needing_reorder: 0,
      open_maintenance_issues: 0,
      urgent_maintenance_open: 0,
      open_complaints: 0,
      briefings_filed_today: 0,
      by_location: [],
    };
  }

  const { data, error } = await context.supabase.rpc("get_daily_ops_kpis", {
    p_location_ids: locationIds,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    active_employees: Number(raw.active_employees ?? 0),
    open_incidents: Number(raw.open_incidents ?? 0),
    critical_open_incidents: Number(raw.critical_open_incidents ?? 0),
    items_needing_reorder: Number(raw.items_needing_reorder ?? 0),
    open_maintenance_issues: Number(raw.open_maintenance_issues ?? 0),
    urgent_maintenance_open: Number(raw.urgent_maintenance_open ?? 0),
    open_complaints: Number(raw.open_complaints ?? 0),
    briefings_filed_today: Number(raw.briefings_filed_today ?? 0),
    by_location: (raw.by_location as DailyOpsLocationKpis[]) ?? [],
  };
}

export async function fetchShiftBriefings(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("shift_briefings")
    .select(
      "id, briefing_date, location_id, shift, supervisor_name, staff_scheduled, staff_present, staff_absent, attendance_pct, key_notes, handover_items, filled_by, created_at",
    )
    .order("briefing_date", { ascending: false })
    .limit(100);
  if (locationId) {
    await assertLocationAccess(context, locationId);
    q = q.eq("location_id", locationId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchDailyOpsIncidents(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("incidents")
    .select(
      "id, location_id, occurred_at, category, severity, summary, detail, action_taken, status, closed_at, reported_by, created_at",
    )
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (locationId) {
    await assertLocationAccess(context, locationId);
    q = q.eq("location_id", locationId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchDailyOpsMaintenance(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("supervisor_issues_enriched")
    .select(
      "id, entry_ref, date_reported, location_id, area_equipment, description, priority, assigned_to, status, date_resolved, days_open, log_date, category, zone",
    )
    .order("log_date", { ascending: false })
    .limit(200);
  if (locationId) {
    await assertLocationAccess(context, locationId);
    q = q.eq("location_id", locationId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchDailyOpsRoster(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("staff")
    .select(
      "id, location_id, employee_code, full_name, staff_role, phone, hire_date, status, job_title",
    )
    .is("deleted_at", null)
    .order("full_name");
  if (locationId) {
    await assertLocationAccess(context, locationId);
    q = q.eq("location_id", locationId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchDailyOpsShiftRoster(
  context: AuthContext,
  locationId?: string | null,
  from?: string | null,
  to?: string | null,
) {
  const fromDate = from ?? new Date().toISOString().slice(0, 10);
  const toDate =
    to ??
    new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);

  let q = context.supabase
    .from("shifts")
    .select(
      "id, location_id, staff_id, user_id, role_label, starts_at, ends_at, status, roster_upload_id",
    )
    .gte("starts_at", `${fromDate}T00:00:00+03:00`)
    .lte("starts_at", `${toDate}T23:59:59+03:00`)
    .order("starts_at");
  if (locationId) {
    await assertLocationAccess(context, locationId);
    q = q.eq("location_id", locationId);
  }
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows?.length) return [];

  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[];
  const locationIds = [...new Set(rows.map((r) => r.location_id))];

  const [{ data: staff }, { data: locations }] = await Promise.all([
    staffIds.length
      ? context.supabase
          .from("staff")
          .select("id, full_name, employee_code, staff_role")
          .in("id", staffIds)
      : Promise.resolve({ data: [] }),
    context.supabase.from("locations").select("id, code, name").in("id", locationIds),
  ]);

  const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));
  const locMap = new Map((locations ?? []).map((l) => [l.id, l]));

  return rows.map((r) => ({
    ...r,
    staff: r.staff_id ? staffMap.get(r.staff_id) ?? null : null,
    location: locMap.get(r.location_id) ?? null,
  }));
}

export async function fetchDailyOpsRosterUploads(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("daily_ops_roster_uploads")
    .select(
      "id, location_id, file_name, file_path, file_type, period_start, period_end, rows_imported, uploaded_by, notes, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (locationId) {
    await assertLocationAccess(context, locationId);
    q = q.eq("location_id", locationId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchDailyOpsComplaints(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("complaints")
    .select(
      "id, location_id, channel, severity, category, summary, guest_name, status, handled_by, created_at, resolved_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (locationId) {
    await assertLocationAccess(context, locationId);
    q = q.eq("location_id", locationId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
