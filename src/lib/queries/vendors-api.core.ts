import type { AuthContext } from "@/lib/server/auth";

const SPEND_STATUSES = new Set(["approved", "po_created"]);
const CLOSED_PR_STATUSES = new Set(["rejected", "cancelled"]);

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
  payment_terms: string | null;
  status: string | null;
  active: boolean;
  created_at: string | null;
  entity_type: string;
  engagement_type: string | null;
  compliance_deadline: string | null;
  compliance_status: string;
  document_count: number;
  doc_types: string[];
  compliance_score: number;
  onboarding_stage: "approved" | "invited" | "in_progress";
  location_names: string[];
  active_pr_count: number;
  total_spend: number;
  contract_count: number;
  nearest_contract_end: string | null;
  near_expiry: boolean;
}

export interface VendorFilters {
  locationId?: string | null;
  category?: string | null;
  search?: string | null;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

type VendorQueryRow = Omit<
  VendorListRow,
  | "location_names"
  | "active_pr_count"
  | "total_spend"
  | "contract_count"
  | "nearest_contract_end"
  | "near_expiry"
  | "document_count"
  | "doc_types"
  | "compliance_score"
  | "onboarding_stage"
> & {
  branch_coverage?: string[];
  notes?: string | null;
};

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
      "id, name, category, service_category, contact_person, phone, email, trade_license_no, cr_no, address, amc_status, payment_terms, status, active, created_at, branch_coverage, entity_type, engagement_type, compliance_deadline, compliance_status, notes",
      { count: "exact" },
    )
    .order("name")
    .range(from, to);

  if (!filters.includeInactive) q = q.eq("active", true);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.search) {
    const s = `%${filters.search}%`;
    q = q.or(`name.ilike.${s},contact_person.ilike.${s},trade_license_no.ilike.${s},cr_no.ilike.${s}`);
  }

  const { data: rows, error, count } = await q;
  if (error) throw error;

  let raw = (rows ?? []) as VendorQueryRow[];
  if (filters.locationId) {
    raw = raw.filter(
      (v) => !v.branch_coverage?.length || v.branch_coverage.includes(filters.locationId!),
    );
  }

  const extras = await loadVendorExtras(
    context,
    raw.map((v) => ({ id: v.id, locationIds: v.branch_coverage ?? [] })),
  );
  const docMeta = await loadVendorDocumentMeta(context, raw.map((v) => v.id));

  return {
    items: raw.map((v) => {
      const extra = extras.get(v.id);
      const docs = docMeta.get(v.id) ?? { count: 0, types: [] as string[] };
      const entityType = (v.entity_type as string | null) ?? "company";
      const complianceStatus = (v.compliance_status as string | null) ?? "unassessed";
      const score = computeComplianceScore(entityType, docs.types, complianceStatus);
      const { branch_coverage: _bc, notes: _notes, ...rest } = v;
      return {
        ...rest,
        payment_terms: rest.payment_terms ?? null,
        created_at: rest.created_at ?? null,
        entity_type: entityType,
        engagement_type: (v.engagement_type as string | null) ?? null,
        compliance_deadline: (v.compliance_deadline as string | null) ?? null,
        compliance_status: complianceStatus,
        document_count: docs.count,
        doc_types: docs.types,
        compliance_score: score,
        onboarding_stage: inferOnboardingStage(complianceStatus, docs.count, Boolean(v.compliance_deadline)),
        location_names: extra?.location_names ?? [],
        active_pr_count: extra?.active_pr_count ?? 0,
        total_spend: extra?.total_spend ?? 0,
        contract_count: extra?.contract_count ?? 0,
        nearest_contract_end: extra?.nearest_contract_end ?? null,
        near_expiry: extra?.near_expiry ?? false,
      };
    }),
    total: count ?? raw.length,
  };
}

function normalizeDocType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function requiredDocTypes(entityType: string): string[] {
  return entityType === "freelancer"
    ? ["qid", "qatar_id", "passport", "qid_passport"]
    : ["commercial_registration", "cr", "commercial_reg"];
}

function hasDocType(types: string[], keys: string[]): boolean {
  const normalized = types.map(normalizeDocType);
  return keys.some((key) => normalized.some((t) => t.includes(key)));
}

function computeComplianceScore(entityType: string, docTypes: string[], complianceStatus: string): number {
  if (complianceStatus === "compliant") return 100;
  const required =
    entityType === "freelancer"
      ? [["qid", "qatar_id", "passport", "qid_passport"]]
      : [
          ["commercial_registration", "cr", "commercial_reg"],
          ["tax", "tax_certificate", "tin"],
          ["establishment", "computer_card"],
        ];
  let matched = 0;
  for (const group of required) {
    if (hasDocType(docTypes, group)) matched += 1;
  }
  if (!required.length) return complianceStatus === "blocked" ? 0 : 50;
  return Math.round((matched / required.length) * 100);
}

