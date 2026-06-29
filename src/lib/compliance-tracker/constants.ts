export const E3_LOCATIONS = [
  "InflataPark City Center",
  "KDS City Center",
  "Urban Arena Doha Mall",
  "Crayons & Bricks Vendome",
  "Crayons & Bricks Dar Al Salam",
  "Carousel Aspire Park",
] as const;

export type E3Location = (typeof E3_LOCATIONS)[number];

export const E3_AREAS = ["Whole Area", "Cafe", "Play Ground", "Center"] as const;

export type E3Area = (typeof E3_AREAS)[number];

export const E3_CATEGORIES = [
  "QCDD",
  "E3 Compliance",
  "Fire Alarm",
  "Pest Control",
  "AC Cleaning",
  "CCTV",
  "POS",
  "Kitchen Hood",
  "Waste Management",
  "Kitchen Maintenance",
  "Third Party Certification",
] as const;

export type E3Category = (typeof E3_CATEGORIES)[number];

export const E3_AMC_CATEGORIES: E3Category[] = [
  "Fire Alarm",
  "Pest Control",
  "AC Cleaning",
  "CCTV",
  "Kitchen Hood",
  "Waste Management",
  "POS",
  "Kitchen Maintenance",
  "Third Party Certification",
];

/** Top-level tracker filter: licenses/compliance vs contractor AMCs. */
export const E3_FIELDS = ["E3 Compliances", "Contractors"] as const;

export type E3Field = (typeof E3_FIELDS)[number];

export const E3_COMPLIANCE_FIELD_CATEGORIES: E3Category[] = ["QCDD", "E3 Compliance"];

export const E3_CONTRACTOR_FIELD_CATEGORIES: E3Category[] = [...E3_AMC_CATEGORIES];

export function categoriesForE3Field(field: string | null | undefined): E3Category[] | null {
  if (!field || field === "All") return null;
  if (field === "E3 Compliances") return E3_COMPLIANCE_FIELD_CATEGORIES;
  if (field === "Contractors") return E3_CONTRACTOR_FIELD_CATEGORIES;
  return null;
}

export const E3_OWNERS = [
  "HR & Admin",
  "Facilities & Maintenance",
  "Operations Manager",
] as const;

export const E3_FREQUENCIES = ["Monthly", "Quarterly", "Annual", "TBD"] as const;

export const E3_KITCHEN_CATEGORIES: E3Category[] = [
  "Kitchen Hood",
  "Kitchen Maintenance",
  "Waste Management",
];

export const E3_STATUS_COLORS = {
  Compliant: { bg: "#1E7B45", text: "#FFFFFF" },
  Upcoming: { bg: "#E8A33D", text: "#0A1228" },
  Warning: { bg: "#E8A33D", text: "#0A1228" },
  Critical: { bg: "#C0392B", text: "#FFFFFF" },
  Overdue: { bg: "#C0392B", text: "#FFFFFF" },
  Missing: { bg: "#C0392B", text: "#FFFFFF" },
} as const;

export const E3_VENDOR_STATUS_COLORS = {
  Healthy: { bg: "#1E7B45", text: "#FFFFFF" },
  Monitor: { bg: "#E8A33D", text: "#0A1228" },
  "At Risk": { bg: "#E8A33D", text: "#0A1228" },
  "Action Needed": { bg: "#C0392B", text: "#FFFFFF" },
  "No Data": { bg: "#94A3B8", text: "#FFFFFF" },
} as const;

export const E3_NAV_ITEMS = [
  { href: "/compliance/e3-tracker", label: "Dashboard" },
  { href: "/compliance/e3-tracker/master-register", label: "Master Register" },
  { href: "/compliance/e3-tracker/amc-dashboard", label: "AMC Contracts" },
  { href: "/compliance/e3-tracker/amc-tracker", label: "AMC Tracker" },
  { href: "/compliance/e3-tracker/vendor-register", label: "Vendor Register" },
  { href: "/compliance/e3-tracker/monthly-scheduler", label: "Monthly Scheduler" },
  { href: "/compliance/e3-tracker/missing-documents", label: "Missing Documents" },
  { href: "/compliance/e3-tracker/license-documents", label: "License Documents" },
  { href: "/compliance/e3-tracker/qcdd", label: "QCDD" },
  { href: "/compliance/e3-tracker/fire-alarm", label: "Fire Alarm" },
  { href: "/compliance/e3-tracker/pest-control", label: "Pest Control" },
  { href: "/compliance/e3-tracker/cctv", label: "CCTV" },
  { href: "/compliance/e3-tracker/kitchen-compliance", label: "Kitchen Compliance" },
  { href: "/compliance/e3-tracker/third-party-certification", label: "Third Party Certification" },
] as const;

export const E3_TABLE = "e3_compliance_items" as const;
export const E3_TABLE_ENRICHED = "e3_compliance_items_enriched" as const;

export type E3ComplianceItemRow = {
  id: string;
  location: string;
  area: string;
  category: string;
  item: string;
  vendor: string;
  contract_start: string | null;
  contract_end: string | null;
  last_service: string | null;
  next_service: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  frequency: string;
  owner: string;
  remarks: string | null;
  drive_link: string | null;
  days_to_expiry?: number | null;
  computed_status?: string | null;
};

export type ComplianceStatus =
  | "Compliant"
  | "Upcoming"
  | "Warning"
  | "Critical"
  | "Overdue"
  | "Missing";

export type VendorOverallStatus = "Healthy" | "Monitor" | "At Risk" | "Action Needed" | "No Data";
