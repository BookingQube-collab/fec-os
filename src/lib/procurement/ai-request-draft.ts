import "server-only";

import { z } from "zod";

import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import {
  matchLocationByCodeOrName,
  matchLocationFromNotes,
  parseReportedAtFromNotes,
  type MaintenanceLocationOption,
} from "@/lib/maintenance/ai-request-draft";

const QATAR_TZ = "Asia/Qatar";

export const PR_CATEGORIES = [
  "fnb",
  "maintenance",
  "attractions",
  "it",
  "uniforms",
  "cleaning",
  "marketing",
  "services",
  "general",
] as const;

export const PR_AI_FOCUSES = ["all", "details", "items", "payment", "approvers"] as const;
export const PR_PAYMENT_STRUCTURES = ["full_advance", "milestones", "post_delivery"] as const;

export type PrCategory = (typeof PR_CATEGORIES)[number];
export type PrAiFocus = (typeof PR_AI_FOCUSES)[number];
export type PrPaymentStructure = (typeof PR_PAYMENT_STRUCTURES)[number];
export type PrRequestType = "goods" | "services" | "mixed";
export type PrSpendType = "opex" | "capex";
export type PrPriority = "low" | "normal" | "high" | "emergency";
export type PrPriceSource = "quoted" | "history" | "estimated";

export type PrCatalogItem = {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
};

export type PrVendorOption = { id: string; name: string };
export type PrDepartmentOption = { id: string; name: string };
export type PrPriceHint = {
  item_id: string | null;
  item_name: string | null;
  category: string | null;
  unit_price: number;
  vendor_id?: string | null;
};

export type PrVendorHistoryHint = {
  item_id: string | null;
  item_name: string;
  category: string | null;
  vendor_id: string;
  vendor_name: string;
  unit_price: number | null;
  pr_number: string | null;
  supplied_on: string | null;
};

export type PrDraftLine = {
  name: string;
  description: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
  preferred_vendor_id: string | null;
  remarks: string;
  item_id: string | null;
  price_source: PrPriceSource;
  previous_supplier_note: string | null;
  previous_vendor_name: string | null;
  previous_pr_number: string | null;
  previous_supplied_on: string | null;
};

export type PrDraftFields = {
  location_id: string | null;
  location_code: string | null;
  location_name: string | null;
  department_id: string | null;
  department_name: string | null;
  cost_center: string | null;
  project_name: string | null;
  request_type: PrRequestType;
  spend_type: PrSpendType;
  priority: PrPriority;
  required_by: string | null;
  justification: string;
  lines: PrDraftLine[];
  summary: string;
  title: string;
  purpose_category: PrCategory;
  vendor_id: string | null;
  vendor_name: string | null;
  payment_structure: PrPaymentStructure;
  payment_reason: string;
  extra_approver_department_ids: string[];
};

export interface PrAiDraftContext {
  notes: string;
  focus?: PrAiFocus;
  location_id?: string | null;
  location_code: string;
  location_name: string;
  staff_department_id?: string | null;
  staff_department_name?: string | null;
  available_locations: MaintenanceLocationOption[];
  available_departments: PrDepartmentOption[];
  available_vendors: PrVendorOption[];
  available_items: PrCatalogItem[];
  recent_prices?: PrPriceHint[];
  /** Most-recent-first line→vendor history from prior PRs / price records. */
  vendor_history?: PrVendorHistoryHint[];
  now?: Date;
}

