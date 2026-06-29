import type { AuthContext } from "@/lib/server/auth";
import type { MasterDepartmentRow } from "@/lib/staff-departments";

export interface SiteRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  region: string | null;
  status: string;
}

export async function fetchSites(context: AuthContext): Promise<SiteRow[]> {
  const { data, error } = await context.supabase
    .from("locations")
    .select("id, code, name, city, region, status")
    .eq("status", "active")
    .order("code");
  if (error) throw error;
  return data ?? [];
}

export interface WorkOrderListRow {
  id: string;
  location_id: string;
  title: string;
  kind: string;
  status: string;
  planned_end: string | null;
  assigned_to: string | null;
  created_at: string;
}

export interface WorkOrderFilters {
  locationId?: string | null;
  status?: string | null;
  mine?: boolean;
  page?: number;
  pageSize?: number;
}

export async function fetchWorkOrders(
  context: AuthContext,
  filters: WorkOrderFilters = {},
): Promise<{ items: WorkOrderListRow[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = context.supabase
    .from("work_orders")
    .select("id, location_id, title, kind, status, planned_end, assigned_to, created_at", { count: "exact" })
    .is("deleted_at", null)
    .order("planned_end", { ascending: true, nullsFirst: false })
    .range(from, to);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.status) q = q.eq("status", filters.status as "planned" | "in_progress" | "on_hold" | "completed" | "cancelled");
  if (filters.mine) q = q.eq("assigned_to", context.userId);
  const { data: rows, error, count } = await q;
  if (error) throw error;
  return { items: rows ?? [], total: count ?? 0 };
}

export interface AssetListRow {
  id: string;
  location_id: string;
  tag: string;
  name: string;
  category: string | null;
  criticality: string;
  warranty_expires_on: string | null;
  last_heartbeat_at: string | null;
  heartbeat_interval_minutes: number | null;
}

export async function fetchAssets(
  context: AuthContext,
  locationId?: string | null,
): Promise<AssetListRow[]> {
  let q = context.supabase
    .from("assets")
    .select(
      "id, location_id, tag, name, category, criticality, warranty_expires_on, last_heartbeat_at, heartbeat_interval_minutes",
    )
    .is("deleted_at", null)
    .order("tag")
    .limit(500);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}

// ——— Issues / tickets ———

