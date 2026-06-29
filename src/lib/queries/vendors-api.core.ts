import type { AuthContext } from "@/lib/server/auth";

export interface VendorListRow {
  id: string;
  name: string;
  category: string;
  service_category: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  trade_license_no: string | null;
  cr_no: string | null;
  address: string | null;
  amc_status: string | null;
  status: string | null;
  active: boolean;
}

export interface VendorFilters {
  locationId?: string | null;
  category?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export async function fetchVendorsApi(
  context: AuthContext,
  filters: VendorFilters = {},
): Promise<{ items: VendorListRow[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = context.supabase
    .from("vendors")
    .select(
      "id, name, category, service_category, contact_person, phone, email, trade_license_no, cr_no, address, amc_status, status, active, branch_coverage",
      { count: "exact" },
    )
    .eq("active", true)
    .order("name")
    .range(from, to);

  if (filters.category) q = q.eq("category", filters.category);
  if (filters.search) {
    const s = `%${filters.search}%`;
    q = q.or(`name.ilike.${s},contact_person.ilike.${s},trade_license_no.ilike.${s},cr_no.ilike.${s}`);
  }

  const { data: rows, error, count } = await q;
  if (error) throw error;

  let items = (rows ?? []) as (VendorListRow & { branch_coverage?: string[] })[];
  if (filters.locationId) {
    items = items.filter(
      (v) => !v.branch_coverage?.length || v.branch_coverage.includes(filters.locationId!),
    );
  }

  return {
    items: items.map(({ branch_coverage: _bc, ...v }) => v),
    total: count ?? items.length,
  };
}

export interface VendorDashboardPayload {
  contracts_expiring_soon: number;
  pending_followups: number;
  overdue_followups: number;
  contracts: Array<{
    id: string;
    title: string;
    end_date: string | null;
    status: string;
    vendor_id: string;
    location_id: string | null;
    vendor_name: string;
  }>;
  followups: Array<{
    id: string;
    title: string;
    due_date: string | null;
    status: string;
    vendor_id: string;
    vendor_name: string;
  }>;
}

export async function fetchVendorDashboard(
  context: AuthContext,
  locationId?: string | null,
): Promise<VendorDashboardPayload> {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [{ data: contracts }, { data: followups }, { data: vendors }] = await Promise.all([
    context.supabase
      .from("vendor_contracts")
      .select("id, title, end_date, status, vendor_id, location_id")
      .eq("status", "active")
      .lte("end_date", soon),
    context.supabase
      .from("vendor_followups")
      .select("id, title, due_date, status, vendor_id")
      .eq("status", "pending")
      .order("due_date"),
    context.supabase.from("vendors").select("id, name"),
  ]);

  const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v.name]));

  let contractRows = contracts ?? [];
  const followupRows = followups ?? [];
  if (locationId) {
    contractRows = contractRows.filter((c) => !c.location_id || c.location_id === locationId);
  }

  return {
    contracts_expiring_soon: contractRows.length,
    pending_followups: followupRows.length,
    overdue_followups: followupRows.filter((f) => f.due_date != null && f.due_date < today).length,
    contracts: contractRows.slice(0, 10).map((c) => ({
      ...c,
      vendor_name: vendorMap.get(c.vendor_id) ?? "—",
    })),
    followups: followupRows.slice(0, 10).map((f) => ({
      ...f,
      vendor_name: vendorMap.get(f.vendor_id) ?? "—",
    })),
  };
}
