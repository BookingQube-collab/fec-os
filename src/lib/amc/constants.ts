export const AMC_CATEGORIES = [
  "fire_alarm_amc",
  "fire_fighting_amc",
  "cctv_amc",
  "hvac_amc",
  "kitchen_duct_cleaning",
  "pest_control",
  "qcdd_certificate",
  "trade_license",
  "commercial_registration",
  "qatar_tourism_license",
  "staff_medical_certificates",
  "insurance",
  "equipment_maintenance",
  "generator_ups",
  "pos_it_support",
  "network_internet",
  "cleaning_contract",
  "security_contract",
  "mall_approval_noc",
  "other",
] as const;

export type AmcCategory = (typeof AMC_CATEGORIES)[number];

export const AMC_CATEGORY_LABELS: Record<AmcCategory, string> = {
  fire_alarm_amc: "Fire Alarm AMC",
  fire_fighting_amc: "Fire Fighting AMC",
  cctv_amc: "CCTV AMC",
  hvac_amc: "HVAC AMC",
  kitchen_duct_cleaning: "Kitchen Duct Cleaning",
  pest_control: "Pest Control",
  qcdd_certificate: "QCDD Certificate",
  trade_license: "Trade License",
  commercial_registration: "Commercial Registration",
  qatar_tourism_license: "Qatar Tourism License",
  staff_medical_certificates: "Staff Medical Certificates",
  insurance: "Insurance",
  equipment_maintenance: "Equipment Maintenance",
  generator_ups: "Generator / UPS",
  pos_it_support: "POS / IT System Support",
  network_internet: "Network / Internet Contract",
  cleaning_contract: "Cleaning Contract",
  security_contract: "Security Contract",
  mall_approval_noc: "Mall Approval / NOC Follow-up",
  other: "Other",
};

export const AMC_FREQUENCIES = ["monthly", "quarterly", "bi_yearly", "yearly", "custom", "one_off"] as const;
export type AmcFrequency = (typeof AMC_FREQUENCIES)[number];

export const AMC_CONTRACT_STATUSES = ["active", "expired", "pending", "draft", "cancelled"] as const;
export const AMC_PAYMENT_STATUSES = ["paid", "partially_paid", "unpaid"] as const;
export const AMC_SERVICE_STATUSES = ["pending", "done", "overdue", "rescheduled", "cancelled"] as const;

/** Six FEC branch sites (E3 compliance / AMC scope). */
export const FEC_BRANCH_CODES = ["KDS-CC", "KDS-DM", "INF-CC", "UA-DM", "CB-VM", "CB-DSM", "CAR-AP"] as const;

export const AMC_ATTACHMENT_TYPES = [
  "contract",
  "quotation",
  "invoice",
  "service_report",
  "photo_before",
  "photo_after",
  "other",
] as const;

export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Generate planned service dates between contract start and end. */
export function generatePlannedServiceDates(
  startIso: string,
  endIso: string,
  frequency: AmcFrequency,
): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (end < start) return [];

  const dates: string[] = [];
  if (frequency === "one_off" || frequency === "custom") {
    dates.push(startIso.slice(0, 10));
    return dates;
  }

  const stepMonths =
    frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "bi_yearly" ? 6 : 12;

  let cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = addMonths(cursor, stepMonths);
  }
  return dates;
}

export function ragForService(plannedDate: string, status: string): "green" | "yellow" | "orange" | "red" | "grey" {
  if (status === "cancelled") return "grey";
  if (status === "done") return "green";
  const today = new Date().toISOString().slice(0, 10);
  const days = daysBetween(new Date(today), new Date(plannedDate));
  if (plannedDate < today) return "red";
  if (days <= 7) return "orange";
  if (days <= 30) return "yellow";
  return "green";
}

export function ragForContract(endDate: string, status: string): "green" | "yellow" | "orange" | "red" | "grey" {
  if (status === "cancelled" || status === "draft") return "grey";
  const today = new Date().toISOString().slice(0, 10);
  if (endDate < today || status === "expired") return "red";
  const days = daysBetween(new Date(today), new Date(endDate));
  if (days <= 30) return "orange";
  if (days <= 60) return "yellow";
  return "green";
}
