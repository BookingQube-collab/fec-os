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

/** Canonical venue labels — PDF event titles map here; short names kept for code-mapping UI. */
export const DEAL_VENUES = [
  "Urban Arena",
  "InflataPark",
  "Kids City Driving School",
  "Crayons & Bricks Vendome",
  "Crayons & Bricks Dar Al Salam",
  "KDS",
  "C&B Vendome",
  "C&B Dar Al Salam",
  "Aspire Carousel",
  "Cafe",
  "Not specified",
] as const;
export type DealVenue = (typeof DEAL_VENUES)[number];

/**
 * Map BookingQube `event_title` (and LOCATION_SHORT_NAME aliases) to report venue labels.
 * Export wins over Code Mapping venue (workbook rule).
 */
export const EVENT_TITLE_VENUE_RULES: ReadonlyArray<{ test: RegExp; venue: DealVenue }> = [
  { test: /urban\s*arena/i, venue: "Urban Arena" },
  { test: /inflata/i, venue: "InflataPark" },
  { test: /kids\s*city|driving\s*school|\bkds\b/i, venue: "Kids City Driving School" },
  { test: /vendome|c\s*&\s*b\s*vendome|crayons.*vendome/i, venue: "Crayons & Bricks Vendome" },
  { test: /dar\s*al\s*salam|c\s*&\s*b\s*dar|crayons.*dar/i, venue: "Crayons & Bricks Dar Al Salam" },
  { test: /aspire|carousel/i, venue: "Aspire Carousel" },
  { test: /\bcafe\b/i, venue: "Cafe" },
];

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

/**
 * Default follow-ups for week-zero partners (Week 37 brief / ops playbook).
 * Used when no partner-tagged MoM row exists.
 */
export const DORMANT_DEFAULT_ACTIONS: Readonly<Record<string, string>> = {
  "Dar App": "Confirm the listing is live in the app",
  Classmate: "Check the offer is published and the PIN works",
  MyBenefit: "Codes never used; brief counters and confirm promotion",
  DHL: "Send an offer reminder to the HR contact",
  Huawei: "Send an offer reminder to the HR contact",
  "Qatar Media Corporation": "Last used in August; reminder to the HR contact",
  "Snoonu Employees": "Confirm the deal is visible in the app",
  Bein: "One redemption earlier in the month; no action needed yet",
  "Qatar Living Deals": "One redemption earlier in the month; no action needed yet",
};

/** Brief estimate: reactivate month-long dormant at average corporate rate. */
export const DORMANT_PRIZE = { redemptions: 60, tickets: 220 } as const;

export const IMPORT_KINDS = ["week", "month", "trend"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
