/** Corporate Deals Weekly Report — partner master + classification constants. */

export const DEAL_CATEGORIES = [
  "Corporate discount",
  "Aggregator BOGO",
  "Not on master",
  "Internal / promotion",
  "Unmapped",
] as const;
export type DealCategory = (typeof DEAL_CATEGORIES)[number];

/** Included in partner / KPI totals (spec §4). */
export const PARTNER_TOTAL_CATEGORIES: ReadonlySet<DealCategory> = new Set([
  "Corporate discount",
  "Aggregator BOGO",
  "Not on master",
]);

export const DEAL_VENUES = [
  "KDS",
  "InflataPark",
  "Urban Arena",
  "C&B Dar Al Salam",
  "C&B Vendome",
  "Aspire Carousel",
  "Cafe",
  "Not specified",
] as const;
export type DealVenue = (typeof DEAL_VENUES)[number];

export interface PartnerMasterRow {
  name: string;
  category: Extract<DealCategory, "Corporate discount" | "Aggregator BOGO">;
  redemption_mechanism: string;
}

/** Spec §3.1 — 21 partners. */
export const PARTNER_MASTER: readonly PartnerMasterRow[] = [
  { name: "Al Jazeera Imtiyazat", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "My Book", category: "Aggregator BOGO", redemption_mechanism: "App PIN 9247" },
  { name: "QIB", category: "Corporate discount", redemption_mechanism: "QIB cardholders" },
  { name: "Dar App", category: "Corporate discount", redemption_mechanism: "Dar community app" },
  { name: "Qatar Airways", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "Entertainer", category: "Aggregator BOGO", redemption_mechanism: "App 9581" },
  { name: "Public Health Sector (Sogha)", category: "Corporate discount", redemption_mechanism: "Sogha card ID" },
  { name: "Urban Point", category: "Aggregator BOGO", redemption_mechanism: "App 7654" },
  { name: "Qatar Living Deals", category: "Aggregator BOGO", redemption_mechanism: "Qatar Living Deals app" },
  { name: "Imtyazat", category: "Corporate discount", redemption_mechanism: "Imtyazat ID card" },
  { name: "Classmate", category: "Aggregator BOGO", redemption_mechanism: "App 9171" },
  {
    name: "MyBenefit",
    category: "Corporate discount",
    redemption_mechanism: "mbfua15 / mbfip15 / mbfcb15 / mbfkd15",
  },
  { name: "DHL", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "Qatar Foundation", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "Qatar Investment Authority", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "Bein", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "Huawei", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "Aspire", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "Qatar Media Corporation", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "QNB Rewards", category: "Corporate discount", redemption_mechanism: "Staff ID" },
  { name: "Snoonu Employees", category: "Corporate discount", redemption_mechanism: "Scity app" },
] as const;

/** Description tokens → Internal / promotion (excluded from partner totals). */
export const INTERNAL_PROMO_PATTERNS = [
  /loyalty\s*pass/i,
  /\bcafe\b/i,
  /\bkarak\b/i,
  /driving[-\s]?licen[cs]e/i,
  /inflatarun/i,
  /\bjunior\b/i,
  /media[-\s]?pass/i,
  /\bzubara\b/i,
] as const;

/** From May 2026: BOGO+staff-ID replaced single-use 100% aggregator codes — do not present as growth. */
export const AGGREGATOR_METHOD_CHANGE_ISO_WEEK = "2026-W18";

export const IMPORT_KINDS = ["week", "month", "trend"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
