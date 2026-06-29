/** Canonical compliance document types (FEC Qatar operations). */
export const COMPLIANCE_DOCUMENT_TYPES = [
  "qcdd",
  "civil_defence",
  "building_completion",
  "trade_licence",
  "cr",
  "cctv_approval",
  "fire_alarm",
  "fire_fighting",
  "kitchen_duct_cleaning",
  "pest_control",
  "qatar_tourism_licence",
  "staff_medical",
  "insurance",
  "mall_noc",
  "other_third_party",
] as const;

export type ComplianceDocumentType = (typeof COMPLIANCE_DOCUMENT_TYPES)[number];

export const COMPLIANCE_DOCUMENT_TYPE_LABELS: Record<ComplianceDocumentType, string> = {
  qcdd: "QCDD",
  civil_defence: "Civil Defence",
  building_completion: "Building Completion",
  trade_licence: "Trade Licence",
  cr: "CR (Commercial Registration)",
  cctv_approval: "CCTV Approval",
  fire_alarm: "Fire Alarm",
  fire_fighting: "Fire Fighting",
  kitchen_duct_cleaning: "Kitchen Duct Cleaning",
  pest_control: "Pest Control",
  qatar_tourism_licence: "Qatar Tourism Licence",
  staff_medical: "Staff Medical",
  insurance: "Insurance",
  mall_noc: "Mall NOC",
  other_third_party: "Other Third-Party Compliance",
};

export const DOCUMENT_ATTACHMENT_TYPES = [
  "certificate",
  "quotation",
  "invoice",
  "payment_proof",
  "service_report",
  "photo",
  "approval_letter",
] as const;

export type DocumentAttachmentType = (typeof DOCUMENT_ATTACHMENT_TYPES)[number];

export const DOCUMENT_ATTACHMENT_LABELS: Record<DocumentAttachmentType, string> = {
  certificate: "Certificate",
  quotation: "Quotation",
  invoice: "Invoice",
  payment_proof: "Payment Proof",
  service_report: "Service Report",
  photo: "Photo",
  approval_letter: "Approval Letter",
};

export const DOCUMENT_PAYMENT_STATUSES = ["unpaid", "partially_paid", "paid"] as const;

export const DOCUMENT_RENEWAL_STATUSES = [
  "active",
  "pending_renewal",
  "under_renewal",
  "renewed",
  "expired",
  "not_applicable",
] as const;

export const EXPIRY_NOTIFICATION_TYPES = [
  "expiry_90_days",
  "expiry_60_days",
  "expiry_30_days",
  "expiry_15_days",
  "expiry_7_days",
  "expired",
  "expired_daily",
] as const;

/** Key site document types for dashboard status matrix. */
export const KEY_SITE_DOCUMENT_TYPES: ComplianceDocumentType[] = [
  "qcdd",
  "trade_licence",
  "cr",
  "civil_defence",
  "building_completion",
];

export function expiryTierColor(tier: string): string {
  if (tier === "Expired") return "text-rose-400 border-rose-500/40 bg-rose-500/15";
  if (tier === "Due ≤7") return "text-orange-400 border-orange-500/40 bg-orange-500/15";
  if (tier === "Due ≤15" || tier === "Due ≤30") return "text-amber-400 border-amber-500/40 bg-amber-500/15";
  if (tier === "Due ≤60") return "text-sky-400 border-sky-500/40 bg-sky-500/15";
  if (tier === "Valid") return "text-emerald-400 border-emerald-500/40 bg-emerald-500/15";
  return "text-muted-foreground border-border bg-muted/30";
}

export function paymentStatusBadge(status: string): string {
  if (status === "paid") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (status === "partially_paid") return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return "bg-rose-500/15 text-rose-300 border-rose-500/40";
}

export function calcOutstanding(quotation: number, paid: number): number {
  return Math.max(quotation - paid, 0);
}

export function derivePaymentStatus(quotation: number, paid: number): string {
  if (paid <= 0 || quotation <= 0) return paid > 0 && quotation > 0 ? "partially_paid" : "unpaid";
  if (paid >= quotation) return "paid";
  return "partially_paid";
}