export interface IssueListRow {
  id: string;
  location_id: string;
  title: string;
  category: string | null;
  priority: string;
  status: string;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueFilters {
  locationId?: string | null;
  status?: string | null;
  priority?: string | null;
  page?: number;
  pageSize?: number;
}

export async function fetchIssues(
  context: AuthContext,
  filters: IssueFilters = {},
): Promise<{ items: IssueListRow[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = context.supabase
    .from("tickets")
    .select(
      "id, location_id, title, category, priority, status, sla_due_at, created_at, updated_at",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.status) q = q.eq("status", filters.status as "open" | "assigned" | "in_progress" | "blocked" | "resolved" | "closed" | "cancelled");
  if (filters.priority) q = q.eq("priority", filters.priority as "low" | "normal" | "high" | "urgent");
  const { data: rows, error, count } = await q;
  if (error) throw error;
  return { items: rows ?? [], total: count ?? 0 };
}

// ——— Bookings ———

export interface BookingListRow {
  id: string;
  reference: string;
  location_id: string;
  kind: string;
  status: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  party_size: number;
  starts_at: string;
  ends_at: string | null;
  quote_amount: number | null;
  deposit_amount: number | null;
  total_amount: number | null;
  created_at: string;
}

export interface BookingFilters {
  locationId?: string | null;
  status?: string | null;
  kind?: string | null;
  page?: number;
  pageSize?: number;
}

export async function fetchBookings(
  context: AuthContext,
  filters: BookingFilters = {},
): Promise<{ items: BookingListRow[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = context.supabase
    .from("bookings")
    .select(
      "id, reference, location_id, kind, status, contact_name, contact_email, contact_phone, party_size, starts_at, ends_at, quote_amount, deposit_amount, total_amount, created_at",
      { count: "exact" },
    )
    .order("starts_at", { ascending: false })
    .range(from, to);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.status) q = q.eq("status", filters.status as "quote" | "deposit" | "confirmed" | "delivered" | "cancelled" | "no_show");
  if (filters.kind) q = q.eq("kind", filters.kind as "party" | "group" | "corporate" | "school");
  const { data: rows, error, count } = await q;
  if (error) throw error;
  return { items: rows ?? [], total: count ?? 0 };
}

// ——— Tasks ———

export interface TaskInstanceRow {
  id: string;
  template_id: string;
  location_id: string;
  title: string;
  due_at: string | null;
  status: string;
  assigned_to: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface TaskTemplateRow {
  id: string;
  location_id: string;
  title: string;
  kind: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface TaskFilters {
  locationId?: string | null;
  status?: string | null;
}

export async function fetchTaskInstances(
  context: AuthContext,
  filters: TaskFilters = {},
): Promise<TaskInstanceRow[]> {
  let q = context.supabase
    .from("task_instances")
    .select(
      "id, template_id, location_id, title, due_at, status, assigned_to, submitted_at, verified_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.status) q = q.eq("status", filters.status);
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}

export async function fetchTaskTemplates(
  context: AuthContext,
  locationId?: string | null,
): Promise<TaskTemplateRow[]> {
  let q = context.supabase
    .from("task_templates")
    .select("id, location_id, title, kind, description, active, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}

// ——— Notifications / escalations ———

export interface EscalationRow {
  id: string;
  location_id: string;
  source: string;
  title: string;
  detail: string | null;
  severity: string;
  status: string;
  due_at: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  category: string;
  title: string;
  body: string | null;
  severity: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
  location_id: string | null;
}

export async function fetchEscalations(context: AuthContext): Promise<EscalationRow[]> {
  const { data, error } = await context.supabase
    .from("escalations")
    .select("id, location_id, source, title, detail, severity, status, due_at, created_at")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return data ?? [];
}

export async function fetchNotifications(
  context: AuthContext,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationRow[]> {
  const limit = Math.min(opts.limit ?? 30, 100);
  let q = context.supabase
    .from("notifications")
    .select("id, category, title, body, severity, action_url, read_at, created_at, location_id")
    .eq("user_id", context.userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.unreadOnly) q = q.is("read_at", null);
  const { data: rows, error } = await q;
  if (error) throw error;
  return (rows ?? []) as NotificationRow[];
}

// ——— People / staff ———

export interface StaffRow {
  id: string;
  employee_code: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  department_ids: string[];
  department_names: string[];
  status: string;
  location_id: string;
  location_code: string | null;
  location_name: string | null;
  phone: string | null;
  email: string | null;
  hire_date: string | null;
}

type StaffDeptJoin = {
  department_id: string;
  master_departments: { id: string; name: string; sort_order: number } | null;
};

function mapStaffRow(
  row: Record<string, unknown> & {
    locations?: { code: string; name: string } | null;
    staff_departments?: StaffDeptJoin[] | null;
  },
): StaffRow {
  const loc = row.locations ?? null;
  const deptLinks = row.staff_departments ?? [];
  const sorted = [...deptLinks].sort((a, b) => {
    const ao = a.master_departments?.sort_order ?? 0;
    const bo = b.master_departments?.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return (a.master_departments?.name ?? "").localeCompare(b.master_departments?.name ?? "");
  });
  const department_ids = sorted.map((d) => d.department_id);
  const department_names = sorted
    .map((d) => d.master_departments?.name)
    .filter((n): n is string => Boolean(n));
  const { locations: _locations, staff_departments: _sd, ...rest } = row;
  const department =
    typeof rest.department === "string" && rest.department.trim()
      ? rest.department
      : department_names.length
        ? department_names.join(", ")
        : null;
  return {
    ...(rest as Omit<StaffRow, "location_code" | "location_name" | "department_ids" | "department_names">),
    department,
    department_ids,
    department_names,
    location_code: loc?.code ?? null,
    location_name: loc?.name ?? null,
  };
}

export async function fetchMasterDepartments(context: AuthContext): Promise<MasterDepartmentRow[]> {
  const { data: rows, error } = await context.supabase
    .from("master_departments")
    .select("id, name, code, active, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (rows ?? []) as MasterDepartmentRow[];
}

export async function fetchStaff(
  context: AuthContext,
  locationId?: string | null,
): Promise<StaffRow[]> {
  let q = context.supabase
    .from("staff")
    .select(
      "id, employee_code, full_name, job_title, department, status, location_id, phone, email, hire_date, locations(code, name), staff_departments(department_id, master_departments(id, name, sort_order))",
    )
    .is("deleted_at", null)
    .order("full_name")
    .limit(500);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;
  return (rows ?? []).map((row) => mapStaffRow(row));
}

// ——— Facility ———

export interface FacilityTaskRow {
  id: string;
  location_id: string;
  category: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  completed_at: string | null;
  notes: string | null;
  location_code?: string;
  location_name?: string;
  region?: string;
}

export interface FacilityFilters {
  locationId?: string | null;
  category?: string | null;
  status?: string | null;
}

export async function fetchFacilityTasks(
  context: AuthContext,
  filters: FacilityFilters = {},
): Promise<FacilityTaskRow[]> {
  let q = context.supabase
    .from("facility_tasks")
    .select(
      "id, location_id, category, title, description, priority, status, due_date, assigned_to, completed_at, notes",
    )
    .order("due_date")
    .limit(200);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.status) q = q.eq("status", filters.status);
  const { data: rows, error } = await q;
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code, name, region").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

  return (rows ?? []).map((r) => ({
    ...r,
    location_code: locMap.get(r.location_id)?.code ?? "—",
    location_name: locMap.get(r.location_id)?.name ?? "—",
    region: locMap.get(r.location_id)?.region ?? "—",
  }));
}

export async function fetchFacilityDashboard(context: AuthContext, filters: FacilityFilters = {}) {
  const tasks = await fetchFacilityTasks(context, filters);
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const readiness = tasks.filter((t) => t.category === "site_readiness");
  const readinessDone = readiness.filter((t) => t.status === "completed").length;
  const readinessScore = readiness.length ? Math.round((readinessDone / readiness.length) * 100) : 100;

  const byCategory = [
    "cleaning", "pest_control", "hvac", "fire_systems", "cctv",
    "mall_approvals", "maintenance_issues", "safety_observations", "site_readiness",
  ].reduce((acc, cat) => {
    acc[cat] = open.filter((t) => t.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  const byRegion = new Map<string, FacilityTaskRow[]>();
  for (const t of open) {
    const list = byRegion.get(t.region ?? "—") ?? [];
    list.push(t);
    byRegion.set(t.region ?? "—", list);
  }

  return {
    open_count: open.length,
    overdue_count: overdue.length,
    site_readiness_score: readinessScore,
    by_category: byCategory,
    by_region: [...byRegion.entries()].map(([region, items]) => ({ region, tasks: items })),
    tasks,
  };
}

// ——— Utilities ———

export interface UtilityRow {
  id: string;
  location_id: string;
  utility_type: string;
  period_month: string;
  consumption: number | null;
  bill_amount: number;
  location_code?: string;
  location_name?: string;
}

export async function fetchUtilityConsumption(
  context: AuthContext,
  locationId?: string | null,
): Promise<UtilityRow[]> {
  let q = context.supabase
    .from("utility_consumption")
    .select("id, location_id, utility_type, period_month, consumption, bill_amount")
    .order("period_month", { ascending: false })
    .limit(200);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

  return (rows ?? []).map((r) => ({
    ...r,
    bill_amount: Number(r.bill_amount),
    consumption: r.consumption != null ? Number(r.consumption) : null,
    location_code: locMap.get(r.location_id)?.code ?? "—",
    location_name: locMap.get(r.location_id)?.name ?? "—",
  }));
}

export async function fetchUtilityDashboard(context: AuthContext, locationId?: string | null) {
  const rows = await fetchUtilityConsumption(context, locationId);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = rows.filter((r) => r.period_month.startsWith(month));
  const totalCost = thisMonth.reduce((a, r) => a + r.bill_amount, 0);

  const bySite = new Map<string, { code: string; cost: number; kwh: number }>();
  for (const r of thisMonth) {
    const b = bySite.get(r.location_id) ?? { code: r.location_code ?? "—", cost: 0, kwh: 0 };
    b.cost += r.bill_amount;
    if (r.utility_type === "electricity" && r.consumption) b.kwh += r.consumption;
    bySite.set(r.location_id, b);
  }

  const siteComparison = [...bySite.entries()]
    .map(([location_id, v]) => ({ location_id, ...v }))
    .sort((a, b) => b.cost - a.cost);

  const highConsumptionAlerts = siteComparison.filter((s) => s.kwh > 5000);

  return {
    total_cost_this_month: totalCost,
    record_count: thisMonth.length,
    high_consumption_alerts: highConsumptionAlerts,
    site_comparison: siteComparison,
    rows,
  };
}

export interface PmScheduleRow {
  id: string;
  location_id: string;
  asset_id: string | null;
  title: string;
  kind: string;
  interval_days: number;
  next_due_at: string;
  last_generated_at: string | null;
  active: boolean;
}

export async function fetchPmSchedules(
  context: AuthContext,
  locationId?: string | null,
): Promise<PmScheduleRow[]> {
  let q = context.supabase
    .from("pm_schedules")
    .select("id, location_id, asset_id, title, kind, interval_days, next_due_at, last_generated_at, active")
    .order("next_due_at");
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}

export interface DowntimeEventRow {
  id: string;
  location_id: string;
  asset_id: string | null;
  reason: string;
  source: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
}

export interface DowntimeFilters {
  locationId?: string | null;
  openOnly?: boolean;
}

export async function fetchDowntimeEvents(
  context: AuthContext,
  filters: DowntimeFilters = {},
): Promise<DowntimeEventRow[]> {
  let q = context.supabase
    .from("downtime_events")
    .select("id, location_id, asset_id, reason, source, started_at, ended_at, duration_minutes")
    .order("started_at", { ascending: false })
    .limit(200);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.openOnly) q = q.is("ended_at", null);
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}
