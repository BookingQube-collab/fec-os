import type { AuthContext } from "@/lib/server/auth";
import { createTimer } from "@/lib/performance/timer";

export interface AmcDashboardFilters {
  locationId?: string | null;
  region?: string | null;
  category?: string | null;
  vendor?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  search?: string;
  dueThisWeek?: boolean;
  dueThisMonth?: boolean;
  expiringSoon?: boolean;
  overdueOnly?: boolean;
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AmcDashboardKpis {
  total_active: number;
  total_value: number;
  total_paid: number;
  total_outstanding: number;
  next_service_date: string | null;
  overdue_services: number;
  overdue_contracts: number;
  expiring_30: number;
  expiring_60: number;
}

type AmcContractDedupeKey = {
  id: string;
  location_id: string;
  category: string;
  vendor_name: string;
  contract_ref?: string | null;
  updated_at?: string | null;
};

type AmcDashboardContractRow = AmcContractDedupeKey & {
  vendor_contact_person: string | null;
  vendor_phone: string | null;
  vendor_email: string | null;
  contract_start_date: string;
  contract_end_date: string;
  service_frequency: string;
  contract_value: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  status: string;
  internal_owner: string | null;
  remarks: string | null;
  last_service_date: string | null;
  next_service_date: string | null;
  scope_of_work: string | null;
};

type AmcScheduleRow = {
  id: string;
  contract_id: string;
  service_number: number;
  visit_label: string | null;
  planned_date: string;
  actual_service_date: string | null;
  status: string;
  verification_status: string;
  internal_notes: string | null;
};

type AmcPaymentLineRow = {
  id: string;
  contract_id: string;
  label: string;
  percent: number | null;
  amount: number;
  due_date: string;
  paid: boolean;
  paid_date: string | null;
};

export type AmcEnrichedContract = AmcDashboardContractRow & {
  location_code: string;
  location_name: string;
  region: string;
  mall: string;
  days_left: number;
  schedules: Array<{
    id: string;
    contract_id: string;
    service_number: number;
    visit_label: string | null;
    planned_date: string;
    actual_service_date: string | null;
    status: string;
    verification_status: string;
    internal_notes: string | null;
  }>;
  payment_lines: Array<{
    id: string;
    contract_id: string;
    label: string;
    percent: number | null;
    amount: number;
    due_date: string;
    paid: boolean;
    paid_date: string | null;
  }>;
  visits_total: number;
  visits_done: number;
  visits_pct: number;
  paid_pct: number;
  contract_overdue: boolean;
  next_unpaid_line: AmcPaymentLineRow | null;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dedupeAmcContracts<T extends AmcContractDedupeKey>(contracts: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of contracts) {
    const key = `${c.location_id}\0${c.category}\0${c.vendor_name}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(c);
    groups.set(key, bucket);
  }

  const result: T[] = [];
  for (const items of groups.values()) {
    if (items.length === 1) {
      result.push(items[0]);
      continue;
    }
    const winner = [...items].sort((a, b) => {
      const aE3 = a.contract_ref?.startsWith("E3-AMC-") ? 0 : a.contract_ref ? 1 : 2;
      const bE3 = b.contract_ref?.startsWith("E3-AMC-") ? 0 : b.contract_ref ? 1 : 2;
      if (aE3 !== bE3) return aE3 - bE3;
      return (b.updated_at ?? "").localeCompare(b.updated_at ?? "");
    })[0];
    result.push(winner);
  }
  return result;
}

function effectiveScheduleStatus(status: string, plannedDate: string, todayStr: string): string {
  if (status === "pending" && plannedDate < todayStr) return "overdue";
  return status;
}

async function fetchRawContracts(context: AuthContext, filters: AmcDashboardFilters) {
  let q = context.supabase
    .from("amc_contracts")
    .select(
      "id, location_id, category, vendor_name, contract_ref, vendor_contact_person, vendor_phone, vendor_email, contract_start_date, contract_end_date, service_frequency, contract_value, paid_amount, outstanding_amount, payment_status, status, internal_owner, remarks, last_service_date, next_service_date, scope_of_work, updated_at",
    );
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
  if (filters.activeOnly) q = q.eq("status", "active");
  if (filters.vendor) q = q.ilike("vendor_name", `%${filters.vendor}%`);
  if (filters.search) {
    q = q.or(`vendor_name.ilike.%${filters.search}%,category.ilike.%${filters.search}%`);
  }
  const { data: rawContracts, error } = await q.order("contract_end_date");
  if (error) throw error;
  return dedupeAmcContracts((rawContracts ?? []) as AmcDashboardContractRow[]);
}

function computeKpis(
  filtered: AmcEnrichedContract[],
  allSchedules: AmcScheduleRow[],
  t: string,
): AmcDashboardKpis {
  const schedulesWithStatus = allSchedules.map((s) => ({
    ...s,
    status: effectiveScheduleStatus(s.status, s.planned_date, t),
  }));
  const overdueServices = schedulesWithStatus.filter((s) => s.status === "overdue").length;
  const activeContracts = filtered.filter((c) => c.status === "active");
  const nextService = schedulesWithStatus
    .filter((s) => ["pending", "overdue"].includes(s.status))
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date))[0];

  return {
    total_active: activeContracts.length,
    total_value: activeContracts.reduce((a, c) => a + c.contract_value, 0),
    total_paid: activeContracts.reduce((a, c) => a + c.paid_amount, 0),
    total_outstanding: activeContracts.reduce((a, c) => a + c.outstanding_amount, 0),
    next_service_date: nextService?.planned_date ?? null,
    overdue_services: overdueServices,
    overdue_contracts: filtered.filter((c) => c.contract_overdue).length,
    expiring_30: filtered.filter((c) => c.days_left >= 0 && c.days_left <= 30).length,
    expiring_60: filtered.filter((c) => c.days_left > 30 && c.days_left <= 60).length,
  };
}

function groupByRegion(filtered: AmcEnrichedContract[]) {
  type LocationBucket = {
    location_id: string;
    location_code: string;
    location_name: string;
    contracts: AmcEnrichedContract[];
  };
  const byRegion = new Map<string, Map<string, LocationBucket>>();
  for (const c of filtered) {
    const regionKey = c.region;
    const regionMap = byRegion.get(regionKey) ?? new Map<string, LocationBucket>();
    const locBucket =
      regionMap.get(c.location_id) ??
      {
        location_id: c.location_id,
        location_code: c.location_code,
        location_name: c.location_name,
        contracts: [],
      };
    locBucket.contracts.push(c);
    regionMap.set(c.location_id, locBucket);
    byRegion.set(regionKey, regionMap);
  }

  return [...byRegion.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, locMap]) => ({
      region,
      locations: [...locMap.values()]
        .sort((a, b) => a.location_code.localeCompare(b.location_code))
        .map((loc) => ({
          ...loc,
          contracts: loc.contracts.sort((a, b) => a.contract_end_date.localeCompare(b.contract_end_date)),
        })),
      contracts: filtered.filter((c) => c.region === region),
    }));
}

async function enrichContracts(
  context: AuthContext,
  contracts: AmcDashboardContractRow[],
  filters: AmcDashboardFilters,
): Promise<{ filtered: AmcEnrichedContract[]; schedules: AmcScheduleRow[] }> {
  const locIds = [...new Set(contracts.map((c) => c.location_id))];
  const contractIds = contracts.map((c) => c.id);

  const [{ data: locs }, { data: schedules }, { data: paymentLines }] = await Promise.all([
    locIds.length
      ? context.supabase.from("locations").select("id, code, name, region, city").in("id", locIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string; region: string | null; city: string | null }[] }),
    contractIds.length
      ? context.supabase
          .from("amc_service_schedules")
          .select(
            "id, contract_id, service_number, visit_label, planned_date, actual_service_date, status, verification_status, internal_notes",
          )
          .in("contract_id", contractIds)
          .order("planned_date")
      : Promise.resolve({ data: [] as AmcScheduleRow[] }),
    contractIds.length
      ? context.supabase
          .from("amc_payment_lines")
          .select("id, contract_id, label, percent, amount, due_date, paid, paid_date")
          .in("contract_id", contractIds)
          .order("due_date")
      : Promise.resolve({ data: [] as AmcPaymentLineRow[] }),
  ]);

  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));
  const payByContract = new Map<string, AmcPaymentLineRow[]>();
  for (const p of paymentLines ?? []) {
    const list = payByContract.get(p.contract_id) ?? [];
    list.push(p);
    payByContract.set(p.contract_id, list);
  }

  const schedByContract = new Map<string, AmcScheduleRow[]>();
  for (const s of schedules ?? []) {
    const list = schedByContract.get(s.contract_id) ?? [];
    list.push({
      ...s,
      visit_label: (s.visit_label as string | null) ?? null,
      verification_status: s.verification_status ?? "pending",
    });
    schedByContract.set(s.contract_id, list);
  }

  const t = today();
  const weekEnd = addDays(t, 7);
  const monthEnd = addDays(t, 30);

  let filtered: AmcEnrichedContract[] = contracts.map((c) => {
    const loc = locMap.get(c.location_id);
    const daysLeft = Math.ceil((new Date(c.contract_end_date).getTime() - Date.now()) / 86400000);
    const lines = payByContract.get(c.id) ?? [];
    const amountPaidFromLines = lines.filter((l) => l.paid).reduce((a, l) => a + Number(l.amount), 0);
    const scheds = schedByContract.get(c.id) ?? [];
    const visitsTotal = scheds.length;
    const visitsDone = scheds.filter((s) => s.status === "done").length;
    const contractOverdue =
      scheds.some((s) => !["done", "cancelled"].includes(s.status) && s.planned_date < t) ||
      lines.some((l) => !l.paid && l.due_date < t);
    const nextUnpaidLine = lines.find((l) => !l.paid) ?? null;
    return {
      ...c,
      contract_value: Number(c.contract_value),
      paid_amount: amountPaidFromLines > 0 ? amountPaidFromLines : Number(c.paid_amount),
      outstanding_amount:
        Number(c.contract_value) -
        (amountPaidFromLines > 0 ? amountPaidFromLines : Number(c.paid_amount)),
      location_code: loc?.code ?? "—",
      location_name: loc?.name ?? "—",
      region: loc?.region ?? "—",
      mall: loc?.region ?? "—",
      days_left: daysLeft,
      schedules: scheds.map((s) => ({
        ...s,
        status: effectiveScheduleStatus(s.status, s.planned_date, t),
        visit_label: s.visit_label as string | null,
      })),
      payment_lines: lines.map((l) => ({
        ...l,
        amount: Number(l.amount),
        percent: l.percent != null ? Number(l.percent) : null,
      })),
      visits_total: visitsTotal,
      visits_done: visitsDone,
      visits_pct: visitsTotal ? Math.round((visitsDone / visitsTotal) * 100) : 0,
      paid_pct:
        Number(c.contract_value) > 0
          ? Math.round(
              ((amountPaidFromLines > 0 ? amountPaidFromLines : Number(c.paid_amount)) /
                Number(c.contract_value)) *
                100,
            )
          : 0,
      contract_overdue: contractOverdue,
      next_unpaid_line: nextUnpaidLine,
    };
  });

  if (filters.region) filtered = filtered.filter((c) => c.region === filters.region);
  if (filters.expiringSoon) {
    filtered = filtered.filter((c) => c.days_left >= 0 && c.days_left <= 30);
  }
  if (filters.overdueOnly) {
    filtered = filtered.filter((c) => (c.schedules ?? []).some((s) => s.status === "overdue"));
  }
  if (filters.dueThisWeek) {
    filtered = filtered.filter((c) =>
      (c.schedules ?? []).some(
        (s) => s.status === "pending" && s.planned_date >= t && s.planned_date <= weekEnd,
      ),
    );
  }
  if (filters.dueThisMonth) {
    filtered = filtered.filter((c) =>
      (c.schedules ?? []).some(
        (s) => s.status === "pending" && s.planned_date >= t && s.planned_date <= monthEnd,
      ),
    );
  }

  return { filtered, schedules: (schedules ?? []) as AmcScheduleRow[] };
}

export async function fetchAmcDashboardSummary(
  context: AuthContext,
  filters: AmcDashboardFilters = {},
): Promise<{ kpis: AmcDashboardKpis }> {
  const timer = createTimer("fetchAmcDashboardSummary", "amc-dashboard-summary");
  const contracts = await fetchRawContracts(context, filters);
  const { filtered, schedules } = await enrichContracts(context, contracts, filters);
  const kpis = computeKpis(filtered, schedules, today());
  timer.end({ rowCount: 1 });
  return { kpis };
}

export async function fetchAmcDashboardContracts(
  context: AuthContext,
  filters: AmcDashboardFilters = {},
): Promise<{
  by_region: ReturnType<typeof groupByRegion>;
  contracts: AmcEnrichedContract[];
  total: number;
}> {
  const timer = createTimer("fetchAmcDashboardContracts", "amc-dashboard-contracts");
  const contracts = await fetchRawContracts(context, filters);
  const { filtered } = await enrichContracts(context, contracts, filters);

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 200, 300);
  const from = (page - 1) * pageSize;
  const paged = filtered.slice(from, from + pageSize);

  timer.end({ rowCount: filtered.length });
  return { by_region: groupByRegion(filtered), contracts: paged, total: filtered.length };
}

export async function fetchAmcExpiryAlerts(
  context: AuthContext,
  filters: AmcDashboardFilters = {},
): Promise<
  Array<{
    id: string;
    location_id: string;
    location_code: string;
    category: string;
    vendor_name: string;
    contract_end_date: string;
    days_left: number;
    bucket: "30" | "60";
  }>
> {
  const timer = createTimer("fetchAmcExpiryAlerts", "amc-expiry-alerts");
  const contracts = await fetchRawContracts(context, filters);
  const locIds = [...new Set(contracts.map((c) => c.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l.code]));

  const alerts = contracts
    .map((c) => {
      const daysLeft = Math.ceil((new Date(c.contract_end_date).getTime() - Date.now()) / 86400000);
      let bucket: "30" | "60" | null = null;
      if (daysLeft >= 0 && daysLeft <= 30) bucket = "30";
      else if (daysLeft > 30 && daysLeft <= 60) bucket = "60";
      if (!bucket) return null;
      return {
        id: c.id,
        location_id: c.location_id,
        location_code: locMap.get(c.location_id) ?? "—",
        category: c.category,
        vendor_name: c.vendor_name,
        contract_end_date: c.contract_end_date,
        days_left: daysLeft,
        bucket,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null)
    .sort((a, b) => a.days_left - b.days_left);

  timer.end({ rowCount: alerts.length });
  return alerts;
}

export async function fetchAmcPayments(
  context: AuthContext,
  filters: AmcDashboardFilters = {},
): Promise<
  Array<{
    id: string;
    contract_id: string;
    label: string;
    amount: number;
    due_date: string;
    paid: boolean;
    vendor_name: string;
    location_code: string;
    overdue: boolean;
  }>
> {
  const timer = createTimer("fetchAmcPayments", "amc-payments");
  const contracts = await fetchRawContracts(context, filters);
  const contractIds = contracts.map((c) => c.id);
  if (!contractIds.length) {
    timer.end({ rowCount: 0 });
    return [];
  }

  const contractMap = new Map(contracts.map((c) => [c.id, c]));
  const locIds = [...new Set(contracts.map((c) => c.location_id))];
  const { data: locs } = await context.supabase.from("locations").select("id, code").in("id", locIds);
  const locMap = new Map((locs ?? []).map((l) => [l.id, l.code]));

  const { data: lines, error } = await context.supabase
    .from("amc_payment_lines")
    .select("id, contract_id, label, amount, due_date, paid")
    .in("contract_id", contractIds)
    .order("due_date");
  if (error) throw error;

  const t = today();
  const rows = (lines ?? []).map((l) => {
    const c = contractMap.get(l.contract_id);
    return {
      id: l.id,
      contract_id: l.contract_id,
      label: l.label,
      amount: Number(l.amount),
      due_date: l.due_date,
      paid: l.paid,
      vendor_name: c?.vendor_name ?? "—",
      location_code: c ? (locMap.get(c.location_id) ?? "—") : "—",
      overdue: !l.paid && l.due_date < t,
    };
  });

  timer.end({ rowCount: rows.length });
  return rows;
}

/** Full dashboard payload (CSV export / legacy). */
export async function fetchAmcDashboard(
  context: AuthContext,
  filters: AmcDashboardFilters = {},
) {
  const contracts = await fetchRawContracts(context, filters);
  const { filtered, schedules } = await enrichContracts(context, contracts, filters);
  const kpis = computeKpis(filtered, schedules, today());
  return {
    kpis,
    by_region: groupByRegion(filtered),
    contracts: filtered,
  };
}