const LineDraftSchema = z.object({
  name: z.string(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  qty: z.number().or(z.string()).optional().nullable(),
  unit: z.string().optional().nullable(),
  unit_price: z.number().or(z.string()).optional().nullable(),
  vendor_name: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  previous_supplier_note: z.string().optional().nullable(),
});

const DraftSchema = z.object({
  title: z.string().optional().nullable(),
  location_code: z.string().optional().nullable(),
  department_name: z.string().optional().nullable(),
  cost_center: z.string().optional().nullable(),
  project_name: z.string().optional().nullable(),
  purpose_category: z.enum(PR_CATEGORIES).optional().nullable(),
  request_type: z.enum(["goods", "services", "mixed"]).optional().nullable(),
  spend_type: z.enum(["opex", "capex"]).optional().nullable(),
  priority: z.enum(["low", "normal", "high", "emergency"]).optional().nullable(),
  required_by: z.string().optional().nullable(),
  justification: z.string().optional().nullable(),
  vendor_name: z.string().optional().nullable(),
  payment_structure: z.enum(PR_PAYMENT_STRUCTURES).optional().nullable(),
  payment_reason: z.string().optional().nullable(),
  extra_approver_departments: z.array(z.string()).optional().nullable(),
  lines: z.array(LineDraftSchema).optional().nullable(),
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function qatarYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addQatarDaysYmd(now: Date, days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const base = new Date(`${get("year")}-${pad2(get("month"))}-${pad2(get("day"))}T12:00:00+03:00`);
  base.setTime(base.getTime() + days * 24 * 60 * 60 * 1000);
  return qatarYmd(base);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function pickAllowed<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return fallback;
  const hit = allowed.find((a) => a === trimmed);
  return hit ?? fallback;
}

function slug(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);
}

const CATEGORY_HINTS: Array<{ category: PrCategory; words: string[] }> = [
  { category: "maintenance", words: ["hvac", "filter", "spare", "pump", "motor", "bearing", "ac", "compressor", "valve", "belt", "lubricant", "tool"] },
  { category: "attractions", words: ["ride", "attraction", "carousel", "inflatable", "arcade", "soft play", "kart", "bumper"] },
  { category: "uniforms", words: ["uniform", "shirt", "badge", "apron", "vest", "cap"] },
  { category: "cleaning", words: ["clean", "chemical", "garbage", "tissue", "disinfectant", "soap", "bin liner", "mop"] },
  { category: "it", words: ["pos", "printer", "tablet", "network", "laptop", "router", "receipt roll", "scanner", "cash drawer", "internet", "wifi", "sim", "charger", "anker", "fiber"] },
  { category: "fnb", words: ["food", "beverage", "snack", "cup", "lid", "syrup", "packaging", "napkin", "straw"] },
  { category: "marketing", words: ["banner", "flyer", "print", "poster", "standee", "campaign", "sticker"] },
  { category: "services", words: ["service", "contractor", "consultant", "amc", "labour", "labor", "installation", "repair job"] },
];

function inferCategory(text: string): PrCategory {
  const key = normalizeKey(text);
  for (const row of CATEGORY_HINTS) {
    if (row.words.some((w) => key.includes(w))) return row.category;
  }
  return "general";
}

function inferPriority(notes: string): PrPriority {
  const t = notes.toLowerCase();
  if (/\b(emergency|asap|immediately|safety|broken down|guest impact|stoppage)\b/.test(t)) return "emergency";
  if (/\b(urgent|high priority|overheating|out of stock|today|tomorrow)\b/.test(t)) return "high";
  if (/\b(low priority|when possible|no rush|routine)\b/.test(t)) return "low";
  return "normal";
}

function inferRequestType(
  notes: string,
  lines: Array<{ category?: string | null; name?: string | null }>,
): PrRequestType {
  const blob = `${notes} ${lines.map((l) => `${l.name ?? ""} ${l.category ?? ""}`).join(" ")}`.toLowerCase();
  const service = /\b(service|contractor|labour|labor|amc|installation|consultancy|repair job)\b/.test(blob);
  const goods = /\b(filter|spare|uniform|stock|item|box|pack|part|consumable|supply)\b/.test(blob);
  if (service && goods) return "mixed";
  if (service) return "services";
  return "goods";
}

function inferSpendType(notes: string): PrSpendType {
  const t = notes.toLowerCase();
  if (/\b(capex|capital|asset|equipment|machine|renovation|new ride|installation of)\b/.test(t)) return "capex";
  return "opex";
}

const TITLE_SMALL = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to", "vs"]);
const TITLE_ACRONYMS = new Set(["ac", "amc", "hvac", "it", "pos", "qar", "sim", "sku", "usb"]);
const NAMED_EVENTS = [
  /back\s*to\s*school/i,
  /lego\s+show/i,
  /national\s+day/i,
  /summer\s+camp/i,
  /ramadan/i,
  /\beid\b/i,
];
const NAMED_SITES = [/doha\s+mall/i, /urban\s+arena/i, /inflatapark/i];

function wordCount(value: string): number {
  return value
    .replace(/[—–-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w, i, arr) => {
      const bare = w.replace(/[^A-Za-z0-9]/g, "");
      const lower = bare.toLowerCase();
      if (TITLE_ACRONYMS.has(lower)) {
        return w.replace(bare, bare.toUpperCase());
      }
      if (i > 0 && i < arr.length - 1 && TITLE_SMALL.has(lower)) {
        return w.replace(bare, lower);
      }
      if (!bare) return w;
      return w.replace(bare, bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase());
    })
    .join(" ");
}

function extractEventHint(notes: string): string | null {
  for (const re of NAMED_EVENTS) {
    const m = notes.match(re);
    if (m?.[0]) return toTitleCase(m[0]);
  }
  const campaign = notes.match(
    /\b(?:for|during)\s+(?:the\s+)?([a-z][\w\s]{2,36}?)\s+(?:setup|event|activation|campaign|show)\b/i,
  );
  if (campaign?.[1]) {
    let phrase = campaign[1].trim();
    for (const re of NAMED_SITES) phrase = phrase.replace(re, " ");
    phrase = phrase.replace(/\s+/g, " ").trim();
    if (phrase.length >= 3 && wordCount(phrase) <= 6) return toTitleCase(phrase);
  }
  return null;
}

function extractSiteHint(notes: string, locationName?: string | null): string | null {
  for (const re of NAMED_SITES) {
    const m = notes.match(re);
    if (m?.[0]) return toTitleCase(m[0]);
  }
  const short = (locationName ?? "").replace(/\s*\([^)]*\)\s*/g, "").trim();
  if (short && normalizeKey(notes).includes(normalizeKey(short))) return short;
  return null;
}

function inferPurchaseTheme(notes: string, lines: Array<{ name: string }>): string {
  const blob = normalizeKey(`${notes} ${lines.map((l) => l.name).join(" ")}`);
  if (/\b(internet|wifi|wi fi|router|sim|fiber|network|connectivity)\b/.test(blob)) return "Connectivity Kit";
  if (/\b(charger|anker|power bank|adapter)\b/.test(blob)) return "Power Accessories";
  if (/\b(hvac|filter|compressor)\b/.test(blob)) return "HVAC Supplies";
  if (/\b(uniform|shirt|apron|vest)\b/.test(blob)) return "Uniforms";
  if (lines.length === 1 && lines[0]?.name && wordCount(lines[0].name) <= 5) {
    return toTitleCase(lines[0].name);
  }
  const labels: Record<PrCategory, string> = {
    fnb: "F&B Supplies",
    maintenance: "Maintenance Supplies",
    attractions: "Attraction Supplies",
    it: "IT Equipment",
    uniforms: "Uniforms",
    cleaning: "Cleaning Supplies",
    marketing: "Marketing Materials",
    services: "Contracted Services",
    general: "Purchase Request",
  };
  return labels[inferCategory(blob)];
}

function looksLikeRawNotes(text: string, notes: string, kind: "title" | "body" = "title"): boolean {
  const t = text.trim();
  if (!t) return true;
  if (kind === "title" && wordCount(t) > 12) return true;
  if (/\b(i want|i need|wanna|pls|please buy)\b/i.test(t)) return true;
  if (kind === "title" && (t.match(/\b(?:qar|qr)\b/gi) ?? []).length >= 2) return true;
  const n = normalizeKey(notes);
  const k = normalizeKey(t);
  if (!n || !k) return false;
  if (k === n || n.startsWith(k) || (k.startsWith(n) && n.length > 24)) return true;
  if (kind === "title" && n.includes(k) && k.length > 40) return true;
  return false;
}

function inferTitle(notes: string, lines: Array<{ name: string }> = [], locationName?: string | null): string {
  const event = extractEventHint(notes);
  const site = extractSiteHint(notes, locationName);
  const kit = inferPurchaseTheme(notes, lines);
  if (event && site) return `${event} — ${site} ${kit}`.slice(0, 80);
  if (event) return `${event} — ${kit}`.slice(0, 80);
  if (site) return `${site} ${kit}`.slice(0, 80);
  return kit.slice(0, 80);
}

function polishTitle(
  candidate: string | null | undefined,
  notes: string,
  lines: Array<{ name: string }>,
  locationName: string | null,
): string {
  const raw = candidate?.trim() ?? "";
  if (raw && !looksLikeRawNotes(raw, notes) && wordCount(raw) >= 3 && wordCount(raw) <= 12) {
    return toTitleCase(raw).slice(0, 80);
  }
  return inferTitle(notes, lines, locationName);
}

type ExtractedNeed = { name: string; qty: number; unit_price: number | null; segment: string };

function countQuotedPrices(notes: string): number {
  return (notes.match(/\b(?:qar|qr|riyal)\s*\d+|\d+\s*(?:qar|qr|riyal|per\s+\w+)/gi) ?? []).length;
}

function cleanExtractedName(segment: string, notes: string): string {
  let s = segment;
  const event = extractEventHint(notes);
  const site = extractSiteHint(notes, null);
  if (event) s = s.replace(new RegExp(event.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  if (site) s = s.replace(new RegExp(site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  s = s
    .replace(/\b(?:qar|qr|riyal)\s*\d+(?:\.\d+)?/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:qar|qr|riyal)\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\s*per\s+\w+/gi, " ")
    .replace(/\bi\s+want(?:\s+to)?\b/gi, " ")
    .replace(/\bi\s+need\b/gi, " ")
    .replace(/\b(?:qty|quantity|x)\s*[:=]?\s*\d+/gi, " ")
    .replace(/\b\d+\s*(?:x|pcs|units?|ea)\b/gi, " ")
    .replace(/\bper\s+\w+\b/gi, " ")
    .replace(/\b(for|during|the|setup|event|activation|campaign|please|need|needed|to|and)\b/gi, " ")
    .replace(/[—–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\banker\b/i.test(s)) {
    s = `Anker ${s.replace(/\banker\b/gi, "")}`.replace(/\s+/g, " ").trim();
  }
  return polishLineName(toTitleCase(s));
}

function polishLineName(name: string): string {
  const k = normalizeKey(name);
  if (!k) return "Requested Item";
  if (/^(internet|wifi|wi fi|connectivity|internet connectivity)$/.test(k)) return "Internet / Connectivity Setup";
  if (/\bsim\b/.test(k) && /\brouter\b/.test(k)) return "SIM Card Router";
  if (/\banker\b/.test(k) && /\bcharger\b/.test(k)) return "Anker Fast Charger";
  return name.slice(0, 200);
}

function lineDescription(
  name: string,
  existing: string | null | undefined,
  notes: string,
  qty: number,
  unit_price: number,
): string {
  const cleaned = (existing ?? "").trim();
  if (
    cleaned.length >= 12 &&
    normalizeKey(cleaned) !== normalizeKey(name) &&
    normalizeKey(cleaned) !== normalizeKey(notes) &&
    !looksLikeRawNotes(cleaned, notes, "body")
  ) {
    return cleaned.slice(0, 240);
  }
  const event = extractEventHint(notes);
  const site = extractSiteHint(notes, null);
  const purpose = event ? `the ${event} setup` : "site operations";
  const where = site ? ` at ${site}` : "";
  const qtyBit = qty > 1 ? `${String(qty).replace(/\.0$/, "")} units` : "one unit";
  const priceBit = unit_price > 0 ? `, quoted at QAR ${Math.round(unit_price)}` : "";
  return `${name} — ${qtyBit}${priceBit} for ${purpose}${where}.`.slice(0, 240);
}

function extractNeedLines(notes: string): ExtractedNeed[] {
  const priceHits = countQuotedPrices(notes);
  const wantHits = (notes.match(/\bi\s+want\s+\d+/gi) ?? []).length;
  if (priceHits < 2 && wantHits < 2) return [];
  const parts = notes
    .split(/,|\band\b|\bplus\b|\balso\b/i)
    .map((s) => s.replace(/^[\s,.;:\-—]+/, "").trim())
    .filter((s) => s.length >= 3);
  const rows: ExtractedNeed[] = [];
  for (const segment of parts) {
    if (/^(required by|urgent|asap|please)\b/i.test(segment) && !/\d/.test(segment)) continue;
    const priceM =
      segment.match(/\b(?:qar|qr|riyal)\s*(\d+(?:\.\d+)?)/i) ||
      segment.match(/\b(\d+(?:\.\d+)?)\s*(?:qar|qr|riyal|per\s+\w+)/i);
    const qtyM = segment.match(/\bi\s+want\s+(\d+)\b/i) || segment.match(/\b(\d+)\s*(?:x|pcs|units?|ea)\b/i);
    const unit_price = priceM ? Number(priceM[1]) : null;
    const qty = qtyM ? Number(qtyM[1]) : 1;
    const name = cleanExtractedName(segment, notes);
    if (name.length < 2) continue;
    rows.push({
      name: name.slice(0, 120),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit_price: unit_price && unit_price > 0 ? unit_price : null,
      segment,
    });
  }
  return rows;
}

function matchingExtractedNeed(name: string, notes: string): ExtractedNeed | null {
  const extracted = extractNeedLines(notes);
  if (!extracted.length) return null;
  let best: { row: ExtractedNeed; score: number } | null = null;
  for (const row of extracted) {
    const score = itemNameSimilarity(name, row.name);
    if (score < 0.5) continue;
    if (!best || score > best.score) best = { row, score };
  }
  return best?.row ?? null;
}

function joinAndList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

const PAYMENT_REASONS: Record<PrPaymentStructure, string> = {
  full_advance: "100% upfront upon approval so the vendor can mobilize immediately.",
  milestones: "Split into payment stages against agreed deliverables.",
  post_delivery: "Payment is deferred until final handover and verification of deliverables.",
};

function inferPayment(
  notes: string,
  total: number,
  requestType: PrRequestType,
  priority: PrPriority,
): { structure: PrPaymentStructure; reason: string } {
  const t = notes.toLowerCase();
  if (/\b(full advance|100%\s*(upfront|advance)|pay\s*upfront)\b/.test(t)) {
    return { structure: "full_advance", reason: PAYMENT_REASONS.full_advance };
  }
  if (/\b(milestone|staged payment|progress payment|in stages)\b/.test(t)) {
    return { structure: "milestones", reason: PAYMENT_REASONS.milestones };
  }
  if (/\b(on delivery|after delivery|post[- ]delivery|handover|on completion)\b/.test(t)) {
    return { structure: "post_delivery", reason: PAYMENT_REASONS.post_delivery };
  }
  if (priority === "emergency") {
    return { structure: "full_advance", reason: PAYMENT_REASONS.full_advance };
  }
  if (requestType === "services" || total >= 15_000) {
    return { structure: "milestones", reason: PAYMENT_REASONS.milestones };
  }
  return { structure: "post_delivery", reason: PAYMENT_REASONS.post_delivery };
}

function matchExtraApproverDepartments(
  hints: string[] | null | undefined,
  notes: string,
  departments: PrDepartmentOption[],
  submittingId: string | null,
): string[] {
  const names = [...(hints ?? [])];
  const key = normalizeKey(notes);
  for (const d of departments) {
    const n = normalizeKey(d.name);
    if (n.length >= 3 && key.includes(n)) names.push(d.name);
  }
  const ids: string[] = [];
  for (const hint of names) {
    const dept = matchDepartment(hint, departments);
    if (dept && dept.id !== submittingId && !ids.includes(dept.id)) ids.push(dept.id);
  }
  return ids.slice(0, 6);
}

function inferQty(notes: string): number {
  const m =
    notes.match(/\b(?:qty|quantity|x)\s*[:=]?\s*(\d+(?:\.\d+)?)/i) ||
    notes.match(/\b(\d+(?:\.\d+)?)\s*(?:pcs|pieces|boxes|box|packs|pack|sets|set|units|unit|ea|filters?|rolls?|pairs?|bottles?|litres?|liters?)\b/i) ||
    notes.match(/\b(\d{1,4})\s+(?:hvac|ac|pos|uniform|filter|roll)/i);
  const n = m ? Number(m[1]) : NaN;
  if (Number.isFinite(n) && n > 0 && n < 100000) return n;
  return 1;
}

function quotedPriceFromNotes(notes: string): number | null {
  const m =
    notes.match(/\b(?:qar|qr|riyal)\s*(\d+(?:\.\d+)?)/i) ||
    notes.match(/\b(\d+(?:\.\d+)?)\s*(?:qar|qr|riyal)\b/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function parseRequiredBy(notes: string, now: Date, priority: PrPriority): string {
  const iso = parseReportedAtFromNotes(notes, now);
  if (iso) return iso.slice(0, 10);

  const ymd = notes.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (ymd) return ymd[1];

  const lower = notes.toLowerCase();
  if (/\b(today|asap|immediately|tonight)\b/.test(lower)) return addQatarDaysYmd(now, priority === "emergency" ? 0 : 1);
  if (/\btomorrow\b/.test(lower)) return addQatarDaysYmd(now, 1);
  if (/\bnext week\b/.test(lower)) return addQatarDaysYmd(now, 7);
  if (/\bend of (the )?month\b/.test(lower)) {
    const [y, m] = qatarYmd(now).split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0));
    return `${y}-${pad2(m)}-${pad2(last.getUTCDate())}`;
  }

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const re = new RegExp(`\\b(?:by|before|on|this|next)?\\s*${WEEKDAYS[i]}\\b`);
    if (re.test(lower)) {
      const todayIdx = new Date(
        `${qatarYmd(now)}T12:00:00+03:00`,
      ).getUTCDay();
      let delta = (i - todayIdx + 7) % 7;
      if (delta === 0) delta = 7;
      if (/\bnext\s+/.test(lower) && delta < 7) delta += 7;
      return addQatarDaysYmd(now, delta);
    }
  }

  const lead = priority === "emergency" ? 1 : priority === "high" ? 3 : priority === "low" ? 14 : 7;
  return addQatarDaysYmd(now, lead);
}

function matchDepartment(
  hint: string | null | undefined,
  departments: PrDepartmentOption[],
  staffDepartmentId?: string | null,
): PrDepartmentOption | null {
  const raw = hint?.trim();
  if (raw && departments.length) {
    const key = normalizeKey(raw);
    const exact = departments.find((d) => normalizeKey(d.name) === key);
    if (exact) return exact;
    const contains = departments.filter((d) => {
      const n = normalizeKey(d.name);
      return n.includes(key) || key.includes(n);
    });
    if (contains.length === 1) return contains[0];
  }
  if (staffDepartmentId) {
    return departments.find((d) => d.id === staffDepartmentId) ?? null;
  }
  return departments[0] ?? null;
}

function matchVendor(hint: string | null | undefined, vendors: PrVendorOption[]): PrVendorOption | null {
  const key = normalizeKey(hint ?? "");
  if (!key || key.length < 2) return null;
  const exact = vendors.find((v) => normalizeKey(v.name) === key);
  if (exact) return exact;
  const hits = vendors.filter((v) => {
    const n = normalizeKey(v.name);
    return n.includes(key) || key.includes(n);
  });
  return hits.length === 1 ? hits[0] : null;
}

function itemNameSimilarity(a: string, b: string): number {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  const tokensA = new Set(left.split(" ").filter((t) => t.length > 2));
  const tokensB = new Set(right.split(" ").filter((t) => t.length > 2));
  if (!tokensA.size || !tokensB.size) return 0;
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap += 1;
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function formatPreviousSupplierNote(hit: PrVendorHistoryHint): string {
  const vendor = hit.vendor_name.trim() || "the previous vendor";
  if (hit.pr_number && hit.supplied_on) {
    return `Previously supplied by ${vendor} on ${hit.pr_number} (${hit.supplied_on})`;
  }
  if (hit.pr_number) return `Previously supplied by ${vendor} on ${hit.pr_number}`;
  if (hit.supplied_on) return `Previously supplied by ${vendor} (${hit.supplied_on})`;
  return `Previously supplied by ${vendor}`;
}

/**
 * Prefer the most recent vendor used for the same / very similar item.
 * Does not invent vendors — only returns ids that exist in the vendor master.
 */
export function matchLastVendorForItem(
  line: { name: string; category?: string | null; item_id?: string | null; sku?: string | null },
  history: PrVendorHistoryHint[],
  vendors: PrVendorOption[],
): PrVendorHistoryHint | null {
  if (!history.length || !vendors.length) return null;
  const vendorIds = new Set(vendors.map((v) => v.id));
  const usable = history.filter((h) => h.vendor_id && vendorIds.has(h.vendor_id));
  if (!usable.length) return null;

  if (line.item_id) {
    const byId = usable.find((h) => h.item_id === line.item_id);
    if (byId) return byId;
  }
  if (line.sku) {
    const skuKey = normalizeKey(line.sku);
    const bySku = usable.find((h) => normalizeKey(h.item_name) === skuKey);
    if (bySku) return bySku;
  }

  let best: { hit: PrVendorHistoryHint; score: number } | null = null;
  for (const h of usable) {
    let score = itemNameSimilarity(line.name, h.item_name);
    if (line.category && h.category && normalizeKey(line.category) === normalizeKey(h.category)) {
      score += 0.05;
    }
    if (score < 0.58) continue;
    if (!best || score > best.score) best = { hit: h, score };
  }
  return best?.hit ?? null;
}

function matchVendorNamedInNotes(notes: string, vendors: PrVendorOption[]): PrVendorOption | null {
  const key = normalizeKey(notes);
  if (!key || vendors.length === 0) return null;
  const ranked = vendors
    .map((v) => ({ v, n: normalizeKey(v.name) }))
    .filter((row) => row.n.length >= 3 && key.includes(row.n))
    .sort((a, b) => b.n.length - a.n.length);
  if (!ranked.length) return null;
  const top = ranked[0].n;
  const ties = ranked.filter((r) => r.n === top);
  return ties.length === 1 ? ties[0].v : null;
}

function splitNeedSegments(notes: string): string[] {
  const parts = notes
    .split(/\n+|\b(?:also|plus)\b/i)
    .map((s) => s.replace(/^[\s,.;:\-—]+/, "").trim())
    .filter((s) => s.length >= 3);
  return parts.length ? parts : [notes];
}

function matchCatalogItem(
  name: string,
  _category: string,
  sku: string | null | undefined,
  items: PrCatalogItem[],
): PrCatalogItem | null {
  if (sku) {
    const bySku = items.find((i) => (i.sku ?? "").toLowerCase() === sku.toLowerCase());
    if (bySku) return bySku;
  }
  const nameKey = normalizeKey(name);
  if (!nameKey || nameKey.length < 3) return null;
  const exact = items.find((i) => normalizeKey(i.name) === nameKey);
  if (exact) return exact;
  const contains = items.filter((i) => {
    const n = normalizeKey(i.name);
    if (n.length < 4 || nameKey.length < 4) return false;
    return n.includes(nameKey) || nameKey.includes(n);
  });
  return contains.length === 1 ? contains[0] : null;
}

function historyPrice(
  line: { name: string; category: string; item_id: string | null },
  prices: PrPriceHint[],
): number | null {
  if (!prices.length) return null;
  if (line.item_id) {
    const hit = prices.find((p) => p.item_id === line.item_id);
    if (hit) return hit.unit_price;
  }
  const key = normalizeKey(line.name);
  const byName = prices.find((p) => p.item_name && normalizeKey(p.item_name) === key);
  if (byName) return byName.unit_price;
  const byCat = prices.find((p) => p.category && p.category.toLowerCase() === line.category.toLowerCase());
  return byCat?.unit_price ?? null;
}

const CATEGORY_PRICE: Record<PrCategory, number> = {
  fnb: 180,
  maintenance: 85,
  attractions: 250,
  it: 420,
  uniforms: 90,
  cleaning: 65,
  marketing: 350,
  services: 1500,
  general: 100,
};

function estimateUnitPrice(category: string, name: string): number {
  const cat = pickAllowed(category, PR_CATEGORIES, "general");
  const n = normalizeKey(name);
  if (n.includes("filter")) return 45;
  if (n.includes("receipt") || n.includes("roll")) return 28;
  if (n.includes("uniform")) return 80;
  return CATEGORY_PRICE[cat];
}

function polishJustification(
  notes: string,
  venue: string,
  priority: PrPriority,
  requiredBy: string | null,
  lines: Array<{ name: string; qty: number; unit_price: number }> = [],
): string {
  const venueShort = venue.split("(")[0]?.trim() || venue;
  const event = extractEventHint(notes);
  const purpose = event
    ? `This requisition covers equipment and supplies for the ${event} setup at ${venueShort}.`
    : `This requisition covers operational supplies required at ${venueShort}.`;
  const usable = lines.filter((l) => l.name.trim());
  let items = "";
  if (usable.length) {
    const bits = usable.map((l) => {
      const qtyLabel = l.qty > 1 ? `${String(l.qty).replace(/\.0$/, "")} × ${l.name}` : l.name;
      const price =
        l.unit_price > 0 ? ` at QAR ${Math.round(l.unit_price)}${l.qty > 1 ? " each" : ""}` : "";
      return `${qtyLabel}${price}`;
    });
    items =
      bits.length === 1
        ? `The request is for ${bits[0]}.`
        : `The request includes ${joinAndList(bits)}.`;
    const total = usable.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
    if (total > 0) items += ` Estimated cost is QAR ${Math.round(total)}.`;
  }
  const urgency =
    priority === "emergency"
      ? " This is an emergency purchase to restore or protect operations."
      : priority === "high"
        ? " This is a high-priority purchase required to avoid operational disruption."
        : "";
  const when = requiredBy ? ` Required by ${requiredBy}.` : "";
  return `${purpose} ${items}${urgency}${when}`.replace(/\s+/g, " ").trim().slice(0, 4000);
}

function attachVendor(
  line: Omit<
    PrDraftLine,
    "previous_supplier_note" | "previous_vendor_name" | "previous_pr_number" | "previous_supplied_on"
  >,
  ctx: PrAiDraftContext,
  explicitVendor: PrVendorOption | null,
  aiVendorName?: string | null,
): PrDraftLine {
  const last = matchLastVendorForItem(
    { name: line.name, category: line.category, item_id: line.item_id },
    ctx.vendor_history ?? [],
    ctx.available_vendors,
  );
  const aiVendor = matchVendor(aiVendorName, ctx.available_vendors);
  const chosen =
    explicitVendor ??
    (last ? (ctx.available_vendors.find((v) => v.id === last.vendor_id) ?? null) : null) ??
    aiVendor;
  const note = last ? formatPreviousSupplierNote(last) : null;
  let remarks = (line.remarks ?? "").trim();
  if (note && !remarks.toLowerCase().includes("previously supplied")) {
    remarks = remarks ? `${remarks} ${note}` : note;
  }
  return {
    ...line,
    preferred_vendor_id: chosen?.id ?? null,
    remarks: remarks.slice(0, 500),
    previous_supplier_note: note,
    previous_vendor_name: last?.vendor_name ?? null,
    previous_pr_number: last?.pr_number ?? null,
    previous_supplied_on: last?.supplied_on ?? null,
  };
}

function withPreviousSupplierJustification(justification: string, lines: PrDraftLine[]): string {
  const notes = [...new Set(lines.map((l) => l.previous_supplier_note).filter((n): n is string => Boolean(n)))];
  if (!notes.length) return justification.slice(0, 4000);
  const missing = notes.filter((n) => !justification.includes(n));
  if (!missing.length) return justification.slice(0, 4000);
  return `${justification.trim()} ${missing.join(" ")}`.slice(0, 4000);
}

function lineNameFromNotes(notes: string): string {
  const cleaned = cleanExtractedName(notes.split(/[.!\n]/)[0] ?? notes, notes);
  return (cleaned || "Requested supplies").slice(0, 120);
}

function buildFallbackDraft(ctx: PrAiDraftContext): PrDraftFields {
  const now = ctx.now ?? new Date();
  const loc =
    matchLocationFromNotes(ctx.notes, ctx.available_locations) ??
    ctx.available_locations.find((l) => l.id === ctx.location_id) ??
    null;
  const location_code = loc?.code ?? ctx.location_code;
  const location_name = loc?.name ?? ctx.location_name;
  const venue = `${location_name} (${location_code})`;
  const priority = inferPriority(ctx.notes);
  const category = inferCategory(ctx.notes);
  const spend_type = inferSpendType(ctx.notes);
  const required_by = parseRequiredBy(ctx.notes, now, priority);
  const dept = matchDepartment(null, ctx.available_departments, ctx.staff_department_id);
  const quoted = quotedPriceFromNotes(ctx.notes);
  const namedVendor = matchVendorNamedInNotes(ctx.notes, ctx.available_vendors);
  const extracted = extractNeedLines(ctx.notes);
  const segments = extracted.length
    ? extracted.map((row) => ({ name: row.name, qty: row.qty, unit_price: row.unit_price, segment: row.segment }))
    : splitNeedSegments(ctx.notes).map((segment) => ({
        name: lineNameFromNotes(segment),
        qty: inferQty(segment),
        unit_price: null as number | null,
        segment,
      }));
  const lines: PrDraftLine[] = segments.map((row) => {
    const name = row.name;
    const lineCategory = inferCategory(row.segment);
    const catalog = matchCatalogItem(name, lineCategory, null, ctx.available_items);
    const hist = historyPrice(
      { name, category: catalog?.category ?? lineCategory, item_id: catalog?.id ?? null },
      ctx.recent_prices ?? [],
    );
    const last = matchLastVendorForItem(
      { name, category: catalog?.category ?? lineCategory, item_id: catalog?.id ?? null },
      ctx.vendor_history ?? [],
      ctx.available_vendors,
    );
    const unit_price =
      row.unit_price ??
      (quoted && segments.length === 1 ? quoted : null) ??
      hist ??
      last?.unit_price ??
      estimateUnitPrice(lineCategory, name);
    const price_source: PrPriceSource = row.unit_price || (quoted && segments.length === 1)
      ? "quoted"
      : hist || last?.unit_price
        ? "history"
        : "estimated";
    const unit =
      catalog?.unit ??
      (lineCategory === "services" ? "job" : lineCategory === "fnb" || lineCategory === "cleaning" ? "lot" : "ea");
    return attachVendor(
      {
        name,
        description: lineDescription(name, "", ctx.notes, row.qty, Number(unit_price)),
        category: catalog?.category ?? lineCategory,
        qty: row.qty,
        unit,
        unit_price: Number(unit_price),
        preferred_vendor_id: null,
        remarks: "",
        item_id: catalog?.id ?? null,
        price_source,
      },
      ctx,
      namedVendor,
    );
  });
  return finalizeDraft(
    {
      location_id: loc?.id ?? ctx.location_id ?? null,
      location_code,
      location_name,
      department_id: dept?.id ?? null,
      department_name: dept?.name ?? ctx.staff_department_name ?? null,
      cost_center: `${location_code}-${slug(dept?.name ?? category)}`,
      project_name: extractEventHint(ctx.notes),
      request_type: inferRequestType(ctx.notes, lines),
      spend_type,
      priority,
      required_by,
      justification: withPreviousSupplierJustification(
        polishJustification(ctx.notes, venue, priority, required_by, lines),
        lines,
      ),
      lines,
    },
    ctx,
  );
}

function normalizeLine(
  raw: z.infer<typeof LineDraftSchema>,
  ctx: PrAiDraftContext,
  quoted: number | null,
  explicitVendor: PrVendorOption | null,
): PrDraftLine {
  const name = polishLineName((raw.name || "Requested item").trim().slice(0, 200));
  const category = pickAllowed(raw.category ?? inferCategory(`${name} ${raw.description ?? ""}`), PR_CATEGORIES, inferCategory(name));
  const catalog = matchCatalogItem(name, category, raw.sku, ctx.available_items);
  const extractedHit = matchingExtractedNeed(name, ctx.notes);
  const qty = Math.max(0.01, toNumber(raw.qty, extractedHit?.qty ?? inferQty(`${raw.name} ${raw.description ?? ""}`)));
  const hist = historyPrice(
    { name, category: catalog?.category ?? category, item_id: catalog?.id ?? null },
    ctx.recent_prices ?? [],
  );
  const last = matchLastVendorForItem(
    { name, category: catalog?.category ?? category, item_id: catalog?.id ?? null, sku: raw.sku },
    ctx.vendor_history ?? [],
    ctx.available_vendors,
  );
  const aiPrice = toNumber(raw.unit_price, 0);
  let unit_price = aiPrice;
  let price_source: PrPriceSource = "estimated";
  if (quoted && quoted > 0) {
    unit_price = quoted;
    price_source = "quoted";
  } else if (extractedHit?.unit_price && extractedHit.unit_price > 0) {
    unit_price = extractedHit.unit_price;
    price_source = "quoted";
  } else if (aiPrice > 0) {
    unit_price = aiPrice;
    price_source = "estimated";
  } else if (hist != null) {
    unit_price = hist;
    price_source = "history";
  } else if (last?.unit_price != null && last.unit_price > 0) {
    unit_price = last.unit_price;
    price_source = "history";
  } else {
    unit_price = estimateUnitPrice(catalog?.category ?? category, name);
    price_source = "estimated";
  }
  return attachVendor(
    {
      name,
      description: lineDescription(name, raw.description, ctx.notes, qty, unit_price),
      category: catalog?.category ?? category,
      qty,
      unit: (raw.unit?.trim() || catalog?.unit || "ea").slice(0, 20),
      unit_price,
      preferred_vendor_id: null,
      remarks: (raw.remarks ?? raw.previous_supplier_note ?? "").trim().slice(0, 500),
      item_id: catalog?.id ?? null,
      price_source,
    },
    ctx,
    explicitVendor,
    raw.vendor_name,
  );
}

function focusInstructions(focus?: PrAiFocus): string {
  if (focus === "details") {
    return "FOCUS = details (title & overview). title and justification are mandatory rewrites. Also extract every line with name, description, qty, and unit_price so items can be applied to the form.";
  }
  if (focus === "items") {
    return "FOCUS = items: extract every distinct product as its own free-text line with name, description, qty, and unit_price. Catalog match is optional.";
  }
  if (focus === "payment") return "FOCUS = payment: recommend payment_structure and payment_reason from the notes and totals.";
  if (focus === "approvers") return "FOCUS = approvers: extra_approver_departments only when the notes name another department.";
  return "FOCUS = all: fill every field. title and justification must be rewritten professionally — never copied from the notes.";
}

function buildUserPrompt(ctx: PrAiDraftContext): string {
  const deptNames = ctx.available_departments.map((d) => d.name).slice(0, 40);
  const vendorNames = ctx.available_vendors.map((v) => v.name).slice(0, 40);
  const itemNames = ctx.available_items
    .map((i) => `${i.sku ? `${i.sku} ` : ""}${i.name} [${i.category}/${i.unit}]`)
    .slice(0, 40);
  const locNames = ctx.available_locations.map((l) => `${l.code} — ${l.name}`).slice(0, 30);
  return [
    "Draft a professional purchase requisition for a Family Entertainment Centre (FEC) operator in Qatar.",
    focusInstructions(ctx.focus),
    `Default venue: ${ctx.location_name} (${ctx.location_code})`,
    ctx.staff_department_name ? `Requester department: ${ctx.staff_department_name}` : "",
    `Requester notes (informal — rewrite, do not copy): ${ctx.notes.trim()}`,
    `Today (Asia/Qatar): ${qatarYmd(ctx.now ?? new Date())}`,
    "",
    "The notes are often messy spoken English. You MUST rewrite them.",
    "Example notes: \"for back to school doha mall setup i want to internet 500 qar, sim card router 145 per router i want 3 and fast charger anker 50 qar per unit i want 3\"",
    "Good title: \"Back to School — Doha Mall Connectivity Kit\"",
    "Bad title: copying the notes, listing prices, or writing \"I want internet 500 QAR...\".",
    "Good justification: \"This requisition covers connectivity equipment for the Back to School setup at Doha Mall. It includes internet service at QAR 500, three SIM card routers at QAR 145 each, and three Anker fast chargers at QAR 50 each. Estimated total is QAR 1,085.\"",
    "",
    "Return ONLY valid JSON with these fields:",
    "title — REQUIRED. 4–10 words, Title Case. Capture event/location + what is being bought. No run-on lists, no raw requester phrasing, no \"I want\" / \"I need\", no prices or quantities unless essential. Do not invent brands not in the notes.",
    `location_code — one of: ${locNames.join("; ") || ctx.location_code} (use the venue named in the notes when present)`,
    `department_name — one of: ${deptNames.join(", ") || "Operations"}`,
    "cost_center — short code like UA-DM-MNT (location + department). Empty string if unknown.",
    "project_name — campaign/event if named (e.g. Back to School); else empty string",
    "purpose_category — one of: fnb, maintenance, attractions, it, uniforms, cleaning, marketing, services, general",
    "request_type — goods | services | mixed",
    "spend_type — opex for consumables/repairs; capex only for assets/equipment/renovation",
    "priority — low | normal | high | emergency (emergency = safety, stoppage, or ASAP)",
    "required_by — YYYY-MM-DD in Asia/Qatar. Infer from notes (Friday, tomorrow, 28 Aug). Default: emergency +1 day, high +3, normal +7, low +14.",
    "justification — REQUIRED. 2–4 polished professional sentences (correct grammar/spelling, procurement tone). Cover purpose, items with quantities, estimated cost in QAR, and site. Do not paste or lightly edit the requester paragraph. Do not invent vendors, amounts, or facts not in the notes. If a previous supplier is listed below for a line, mention it (Previously supplied by {vendor} on PR {code} ({date})).",
    `vendor_name — header vendor. MUST be exactly one of: ${vendorNames.join(", ") || "none"}. Same rules as line vendor_name. Empty if nothing matches.`,
    "payment_structure — full_advance | milestones | post_delivery. Prefer post_delivery for routine goods, milestones for services or higher value, full_advance only if notes/urgency require it.",
    "payment_reason — one short sentence explaining the structure. Do not invent policy.",
    `extra_approver_departments — names from: ${deptNames.join(", ") || "none"}. Only if the notes name that department and it is not the submitting department. Otherwise []. Do not invent approval policy.`,
    "lines — REQUIRED array. Split every distinct product into its own free-text row even if it is not in the catalog. Example for the notes above: Internet / Connectivity Setup qty 1 @ 500; SIM Card Router qty 3 @ 145; Anker Fast Charger qty 3 @ 50.",
    "  name — short item title only (e.g. HVAC MERV-13 filter, SIM Card Router), not the full requester paragraph.",
    "  description — REQUIRED. One professional sentence: what the item is and what it is for (event/site). Never leave empty. Never paste the requester paragraph. Never merely repeat the name.",
    "  category (one of: fnb, maintenance, attractions, it, uniforms, cleaning, marketing, services, general),",
    "  qty (number), unit (ea/lot/box/job/set), unit_price (use the QAR amount in the notes when given; otherwise estimate),",
    `  vendor_name — MUST be exactly one of: ${vendorNames.join(", ") || "none"}. Prefer the last supplier for the same/similar item from history. If notes name a catalog vendor, use that. If nothing matches, leave vendor_name empty — never invent a vendor.`,
    "  sku if matching catalog, remarks (include the previous-supplier sentence when history matches)",
    itemNames.length ? `Catalog hints: ${itemNames.join("; ")}` : "",
    (ctx.vendor_history ?? []).length
      ? `Recent item→vendor history (most recent first; reuse these vendors by exact name): ${(ctx.vendor_history ?? [])
          .slice(0, 24)
          .map((h) => {
            const pr = h.pr_number ? ` ${h.pr_number}` : "";
            const when = h.supplied_on ? ` ${h.supplied_on}` : "";
            return `${h.item_name} → ${h.vendor_name}${pr}${when}`;
          })
          .join("; ")}`
      : "No previous supplier history. Leave vendor_name empty unless notes name a catalog vendor.",
    "Do not invent guest names. Currency is QAR. Keep line names specific (e.g. HVAC MERV-13 filter, not just Maintenance spares).",
  ]
    .filter(Boolean)
    .join("\n");
}

type PrDraftCore = Omit<
  PrDraftFields,
  | "summary"
  | "title"
  | "purpose_category"
  | "vendor_id"
  | "vendor_name"
  | "payment_structure"
  | "payment_reason"
  | "extra_approver_department_ids"
>;

function withSummary(fields: PrDraftCore): PrDraftCore & { summary: string } {
  const total = fields.lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
  const n = fields.lines.length;
  return {
    ...fields,
    summary: `${n} line${n === 1 ? "" : "s"} · ${fields.priority} · ${fields.spend_type} · needed ${fields.required_by ?? "TBC"} · ~QAR ${Math.round(total)}`,
  };
}

function finalizeDraft(
  core: PrDraftCore,
  ctx: PrAiDraftContext,
  raw?: z.infer<typeof DraftSchema> | null,
): PrDraftFields {
  const base = withSummary(core);
  const total = base.lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
  const purpose = pickAllowed(
    raw?.purpose_category ?? inferCategory(`${ctx.notes} ${base.justification} ${base.lines.map((l) => l.name).join(" ")}`),
    PR_CATEGORIES,
    inferCategory(ctx.notes),
  );
  const namedVendor =
    matchVendor(raw?.vendor_name, ctx.available_vendors) ?? matchVendorNamedInNotes(ctx.notes, ctx.available_vendors);
  const lineVendorId = base.lines.find((l) => l.preferred_vendor_id)?.preferred_vendor_id ?? null;
  const vendor = namedVendor ?? ctx.available_vendors.find((v) => v.id === lineVendorId) ?? null;
  const inferredPay = inferPayment(ctx.notes, total, base.request_type, base.priority);
  const payment_structure = pickAllowed(raw?.payment_structure, PR_PAYMENT_STRUCTURES, inferredPay.structure);
  const payment_reason = (raw?.payment_reason?.trim() || PAYMENT_REASONS[payment_structure] || inferredPay.reason).slice(0, 400);
  const venue = `${base.location_name ?? ctx.location_name} (${base.location_code ?? ctx.location_code})`;
  const justification = looksLikeRawNotes(base.justification, ctx.notes, "body")
    ? polishJustification(ctx.notes, venue, base.priority, base.required_by, base.lines)
    : base.justification;
  return {
    ...base,
    title: polishTitle(raw?.title, ctx.notes, base.lines, base.location_name ?? ctx.location_name),
    justification,
    project_name: base.project_name?.trim() || extractEventHint(ctx.notes),
    purpose_category: purpose,
    vendor_id: vendor?.id ?? null,
    vendor_name: vendor?.name ?? null,
    payment_structure,
    payment_reason,
    extra_approver_department_ids: matchExtraApproverDepartments(
      raw?.extra_approver_departments,
      ctx.notes,
      ctx.available_departments,
      base.department_id,
    ),
  };
}

export async function callPurchaseRequisitionAiDraft(
  ctx: PrAiDraftContext,
): Promise<{ fields: PrDraftFields; ai_generated: boolean }> {
  let fallback: PrDraftFields;
  try {
    fallback = buildFallbackDraft(ctx);
  } catch {
    const recovered = extractNeedLines(ctx.notes);
    const recoveredRows = recovered.length
      ? recovered
      : [{ name: lineNameFromNotes(ctx.notes), qty: inferQty(ctx.notes), unit_price: null, segment: ctx.notes }];
    fallback = finalizeDraft(
      {
        location_id: ctx.location_id ?? null,
        location_code: ctx.location_code,
        location_name: ctx.location_name,
        department_id: ctx.staff_department_id ?? null,
        department_name: ctx.staff_department_name ?? null,
        cost_center: null,
        project_name: extractEventHint(ctx.notes),
        request_type: "goods",
        spend_type: "opex",
        priority: "normal",
        required_by: null,
        justification: "",
        lines: recoveredRows.map((row) => ({
          name: row.name,
          description: lineDescription(row.name, "", ctx.notes, row.qty, row.unit_price ?? 0),
          category: inferCategory(row.name),
          qty: row.qty,
          unit: "ea",
          unit_price: row.unit_price ?? 0,
          preferred_vendor_id: null,
          remarks: "",
          item_id: null,
          price_source: row.unit_price ? "quoted" : "estimated",
          previous_supplier_note: null,
          previous_vendor_name: null,
          previous_pr_number: null,
          previous_supplied_on: null,
        })),
      },
      ctx,
    );
  }

  try {
    return await draftWithLlmOrFallback(ctx, fallback);
  } catch {
    return { fields: fallback, ai_generated: false };
  }
}

async function draftWithLlmOrFallback(
  ctx: PrAiDraftContext,
  fallback: PrDraftFields,
): Promise<{ fields: PrDraftFields; ai_generated: boolean }> {
  const now = ctx.now ?? new Date();
  const quoted = quotedPriceFromNotes(ctx.notes);
  const explicitVendor = matchVendorNamedInNotes(ctx.notes, ctx.available_vendors);

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a procurement copywriter and intake assistant for FEC venues in Qatar. Requester notes are informal. NEVER copy them into title or justification. Rewrite a short Title Case title (4–10 words) and a 2–4 sentence professional overview. Extract every distinct product as its own free-text line with name, a required one-sentence description, qty, and QAR unit_price — even when the item is not in the catalog. Never invent vendor names — only use the vendor master or previous-supplier history provided.",
    },
    { role: "user" as const, content: buildUserPrompt(ctx) },
  ];

  const parsed = await completeJsonViaGateway(messages, {
    temperature: 0.25,
    moduleSource: "procurement.request_draft",
  });
  if (!parsed) return { fields: fallback, ai_generated: false };

  try {
      const fields = DraftSchema.parse(parsed);

      const aiLoc =
        matchLocationByCodeOrName(fields.location_code, ctx.available_locations) ??
        matchLocationFromNotes(ctx.notes, ctx.available_locations);
      const loc = aiLoc ?? ctx.available_locations.find((l) => l.id === ctx.location_id) ?? null;
      const location_code = loc?.code ?? ctx.location_code;
      const location_name = loc?.name ?? ctx.location_name;
      const venue = `${location_name} (${location_code})`;

      const priority = pickAllowed(fields.priority, ["low", "normal", "high", "emergency"] as const, inferPriority(ctx.notes));
      const request_type = pickAllowed(
        fields.request_type,
        ["goods", "services", "mixed"] as const,
        inferRequestType(ctx.notes, fields.lines ?? []),
      );
      const spend_type = pickAllowed(fields.spend_type, ["opex", "capex"] as const, inferSpendType(ctx.notes));
      const requiredRaw = fields.required_by?.trim() || "";
      const required_by = /^\d{4}-\d{2}-\d{2}$/.test(requiredRaw)
        ? requiredRaw
        : parseRequiredBy(ctx.notes || requiredRaw, now, priority);
      const dept = matchDepartment(
        fields.department_name,
        ctx.available_departments,
        ctx.staff_department_id,
      );
      const extracted = extractNeedLines(ctx.notes);
      const rawLines = (fields.lines ?? []).filter((l) => (l.name ?? "").trim());
      const dumpedSingle =
        rawLines.length === 1 && looksLikeRawNotes(rawLines[0]?.name ?? "", ctx.notes);
      const sourceLines =
        extracted.length && (!rawLines.length || extracted.length > rawLines.length || dumpedSingle)
          ? extracted.map((row) => ({
              name: row.name,
              qty: row.qty,
              unit_price: row.unit_price,
              description: "",
              category: inferCategory(row.name),
            }))
          : rawLines.length
            ? rawLines
            : [{ name: lineNameFromNotes(ctx.notes), qty: inferQty(ctx.notes) }];
      const multiPrice = countQuotedPrices(ctx.notes) > 1;
      const lines = sourceLines.map((line) =>
        normalizeLine(
          line,
          ctx,
          !multiPrice && sourceLines.length <= 1 ? quoted : quotedPriceFromNotes(line.name ?? ""),
          explicitVendor,
        ),
      );
      const justification = withPreviousSupplierJustification(
        (fields.justification?.trim() &&
        fields.justification.trim().length >= 12 &&
        !looksLikeRawNotes(fields.justification, ctx.notes, "body")
          ? fields.justification.trim()
          : polishJustification(ctx.notes, venue, priority, required_by, lines)
        ).slice(0, 4000),
        lines,
      );

      return {
        fields: finalizeDraft(
          {
            location_id: loc?.id ?? ctx.location_id ?? null,
            location_code,
            location_name,
            department_id: dept?.id ?? null,
            department_name: dept?.name ?? null,
            cost_center: (fields.cost_center?.trim() || `${location_code}-${slug(dept?.name ?? "OPS")}`).slice(0, 80),
            project_name: fields.project_name?.trim() || null,
            request_type,
            spend_type,
            priority,
            required_by,
            justification,
            lines,
          },
          ctx,
          fields,
        ),
        ai_generated: true,
      };
    } catch {
      return { fields: fallback, ai_generated: false };
    }
}