function inferOnboardingStage(
  complianceStatus: string,
  documentCount: number,
  hasDeadline: boolean,
): VendorListRow["onboarding_stage"] {
  if (complianceStatus === "compliant") return "approved";
  if (hasDeadline && complianceStatus !== "blocked" && documentCount === 0) return "invited";
  if (hasDeadline && documentCount > 0 && complianceStatus !== "compliant") return "in_progress";
  if (complianceStatus === "unassessed" || complianceStatus === "grace" || complianceStatus === "warning") {
    return documentCount > 0 ? "in_progress" : "invited";
  }
  return "approved";
}

async function loadVendorDocumentMeta(context: AuthContext, vendorIds: string[]) {
  const map = new Map<string, { count: number; types: string[] }>();
  if (!vendorIds.length) return map;
  const { data, error } = await context.supabase
    .from("vendor_documents")
    .select("vendor_id, doc_type")
    .in("vendor_id", vendorIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const id = row.vendor_id as string;
    const prev = map.get(id) ?? { count: 0, types: [] as string[] };
    prev.count += 1;
    if (row.doc_type) prev.types.push(String(row.doc_type));
    map.set(id, prev);
  }
  return map;
}

type VendorExtras = Pick<
  VendorListRow,
  | "location_names"
  | "active_pr_count"
  | "total_spend"
  | "contract_count"
  | "nearest_contract_end"
  | "near_expiry"
>;

async function loadVendorExtras(
  context: AuthContext,
  vendors: Array<{ id: string; locationIds: string[] }>,
): Promise<Map<string, VendorExtras>> {
  const extras = new Map<string, VendorExtras>();
  const vendorIds = vendors.map((v) => v.id);
  for (const vendor of vendors) {
    extras.set(vendor.id, {
      location_names: [],
      active_pr_count: 0,
      total_spend: 0,
      contract_count: 0,
      nearest_contract_end: null,
      near_expiry: false,
    });
  }
  if (!vendorIds.length) return extras;

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const uniqueLocIds = [...new Set(vendors.flatMap((v) => v.locationIds).filter(Boolean))];

  const [contractsRes, linesRes, locationsRes] = await Promise.all([
    context.supabase
      .from("vendor_contracts")
      .select("vendor_id, end_date, value_amount, status")
      .in("vendor_id", vendorIds),
    context.supabase
      .from("pr_lines")
      .select("preferred_vendor_id, line_total, pr_id")
      .in("preferred_vendor_id", vendorIds),
    uniqueLocIds.length
      ? context.supabase.from("locations").select("id, name").in("id", uniqueLocIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
  ]);

  const locName = new Map((locationsRes.data ?? []).map((l) => [l.id, l.name]));
  for (const vendor of vendors) {
    extras.get(vendor.id)!.location_names = vendor.locationIds
      .map((id) => locName.get(id))
      .filter((name): name is string => Boolean(name));
  }

  if (!contractsRes.error) {
    for (const row of contractsRes.data ?? []) {
      const extra = extras.get(row.vendor_id as string);
      if (!extra) continue;
      extra.contract_count += 1;
      const end = (row.end_date as string | null) ?? null;
      if (end && (!extra.nearest_contract_end || end < extra.nearest_contract_end)) {
        extra.nearest_contract_end = end;
      }
      if (
        (row.status as string | null) === "active" &&
        end != null &&
        end >= today &&
        end <= soon
      ) {
        extra.near_expiry = true;
      }
    }
  }

  const lines = !linesRes.error ? (linesRes.data ?? []) : [];
  const prIds = [...new Set(lines.map((l) => l.pr_id as string).filter(Boolean))];
  const prStatus = new Map<string, string>();
  if (prIds.length) {
    const { data: prs, error: prError } = await context.supabase
      .from("purchase_requisitions")
      .select("id, status")
      .in("id", prIds);
    if (!prError) {
      for (const pr of prs ?? []) prStatus.set(pr.id, pr.status);
    }
  }

  const activePrs = new Map<string, Set<string>>();
  for (const line of lines) {
    const vendorId = line.preferred_vendor_id as string | null;
    const prId = line.pr_id as string | null;
    if (!vendorId || !prId) continue;
    const extra = extras.get(vendorId);
    if (!extra) continue;
    const status = prStatus.get(prId);
    if (!status || CLOSED_PR_STATUSES.has(status)) continue;
    const set = activePrs.get(vendorId) ?? new Set<string>();
    set.add(prId);
    activePrs.set(vendorId, set);
    if (SPEND_STATUSES.has(status)) {
      extra.total_spend += Number(line.line_total ?? 0);
    }
  }
  for (const [vendorId, set] of activePrs) {
    const extra = extras.get(vendorId);
    if (extra) extra.active_pr_count = set.size;
  }

  return extras;
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
