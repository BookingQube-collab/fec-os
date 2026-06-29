/**
 * Persists BookingQube daily revenue into financial_snapshots (period_kind = day).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  fecCodeByStoreId,
  fetchBookingQubeRevenue,
  getStoreMappings,
  monthStartInQatar,
  todayInQatar,
  type BookingQubeDailyRevenue,
} from "@/lib/integrations/bookingqube";

type Db = SupabaseClient<Database>;

export interface SyncBookingQubeOptions {
  from?: string;
  to?: string;
  actorId?: string | null;
  actorEmail?: string | null;
}

export interface SyncBookingQubeResult {
  ok: true;
  source: "api" | "mock";
  from: string;
  to: string;
  rows_upserted: number;
  rows_skipped: number;
  synced_at: string;
}

const ZERO_COSTS = {
  cogs: 0,
  labor: 0,
  rent: 0,
  utilities: 0,
  marketing: 0,
  other_opex: 0,
};

async function loadLocationIdsByCode(sb: Db): Promise<Map<string, string>> {
  const { data, error } = await sb.from("locations").select("id, code").eq("status", "active");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.code, r.id]));
}

async function loadExistingSnapshots(
  sb: Db,
  locationIds: string[],
  from: string,
  to: string,
): Promise<Map<string, Database["public"]["Tables"]["financial_snapshots"]["Row"]>> {
  if (!locationIds.length) return new Map();
  const { data, error } = await sb
    .from("financial_snapshots")
    .select("*")
    .eq("period_kind", "day")
    .in("location_id", locationIds)
    .gte("period_start", from)
    .lte("period_start", to);
  if (error) throw error;

  const map = new Map<string, Database["public"]["Tables"]["financial_snapshots"]["Row"]>();
  for (const row of data ?? []) {
    map.set(`${row.location_id}:${row.period_start}`, row);
  }
  return map;
}

function defaultSyncRange(opts: SyncBookingQubeOptions): { from: string; to: string } {
  const to = opts.to ?? todayInQatar();
  const from = opts.from ?? monthStartInQatar(to);
  return { from, to };
}

export async function syncBookingQubeRevenueToDb(
  sb: Db,
  opts: SyncBookingQubeOptions = {},
): Promise<SyncBookingQubeResult> {
  const { from, to } = defaultSyncRange(opts);
  const mappings = getStoreMappings();
  const locByCode = await loadLocationIdsByCode(sb);
  const { stores, source } = await fetchBookingQubeRevenue(from, to);

  const locationIds = [...locByCode.values()];
  const existing = await loadExistingSnapshots(sb, locationIds, from, to);

  const upserts: Database["public"]["Tables"]["financial_snapshots"]["Insert"][] = [];
  let rows_skipped = 0;

  for (const row of stores) {
    const payload = mapStoreRow(row, mappings, locByCode);
    if (!payload) {
      rows_skipped++;
      continue;
    }

    const key = `${payload.location_id}:${payload.period_start}`;
    const prev = existing.get(key);
    upserts.push({
      location_id: payload.location_id,
      period_kind: "day",
      period_start: payload.period_start,
      revenue: payload.revenue,
      cogs: prev?.cogs ?? ZERO_COSTS.cogs,
      labor: prev?.labor ?? ZERO_COSTS.labor,
      rent: prev?.rent ?? ZERO_COSTS.rent,
      utilities: prev?.utilities ?? ZERO_COSTS.utilities,
      marketing: prev?.marketing ?? ZERO_COSTS.marketing,
      other_opex: prev?.other_opex ?? ZERO_COSTS.other_opex,
      footfall: prev?.footfall ?? null,
    });
  }

  if (upserts.length) {
    const { error } = await sb.from("financial_snapshots").upsert(upserts, {
      onConflict: "location_id,period_kind,period_start",
    });
    if (error) throw error;
  }

  const synced_at = new Date().toISOString();
  await sb.from("audit_log").insert({
    actor_id: opts.actorId ?? null,
    actor_email: opts.actorEmail ?? null,
    action: "bookingqube.sync",
    table_name: "financial_snapshots",
    after: {
      source,
      from,
      to,
      rows_upserted: upserts.length,
      rows_skipped,
      synced_at,
    },
  });

  return {
    ok: true,
    source,
    from,
    to,
    rows_upserted: upserts.length,
    rows_skipped,
    synced_at,
  };
}

function mapStoreRow(
  row: BookingQubeDailyRevenue,
  mappings: ReturnType<typeof getStoreMappings>,
  locByCode: Map<string, string>,
): { location_id: string; period_start: string; revenue: number } | null {
  const fecCode = fecCodeByStoreId(row.store_id, mappings);
  if (!fecCode) return null;
  const location_id = locByCode.get(fecCode);
  if (!location_id) return null;
  if (!Number.isFinite(row.revenue)) return null;
  return {
    location_id,
    period_start: row.date.slice(0, 10),
    revenue: row.revenue,
  };
}
