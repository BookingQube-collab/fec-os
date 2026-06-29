export const LOCATION_COMPLIANCE_CATEGORIES = [
  "QCDD",
  "Civil Defence",
  "Building Completion",
  "Trade License",
  "CR",
  "CCTV",
  "Fire Alarm",
  "Fire Fighting",
  "Kitchen Duct",
  "Pest Control",
  "HVAC",
  "F&B CR",
  "F&B License",
  "Staff Medical",
  "Qatar Tourism",
  "Insurance",
  "Mall NOC",
  "Cleaning/Security/IT contracts",
  "Equipment AMC",
  "Other",
] as const;

export type LocationComplianceStatus =
  | "Expired"
  | "Due Soon"
  | "Valid"
  | "Missing"
  | "Pending Renewal"
  | "Pending Payment"
  | "Service Overdue"
  | "No Date";

export type ExpiryBucket = "expired" | "7d" | "15d" | "30d" | "60d" | "ok" | "none";

export const LOCATION_TYPE_BY_CODE: Record<string, string> = {
  "INF-CC": "inflatapark",
  "KDS-CC": "kids_driving_school",
  "KDS-DM": "kids_driving_school",
  "UA-DM": "urban_arena",
  "CB-VM": "crayons_bricks",
  "CB-DSM": "crayons_bricks",
  "CAR-AP": "carousel",
};

export function statusTone(status: string): string {
  if (status === "Expired" || status === "Missing" || status === "Service Overdue") return "rag-red";
  if (status === "Due Soon" || status === "Pending Renewal" || status === "Pending Payment") return "rag-amber";
  if (status === "Valid") return "rag-green";
  return "text-muted-foreground";
}

export function riskTone(risk: string | null): string {
  if (risk === "Critical") return "rag-red";
  if (risk === "High") return "rag-amber";
  if (risk === "Medium") return "text-blue-400";
  return "text-muted-foreground";
}

export function attachmentSummary(row: {
  has_certificate?: boolean;
  has_quotation?: boolean;
  has_invoice?: boolean;
  has_payment_proof?: boolean;
  has_service_report?: boolean;
  attachment_status?: string | null;
}): string {
  const parts: string[] = [];
  if (row.has_certificate) parts.push("Cert");
  if (row.has_quotation) parts.push("Quote");
  if (row.has_invoice) parts.push("Inv");
  if (row.has_payment_proof) parts.push("Pay");
  if (row.has_service_report) parts.push("SVC");
  if (parts.length) return parts.join(" · ");
  return row.attachment_status === "none" ? "None" : row.attachment_status ?? "—";
}

export function complianceScore(items: { computed_status: string; is_required: boolean }[]): number {
  if (!items.length) return 100;
  const required = items.filter((i) => i.is_required);
  const pool = required.length ? required : items;
  const bad = pool.filter((i) =>
    ["Expired", "Missing", "Service Overdue", "Pending Payment"].includes(i.computed_status),
  ).length;
  const watch = pool.filter((i) => ["Due Soon", "Pending Renewal"].includes(i.computed_status)).length;
  const score = Math.round(((pool.length - bad - watch * 0.5) / pool.length) * 100);
  return Math.max(0, Math.min(100, score));
}
