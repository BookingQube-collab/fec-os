export const VENDOR_CATEGORIES = [
  "maintenance",
  "cleaning",
  "pest_control",
  "fire_safety",
  "it",
  "pos",
  "mall_contractor",
  "branding",
  "games_supplier",
  "insurance",
  "legal_compliance",
  "other",
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];
