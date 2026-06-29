/**
 * BookingQube revenue API adapter for FEC Qatar branches.
 * Configure BOOKINGQUBE_API_URL + BOOKINGQUBE_API_KEY in .env.local.
 * See docs/BOOKINGQUBE.md for store ID mapping and expected API shape.
 */

import { BRANCH_CODES } from "@/lib/staff-import";

export const QATAR_TZ = "Asia/Qatar";
export const BOOKINGQUBE_CURRENCY = "QAR" as const;

export type FecBranchCode = (typeof BRANCH_CODES)[number];

export interface BookingQubeStoreMapping {
  fecCode: FecBranchCode;
  /** BookingQube store / outlet identifier */
  storeId: string;
  storeName: string;
}

export interface BookingQubeDailyRevenue {
  store_id: string;
  store_name: string;
  date: string;
  revenue: number;
  currency: string;
}

export interface BookingQubeRevenueResponse {
  stores: BookingQubeDailyRevenue[];
}

/** Env var suffix per FEC branch code, e.g. BOOKINGQUBE_STORE_KDS_CC */
const STORE_ENV_KEYS: Record<FecBranchCode, string> = {
  "KDS-CC": "BOOKINGQUBE_STORE_KDS_CC",
  "KDS-DM": "BOOKINGQUBE_STORE_KDS_DM",
  "INF-CC": "BOOKINGQUBE_STORE_INF_CC",
  "UA-DM": "BOOKINGQUBE_STORE_UA_DM",
  "CB-VM": "BOOKINGQUBE_STORE_CB_VM",
  "CB-DSM": "BOOKINGQUBE_STORE_CB_DSM",
  "CAR-AP": "BOOKINGQUBE_STORE_CAR_AP",
};

const DEFAULT_STORE_IDS: Record<FecBranchCode, string> = {
  "KDS-CC": "kds-cc",
  "KDS-DM": "kds-dm",
  "INF-CC": "inf-cc",
  "UA-DM": "ua-dm",
  "CB-VM": "cb-vm",
  "CB-DSM": "cb-dsm",
  "CAR-AP": "car-ap",
};

const STORE_NAMES: Record<FecBranchCode, string> = {
  "KDS-CC": "Kids Driving School — City Center",
  "KDS-DM": "Kids Driving School Mini — Doha Mall",
  "INF-CC": "Inflatapark — City Center",
  "UA-DM": "Urban Arena — Doha Mall",
  "CB-VM": "Crayons & Bricks — Vendome",
  "CB-DSM": "Crayons & Bricks — Dar Al Salam",
  "CAR-AP": "Carousel — Aspire Park",
};

/** Approximate daily base revenue (QAR) for mock mode — mirrors demo seed ratios. */
const MOCK_BASE_REVENUE: Record<FecBranchCode, number> = {
  "KDS-CC": 14500,
  "KDS-DM": 7200,
  "INF-CC": 11200,
  "UA-DM": 16800,
  "CB-VM": 9800,
  "CB-DSM": 8600,
  "CAR-AP": 12400,
};

export function todayInQatar(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: QATAR_TZ }).format(new Date());
}

export function monthStartInQatar(date?: string): string {
  const d = date ?? todayInQatar();
  return `${d.slice(0, 7)}-01`;
}

export function getStoreMappings(): BookingQubeStoreMapping[] {
  return BRANCH_CODES.map((fecCode) => ({
    fecCode,
    storeId: process.env[STORE_ENV_KEYS[fecCode]] ?? DEFAULT_STORE_IDS[fecCode],
    storeName: STORE_NAMES[fecCode],
  }));
}

export function fecCodeByStoreId(storeId: string, mappings = getStoreMappings()): FecBranchCode | null {
  const hit = mappings.find((m) => m.storeId === storeId);
  return hit?.fecCode ?? null;
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T12:00:00+03:00`).getUTCDay();
  return day === 5 || day === 6;
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T12:00:00+03:00`);
  const end = new Date(`${to}T12:00:00+03:00`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function mockHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** Deterministic mock daily revenue when API credentials are absent. */
export function generateMockRevenue(from: string, to: string): BookingQubeRevenueResponse {
  const mappings = getStoreMappings();
  const stores: BookingQubeDailyRevenue[] = [];

  for (const m of mappings) {
    const base = MOCK_BASE_REVENUE[m.fecCode];
    for (const date of dateRange(from, to)) {
      const weekend = isWeekend(date);
      const mult = weekend ? 1.35 : 1;
      const noise = 0.85 + mockHash(`${m.fecCode}:${date}`) * 0.3;
      stores.push({
        store_id: m.storeId,
        store_name: m.storeName,
        date,
        revenue: Math.round(base * mult * noise),
        currency: BOOKINGQUBE_CURRENCY,
      });
    }
  }

  return { stores };
}

function parseRevenueResponse(json: unknown): BookingQubeRevenueResponse {
  if (!json || typeof json !== "object") {
    throw new Error("BookingQube API returned invalid JSON");
  }
  const root = json as Record<string, unknown>;
  const rawStores = Array.isArray(root.stores)
    ? root.stores
    : Array.isArray(root.data)
      ? root.data
      : null;
  if (!rawStores) {
    throw new Error("BookingQube API response missing `stores` array");
  }

  const stores: BookingQubeDailyRevenue[] = rawStores.map((row, i) => {
    const r = row as Record<string, unknown>;
    const store_id = String(r.store_id ?? r.storeId ?? "");
    const date = String(r.date ?? r.period_start ?? "");
    const revenue = Number(r.revenue ?? r.amount ?? 0);
    if (!store_id || !date) {
      throw new Error(`BookingQube row ${i + 1}: store_id and date are required`);
    }
    return {
      store_id,
      store_name: String(r.store_name ?? r.storeName ?? store_id),
      date: date.slice(0, 10),
      revenue,
      currency: String(r.currency ?? BOOKINGQUBE_CURRENCY),
    };
  });

  return { stores };
}

export function shouldUseMockApi(): boolean {
  if (process.env.BOOKINGQUBE_USE_MOCK === "true") return true;
  if (process.env.BOOKINGQUBE_USE_MOCK === "false") return false;
  return !process.env.BOOKINGQUBE_API_URL || !process.env.BOOKINGQUBE_API_KEY;
}

/**
 * Fetch daily revenue per store for an inclusive date range (YYYY-MM-DD, Asia/Qatar).
 * Falls back to deterministic mock data when credentials are not configured.
 */
export async function fetchBookingQubeRevenue(
  from: string,
  to: string,
): Promise<{ stores: BookingQubeDailyRevenue[]; source: "api" | "mock" }> {
  if (shouldUseMockApi()) {
    return { ...generateMockRevenue(from, to), source: "mock" };
  }

  const baseUrl = process.env.BOOKINGQUBE_API_URL!.replace(/\/$/, "");
  const apiKey = process.env.BOOKINGQUBE_API_KEY!;
  const path = process.env.BOOKINGQUBE_REVENUE_PATH ?? "/revenue/daily";
  const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("currency", BOOKINGQUBE_CURRENCY);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const authStyle = process.env.BOOKINGQUBE_AUTH_STYLE ?? "bearer";
  if (authStyle === "header") {
    headers[process.env.BOOKINGQUBE_AUTH_HEADER ?? "X-API-Key"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const resp = await fetch(url.toString(), { headers, cache: "no-store" });
  if (!resp.ok) {
    const body = (await resp.text()).slice(0, 300);
    throw new Error(`BookingQube API error ${resp.status}: ${body}`);
  }

  const json = await resp.json();
  return { ...parseRevenueResponse(json), source: "api" };
}
