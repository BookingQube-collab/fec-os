import { parseCsv } from "@/lib/csv-parse";
import {
  INTERNAL_PROMO_PATTERNS,
  PARTNER_MASTER,
  type DealCategory,
  type DealVenue,
  type ImportKind,
} from "./constants";

export interface PromoExportRow {
  promocode_id: string;
  promocode: string;
  description: string;
  company_name: string | null;
  period_week: string | null;
  period_month: string | null;
  times_used: number;
  booking_lines: number;
  tickets: number;
  total_discount: number;
}

export interface CodeMappingLookup {
  promocode: string;
  partner_name: string | null;
  category: DealCategory;
  venue: DealVenue | string;
}

/** Strip HTML tags and `&nbsp;` from BookingQube description. */
export function stripHtmlDescription(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const hit = row[k];
    if (hit != null && String(hit).trim() !== "") return String(hit).trim();
  }
  return "";
}

/** Normalize ISO week labels: `2026-W37`, `W37 2026`, `37`. */
export function normalizeIsoWeek(raw: string, fallbackYear?: number): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-W(\d{1,2})$/i);
  if (iso) return `${iso[1]}-W${String(Number(iso[2])).padStart(2, "0")}`;
  const spaced = s.match(/^W?(\d{1,2})\s*[/\- ]\s*(\d{4})$/i) || s.match(/^(\d{4})\s*[/\- ]\s*W?(\d{1,2})$/i);
  if (spaced) {
    const a = spaced[1];
    const b = spaced[2];
    const year = a.length === 4 ? a : b;
    const week = a.length === 4 ? b : a;
    return `${year}-W${String(Number(week)).padStart(2, "0")}`;
  }
  const weekOnly = s.match(/^W?(\d{1,2})$/i);
  if (weekOnly && fallbackYear) {
    return `${fallbackYear}-W${String(Number(weekOnly[1])).padStart(2, "0")}`;
  }
  return null;
}

export function normalizePeriodMonth(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) return `${ym[1]}-${String(Number(ym[2])).padStart(2, "0")}`;
  return null;
}

export function isInternalPromotion(description: string, category?: DealCategory): boolean {
  if (category === "Internal / promotion") return true;
  return INTERNAL_PROMO_PATTERNS.some((re) => re.test(description));
}

export function classifyRow(
  row: Pick<PromoExportRow, "promocode" | "description">,
  mapping: Map<string, CodeMappingLookup>,
): { partner_name: string | null; category: DealCategory; venue: string } {
  const key = row.promocode.trim().toLowerCase();
  const mapped = mapping.get(key);
  if (mapped) {
    const category =
      mapped.category === "Unmapped" && isInternalPromotion(row.description)
        ? "Internal / promotion"
        : mapped.category;
    return {
      partner_name: mapped.partner_name,
      category,
      venue: mapped.venue || "Not specified",
    };
  }
  if (isInternalPromotion(row.description)) {
    return { partner_name: null, category: "Internal / promotion", venue: "Not specified" };
  }
  const partnerHit = PARTNER_MASTER.find(
    (p) =>
      row.description.toLowerCase().includes(p.name.toLowerCase()) ||
      (row.promocode && p.name.toLowerCase().includes(row.promocode.toLowerCase())),
  );
  if (partnerHit) {
    return {
      partner_name: partnerHit.name,
      category: partnerHit.category,
      venue: "Not specified",
    };
  }
  return { partner_name: null, category: "Unmapped", venue: "Not specified" };
}

export function parsePromoExportCsv(text: string): PromoExportRow[] {
  const rows = parseCsv(text);
  return rows
    .map((row) => {
      const company = pick(row, "company_name", "company");
      return {
        promocode_id: pick(row, "promocode_id", "promo_code_id", "id"),
        promocode: pick(row, "promocode", "promo_code", "code"),
        description: stripHtmlDescription(pick(row, "description", "desc")),
        company_name: company === "" || company.toUpperCase() === "NULL" ? null : company,
        period_week: pick(row, "period_week", "week", "iso_week") || null,
        period_month: pick(row, "period_month", "month") || null,
        times_used: num(pick(row, "times_used", "redemptions", "uses")),
        booking_lines: num(pick(row, "booking_lines", "lines")),
        tickets: num(pick(row, "tickets")),
        total_discount: num(pick(row, "total_discount", "discount", "saving_qar")),
      } satisfies PromoExportRow;
    })
    .filter((r) => r.promocode || r.promocode_id);
}

export function detectImportPeriod(
  rows: PromoExportRow[],
  kind: ImportKind,
): { period: string | null; ambiguous: boolean } {
  if (kind === "week") {
    const weeks = [
      ...new Set(
        rows
          .map((r) => normalizeIsoWeek(r.period_week ?? ""))
          .filter((w): w is string => Boolean(w)),
      ),
    ];
    return { period: weeks[0] ?? null, ambiguous: weeks.length > 1 };
  }
  const months = [
    ...new Set(
      rows
        .map((r) => normalizePeriodMonth(r.period_month ?? "") || normalizePeriodMonth(r.period_week ?? ""))
        .filter((m): m is string => Boolean(m)),
    ),
  ];
  return { period: months[0] ?? null, ambiguous: months.length > 1 };
}
