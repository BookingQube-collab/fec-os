import type { AuthContext } from "@/lib/server/auth";
import { KEY_SITE_DOCUMENT_TYPES } from "@/lib/compliance/constants";

export interface ExpiryAlertRow {
  id: string;
  location_id: string;
  location_code: string | null;
  document_type: string;
  document_name: string | null;
  certificate_number: string | null;
  expiry_date: string;
  days_to_expiry: number;
  expiry_tier: string;
  renewal_status: string;
  payment_status: string;
  outstanding_amount: number;
  vendor_id: string | null;
  contract_id: string | null;
}

export interface ExpiryAlertsPayload {
  kpis: {
    expired: number;
    due_7: number;
    due_15: number;
    due_30: number;
    due_60: number;
    total_quotation: number;
    total_paid: number;
    total_outstanding: number;
    pending_renewals: number;
  };
  sections: {
    expired: ExpiryAlertRow[];
    due_7: ExpiryAlertRow[];
    due_15: ExpiryAlertRow[];
    due_30: ExpiryAlertRow[];
    due_60: ExpiryAlertRow[];
  };
  site_status: {
    location_id: string;
    location_code: string;
    location_name: string;
    documents: { document_type: string; expiry_tier: string; expiry_date: string | null }[];
  }[];
}

const ALERT_SELECT =
  "id, location_id, document_type, document_name, certificate_number, expiry_date, renewal_status, payment_status, outstanding_amount, vendor_id, contract_id";

function tierForDays(days: number): string {
  if (days < 0) return "Expired";
  if (days <= 7) return "Due ≤7";
  if (days <= 15) return "Due ≤15";
  if (days <= 30) return "Due ≤30";
  if (days <= 60) return "Due ≤60";
  return "OK";
}

export async function fetchExpiryAlerts(
  context: AuthContext,
  filters: { locationId?: string | null; limit?: number } = {},
): Promise<ExpiryAlertsPayload> {
  const limit = Math.min(filters.limit ?? 100, 300);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 60);
  const horizonIso = horizon.toISOString().slice(0, 10);

  let q = context.supabase
    .from("compliance_documents")
    .select(ALERT_SELECT)
    .not("expiry_date", "is", null)
    .not("renewal_status", "in", "(renewed,not_applicable)")
    .lte("expiry_date", horizonIso)
    .order("expiry_date")
    .limit(limit);

  if (filters.locationId) q = q.eq("location_id", filters.locationId);

  const { data: rows, error } = await q;
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

  const enriched: ExpiryAlertRow[] = (rows ?? []).map((r) => {
    const days = Math.ceil((new Date(r.expiry_date).getTime() - new Date(today).getTime()) / 86_400_000);
    return {
      ...r,
      location_code: locMap.get(r.location_id)?.code ?? null,
      days_to_expiry: days,
      expiry_tier: tierForDays(days),
      outstanding_amount: Number(r.outstanding_amount ?? 0),
    };
  });

  const expired = enriched.filter((r) => r.days_to_expiry < 0);
  const due7 = enriched.filter((r) => r.days_to_expiry >= 0 && r.days_to_expiry <= 7);
  const due15 = enriched.filter((r) => r.days_to_expiry > 7 && r.days_to_expiry <= 15);
  const due30 = enriched.filter((r) => r.days_to_expiry > 15 && r.days_to_expiry <= 30);
  const due60 = enriched.filter((r) => r.days_to_expiry > 30 && r.days_to_expiry <= 60);

  let siteQ = context.supabase
    .from("compliance_documents")
    .select("location_id, document_type, expiry_date")
    .in("document_type", KEY_SITE_DOCUMENT_TYPES);
  if (filters.locationId) siteQ = siteQ.eq("location_id", filters.locationId);
  const { data: siteDocs } = await siteQ;

  const { data: activeLocs } = await context.supabase
    .from("locations")
    .select("id, code, name")
    .eq("status", "active")
    .order("code");

  const siteStatus = (activeLocs ?? [])
    .filter((l) => !filters.locationId || l.id === filters.locationId)
    .map((loc) => {
      const docs = KEY_SITE_DOCUMENT_TYPES.map((dt) => {
        const match = (siteDocs ?? [])
          .filter((d) => d.location_id === loc.id && d.document_type === dt)
          .sort((a, b) => String(b.expiry_date).localeCompare(String(a.expiry_date)))[0];
        const days = match?.expiry_date
          ? Math.ceil((new Date(match.expiry_date).getTime() - new Date(today).getTime()) / 86_400_000)
          : null;
        return {
          document_type: dt,
          expiry_date: match?.expiry_date ?? null,
          expiry_tier: days == null ? "No Date" : tierForDays(days),
        };
      });
      return { location_id: loc.id, location_code: loc.code, location_name: loc.name, documents: docs };
    });

  let allDocsQ = context.supabase
    .from("compliance_documents")
    .select("quotation_amount, paid_amount, outstanding_amount, renewal_status");
  if (filters.locationId) allDocsQ = allDocsQ.eq("location_id", filters.locationId);
  const { data: paymentRows } = await allDocsQ;

  const totals = (paymentRows ?? []).reduce(
    (acc, r) => {
      acc.quotation += Number(r.quotation_amount ?? 0);
      acc.paid += Number(r.paid_amount ?? 0);
      acc.outstanding += Number(r.outstanding_amount ?? 0);
      if (["pending_renewal", "under_renewal"].includes(r.renewal_status)) acc.pendingRenewals += 1;
      return acc;
    },
    { quotation: 0, paid: 0, outstanding: 0, pendingRenewals: 0 },
  );

  return {
    kpis: {
      expired: expired.length,
      due_7: due7.length,
      due_15: due15.length,
      due_30: due30.length,
      due_60: due60.length,
      total_quotation: totals.quotation,
      total_paid: totals.paid,
      total_outstanding: totals.outstanding,
      pending_renewals: totals.pendingRenewals,
    },
    sections: { expired, due_7: due7, due_15: due15, due_30: due30, due_60: due60 },
    site_status: siteStatus,
  };
}

/** Lightweight KPI counts for dashboards — head-only queries. */
export async function fetchDocumentExpiryKpis(
  context: AuthContext,
  locationId?: string | null,
): Promise<{ expired: number; due_7: number; due_30: number; due_60: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const d7 = new Date();
  d7.setDate(d7.getDate() + 7);
  const d30 = new Date();
  d30.setDate(d30.getDate() + 30);
  const d60 = new Date();
  d60.setDate(d60.getDate() + 60);

  const base = () => {
    let q = context.supabase.from("compliance_documents").select("id", { count: "exact", head: true });
    if (locationId) q = q.eq("location_id", locationId);
    return q.not("renewal_status", "in", "(renewed,not_applicable)");
  };

  const [expiredRes, due7Res, due30Res, due60Res] = await Promise.all([
    base().lt("expiry_date", today),
    base().gte("expiry_date", today).lte("expiry_date", d7.toISOString().slice(0, 10)),
    base().gte("expiry_date", today).lte("expiry_date", d30.toISOString().slice(0, 10)),
    base().gte("expiry_date", today).lte("expiry_date", d60.toISOString().slice(0, 10)),
  ]);

  if (expiredRes.error) throw expiredRes.error;
  if (due7Res.error) throw due7Res.error;
  if (due30Res.error) throw due30Res.error;
  if (due60Res.error) throw due60Res.error;

  return {
    expired: expiredRes.count ?? 0,
    due_7: due7Res.count ?? 0,
    due_30: due30Res.count ?? 0,
    due_60: due60Res.count ?? 0,
  };
}
