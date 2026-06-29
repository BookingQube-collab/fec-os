import type { AuthContext } from "@/lib/server/auth";
import { complianceScore } from "@/lib/compliance/location-compliance-derive";

export interface LocationTrackerFilters {
  locationId?: string | null;
  category?: string | null;
  status?: string | null;
  vendor?: string | null;
  expiryBucket?: string | null;
  missingDocs?: boolean;
  outstandingPayment?: boolean;
  highRisk?: boolean;
  requiredOnly?: boolean;
}

export interface LocationTrackerKpis {
  total: number;
  expired: number;
  due_7: number;
  due_15: number;
  due_30: number;
  due_60: number;
  missing_docs: number;
  missing_quotation: number;
  missing_invoice: number;
  missing_payment_proof: number;
  pending_service_reports: number;
  outstanding_payments: number;
  high_risk_locations: number;
  compliance_score: number;
}

const LIST_SELECT =
  "id, location_id, location_code, location_name, area_sub_area, category, requirement_name, document_contract_type, is_required, vendor_name, issuing_authority, cert_contract_number, start_date, issue_date, expiry_date, renewal_due_date, service_frequency, last_service_date, next_service_date, computed_status, days_remaining, risk_level, owner, department, quotation_amount, paid_amount, outstanding_amount, payment_status, attachment_status, has_certificate, has_quotation, has_invoice, has_payment_proof, has_service_report, remarks, amc_contract_id, compliance_document_id, updated_at";

type EnrichedQuery = ReturnType<AuthContext["supabase"]["from"]>;

function applyFilters(query: EnrichedQuery, filters: LocationTrackerFilters): EnrichedQuery {
  let q = query;
  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.status) q = q.eq("computed_status", filters.status);
  if (filters.vendor) q = q.ilike("vendor_name", `%${filters.vendor}%`);
  if (filters.expiryBucket) q = q.eq("expiry_bucket", filters.expiryBucket);
  if (filters.requiredOnly) q = q.eq("is_required", true);
  if (filters.highRisk) q = q.in("risk_level", ["Critical", "High"]);
  if (filters.missingDocs) {
    q = q.or("computed_status.eq.Missing,attachment_status.eq.none");
  }
  if (filters.outstandingPayment) {
    q = q.gt("outstanding_amount", 0);
  }
  return q;
}

export async function fetchLocationTrackerKpis(
  context: AuthContext,
  filters: LocationTrackerFilters = {},
): Promise<LocationTrackerKpis> {
  const count = (extra?: (q: EnrichedQuery) => EnrichedQuery) => {
    let q = applyFilters(
      context.supabase.from("location_compliance_items_enriched").select("id", { count: "exact", head: true }),
      filters,
    );
    if (extra) q = extra(q);
    return q;
  };

  const [
    totalRes,
    expiredRes,
    d7Res,
    d15Res,
    d30Res,
    d60Res,
    missingRes,
    missingQuoteRes,
    missingInvRes,
    missingPayRes,
    svcReportRes,
    outstandingRes,
    rowsRes,
  ] = await Promise.all([
    count(),
    count((q) => q.eq("expiry_bucket", "expired")),
    count((q) => q.eq("expiry_bucket", "7d")),
    count((q) => q.eq("expiry_bucket", "15d")),
    count((q) => q.eq("expiry_bucket", "30d")),
    count((q) => q.eq("expiry_bucket", "60d")),
    count((q) => q.eq("computed_status", "Missing")),
    count((q) => q.eq("has_quotation", false).gt("quotation_amount", 0)),
    count((q) => q.eq("has_invoice", false).gt("outstanding_amount", 0)),
    count((q) => q.eq("has_payment_proof", false).gt("paid_amount", 0)),
    count((q) => q.eq("has_service_report", false).not("next_service_date", "is", null)),
    count((q) => q.gt("outstanding_amount", 0)),
    applyFilters(
      context.supabase.from("location_compliance_items_enriched").select("location_code, computed_status, is_required, risk_level"),
      filters,
    ).limit(500),
  ]);

  for (const res of [totalRes, expiredRes, d7Res, d15Res, d30Res, d60Res, missingRes, missingQuoteRes, missingInvRes, missingPayRes, svcReportRes, outstandingRes, rowsRes]) {
    if (res.error) throw res.error;
  }

  const rows = rowsRes.data ?? [];
  const highRiskLocations = new Set(
    rows
      .filter((r: { risk_level?: string; location_code?: string }) => r.risk_level === "Critical" || r.risk_level === "High")
      .map((r: { location_code?: string }) => r.location_code),
  ).size;

  return {
    total: totalRes.count ?? 0,
    expired: expiredRes.count ?? 0,
    due_7: d7Res.count ?? 0,
    due_15: d15Res.count ?? 0,
    due_30: d30Res.count ?? 0,
    due_60: d60Res.count ?? 0,
    missing_docs: missingRes.count ?? 0,
    missing_quotation: missingQuoteRes.count ?? 0,
    missing_invoice: missingInvRes.count ?? 0,
    missing_payment_proof: missingPayRes.count ?? 0,
    pending_service_reports: svcReportRes.count ?? 0,
    outstanding_payments: outstandingRes.count ?? 0,
    high_risk_locations: highRiskLocations,
    compliance_score: complianceScore(rows as { computed_status: string; is_required: boolean }[]),
  };
}

export async function fetchLocationTrackerItems(context: AuthContext, filters: LocationTrackerFilters = {}) {
  const { data, error } = await applyFilters(
    context.supabase.from("location_compliance_items_enriched").select(LIST_SELECT).order("days_remaining", { ascending: true, nullsFirst: false }),
    filters,
  ).limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function fetchLocationTrackerAlerts(context: AuthContext, filters: LocationTrackerFilters = {}) {
  const kpis = await fetchLocationTrackerKpis(context, filters);
  const { data, error } = await applyFilters(
    context.supabase
      .from("location_compliance_items_enriched")
      .select(LIST_SELECT)
      .in("computed_status", ["Expired", "Due Soon", "Missing", "Pending Payment", "Service Overdue", "Pending Renewal"])
      .order("days_remaining", { ascending: true, nullsFirst: false }),
    filters,
  ).limit(100);
  if (error) throw error;
  return { kpis, items: data ?? [] };
}
