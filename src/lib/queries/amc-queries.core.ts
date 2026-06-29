import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface AmcContractListRow {
  id: string;
  location_id: string;
  category: string;
  vendor_name: string;
  contract_end_date: string;
  status: string;
  payment_status: string;
  contract_value: number;
  outstanding_amount: number;
  location_code?: string;
}

export interface AmcContractFilters {
  locationId?: string | null;
  category?: string | null;
  status?: string | null;
  page?: number;
  pageSize?: number;
}

export async function fetchAmcContracts(
  context: AuthContext,
  filters: AmcContractFilters = {},
): Promise<{ items: AmcContractListRow[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = context.supabase
    .from("amc_contracts")
    .select(
      "id, location_id, category, vendor_name, contract_end_date, status, payment_status, contract_value, outstanding_amount",
      { count: "exact" },
    )
    .order("contract_end_date")
    .range(from, to);
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.status) q = q.eq("status", filters.status);
  const { data: rows, error, count } = await q;
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l.code]));

  return {
    items: (rows ?? []).map((r) => ({
      ...r,
      contract_value: Number(r.contract_value),
      outstanding_amount: Number(r.outstanding_amount ?? 0),
      location_code: locMap.get(r.location_id),
    })),
    total: count ?? 0,
  };
}

export interface AmcScheduleListRow {
  id: string;
  contract_id: string;
  service_number: number;
  visit_label: string | null;
  planned_date: string;
  actual_service_date: string | null;
  status: string;
  verification_status: string;
  category?: string;
  vendor_name?: string;
  location_id?: string;
}

export interface AmcScheduleFilters {
  locationId?: string | null;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export async function fetchAmcSchedules(
  context: AuthContext,
  filters: AmcScheduleFilters = {},
): Promise<{ items: AmcScheduleListRow[]; total: number }> {
  let cq = context.supabase.from("amc_contracts").select("id, location_id, category, vendor_name");
  if (filters.locationId) cq = cq.eq("location_id", filters.locationId);
  const { data: contracts } = await cq;
  const contractMap = new Map((contracts ?? []).map((c) => [c.id, c]));
  const ids = (contracts ?? []).map((c) => c.id);
  if (!ids.length) return { items: [], total: 0 };

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 100, 300);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let sq = context.supabase
    .from("amc_service_schedules")
    .select(
      "id, contract_id, service_number, visit_label, planned_date, actual_service_date, status, verification_status",
      { count: "exact" },
    )
    .in("contract_id", ids)
    .order("planned_date")
    .range(from, to);
  if (filters.overdueOnly) sq = sq.eq("status", "overdue");

  const { data: schedules, error, count } = await sq;
  if (error) throw error;

  return {
    items: (schedules ?? []).map((s) => {
      const c = contractMap.get(s.contract_id);
      return {
        ...s,
        visit_label: s.visit_label as string | null,
        category: c?.category,
        vendor_name: c?.vendor_name,
        location_id: c?.location_id,
      };
    }),
    total: count ?? 0,
  };
}

export interface ComplianceRenewalRow {
  id: string;
  item_name: string;
  domain: string;
  venue_scope: string;
  alert_tier: string;
  status: string;
  expiry_date: string | null;
}

export interface ComplianceRenewalFilters {
  locationCode?: string | null;
  alertTier?: string | null;
  limit?: number;
}

export async function fetchComplianceRenewals(
  context: AuthContext,
  filters: ComplianceRenewalFilters = {},
): Promise<ComplianceRenewalRow[]> {
  const timer = createTimer("fetchComplianceRenewals", "get_compliance_renewals");
  const limit = Math.min(filters.limit ?? 50, 200);

  const rpcResult = await context.supabase.rpc("get_compliance_renewals", {
    p_limit: limit,
    p_location_code: filters.locationCode ?? null,
  });
  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    let rows = rpcResult.data as Array<{
      id: string;
      item_name: string;
      domain: string;
      venue_scope: string;
      alert_tier: string;
      status: string;
      expiry_date: string | null;
    }>;
    if (filters.alertTier) {
      rows = rows.filter((r) => r.alert_tier === filters.alertTier);
    }
    const mapped = rows.map((r) => ({
      id: r.id,
      item_name: r.item_name,
      domain: r.domain,
      venue_scope: r.venue_scope,
      alert_tier: String(r.alert_tier),
      status: String(r.status),
      expiry_date: r.expiry_date != null ? String(r.expiry_date) : null,
    }));
    timer.end({ rowCount: mapped.length });
    return mapped;
  }
  if (rpcResult.error) {
    console.warn("[compliance-renewals] RPC get_compliance_renewals failed:", rpcResult.error.message);
  }

  const horizon = addDays(today(), 60);
  let q = context.supabase
    .from("compliance_items")
    .select("id, item_name, domain, venue_scope, status, expiry_date, next_due_date")
    .or(`expiry_date.lte.${horizon},next_due_date.lte.${horizon}`)
    .order("expiry_date")
    .limit(limit);
  const { data, error } = await q;
  if (error) throw error;

  const tierFromDates = (expiry: string | null, nextDue: string | null): string => {
    const governing = nextDue ?? expiry;
    if (!governing) return "No Date";
    if (governing < today()) return "Expired";
    if (governing <= addDays(today(), 30)) return "Due ≤30";
    if (governing <= addDays(today(), 60)) return "Due ≤60";
    return "OK";
  };

  let rows = (data ?? [])
    .map((r) => {
      const expiry_date = r.next_due_date ?? r.expiry_date;
      return {
        id: r.id,
        item_name: r.item_name,
        domain: r.domain,
        venue_scope: r.venue_scope,
        alert_tier: tierFromDates(
          r.expiry_date != null ? String(r.expiry_date) : null,
          r.next_due_date != null ? String(r.next_due_date) : null,
        ),
        status: String(r.status),
        expiry_date: expiry_date != null ? String(expiry_date) : null,
      };
    })
    .filter((r) => ["Due ≤30", "Due ≤60", "Expired"].includes(r.alert_tier))
    .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));

  if (filters.locationCode) {
    rows = rows.filter((r) => String(r.venue_scope).includes(filters.locationCode!));
  }
  if (filters.alertTier) {
    rows = rows.filter((r) => r.alert_tier === filters.alertTier);
  }
  const result = rows.slice(0, limit);
  timer.end({ rowCount: result.length });
  return result;
}

export async function fetchAmcRenewals(
  context: AuthContext,
  days = 30,
): Promise<
  Array<{
    id: string;
    location_id: string;
    category: string;
    vendor_name: string;
    contract_end_date: string;
    contract_value: number | null;
    payment_status: string | null;
    status: string;
    days_left: number;
    location_code?: string;
    location_name?: string;
    region?: string | null;
  }>
> {
  const end = addDays(today(), days);
  const { data: rows, error } = await context.supabase
    .from("amc_contracts")
    .select("id, location_id, category, vendor_name, contract_end_date, contract_value, status, payment_status")
    .gte("contract_end_date", today())
    .lte("contract_end_date", end)
    .neq("status", "cancelled")
    .order("contract_end_date");
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code, name, region").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

  return (rows ?? []).map((r) => {
    const loc = locMap.get(r.location_id);
    return {
      ...r,
      location_code: loc?.code,
      location_name: loc?.name,
      region: loc?.region,
      days_left: Math.ceil((new Date(r.contract_end_date).getTime() - Date.now()) / 86400000),
    };
  });
}
