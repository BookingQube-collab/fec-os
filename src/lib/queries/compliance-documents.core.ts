import type { AuthContext } from "@/lib/server/auth";

const LIST_COLUMNS =
  "id, location_id, document_type, document_name, certificate_number, reference_number, issuing_authority, issue_date, expiry_date, renewal_due_date, status, renewal_status, priority, responsible_person, vendor_id, contract_id, quotation_amount, paid_amount, outstanding_amount, payment_status, file_path, file_name, created_at, updated_at";

export interface ComplianceDocumentListRow {
  id: string;
  location_id: string;
  document_type: string;
  document_name: string | null;
  certificate_number: string | null;
  reference_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  renewal_due_date: string | null;
  status: string;
  renewal_status: string;
  priority: string | null;
  responsible_person: string | null;
  vendor_id: string | null;
  contract_id: string | null;
  quotation_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
  location_code?: string;
  expiry_tier?: string;
  days_to_expiry?: number | null;
}

export interface ComplianceDocumentFilters {
  locationId?: string | null;
  status?: string | null;
  documentType?: string | null;
  renewalStatus?: string | null;
  paymentStatus?: string | null;
  contractId?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export async function fetchComplianceDocuments(
  context: AuthContext,
  filters: ComplianceDocumentFilters = {},
): Promise<{ items: ComplianceDocumentListRow[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = context.supabase
    .from("compliance_documents")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (filters.locationId) q = q.eq("location_id", filters.locationId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.documentType) q = q.eq("document_type", filters.documentType);
  if (filters.renewalStatus) q = q.eq("renewal_status", filters.renewalStatus);
  if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
  if (filters.contractId) q = q.eq("contract_id", filters.contractId);
  if (filters.search) {
    const s = `%${filters.search}%`;
    q = q.or(`document_name.ilike.${s},certificate_number.ilike.${s},reference_number.ilike.${s},document_type.ilike.${s}`);
  }

  const { data: rows, error, count } = await q;
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l.code]));

  const today = new Date().toISOString().slice(0, 10);

  return {
    items: (rows ?? []).map((r) => {
      const daysToExpiry = r.expiry_date
        ? Math.ceil((new Date(r.expiry_date).getTime() - new Date(today).getTime()) / 86_400_000)
        : null;
      let expiryTier = "No Date";
      if (r.expiry_date) {
        if (daysToExpiry! < 0) expiryTier = "Expired";
        else if (daysToExpiry! <= 7) expiryTier = "Due ≤7";
        else if (daysToExpiry! <= 15) expiryTier = "Due ≤15";
        else if (daysToExpiry! <= 30) expiryTier = "Due ≤30";
        else if (daysToExpiry! <= 60) expiryTier = "Due ≤60";
        else expiryTier = "Valid";
      }
      return {
        ...r,
        quotation_amount: Number(r.quotation_amount ?? 0),
        paid_amount: Number(r.paid_amount ?? 0),
        outstanding_amount: Number(r.outstanding_amount ?? 0),
        location_code: locMap.get(r.location_id),
        days_to_expiry: daysToExpiry,
        expiry_tier: expiryTier,
      };
    }),
    total: count ?? 0,
  };
}

export async function fetchComplianceDocumentsByContract(
  context: AuthContext,
  contractId: string,
): Promise<ComplianceDocumentListRow[]> {
  const { data, error } = await context.supabase
    .from("compliance_documents")
    .select(LIST_COLUMNS)
    .eq("contract_id", contractId)
    .order("expiry_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    quotation_amount: Number(r.quotation_amount ?? 0),
    paid_amount: Number(r.paid_amount ?? 0),
    outstanding_amount: Number(r.outstanding_amount ?? 0),
  }));
}
