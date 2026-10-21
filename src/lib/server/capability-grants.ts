import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  setActiveCapabilityGrants,
  toGrantMap,
  type CapabilityGrantMap,
  type CapabilityGrantRow,
} from "@/lib/rbac-grants";

let cachedMap: CapabilityGrantMap | null = null;
let cachedRows: CapabilityGrantRow[] | null = null;
let cachedAt = 0;
let inflight: Promise<CapabilityGrantRow[]> | null = null;

/**
 * Grants change only on the admin Roles page. Warm serverless instances should
 * reuse rows for minutes — every requireCapability used to re-hit PostgREST
 * after a 15s TTL and dominated API Gateway volume.
 */
const TTL_MS = 5 * 60_000;

export function invalidateServerCapabilityGrantsCache(): void {
  cachedMap = null;
  cachedRows = null;
  cachedAt = 0;
  inflight = null;
}

async function fetchCapabilityGrants(
  supabase: SupabaseClient = supabaseAdmin,
): Promise<CapabilityGrantRow[]> {
  const { data, error } = await supabase
    .from("role_capability_grants")
    .select("role, capability, allowed");
  if (error) throw error;
  return (data ?? []) as CapabilityGrantRow[];
}

function installRows(rows: CapabilityGrantRow[]): CapabilityGrantMap {
  const map = toGrantMap(rows);
  cachedRows = rows;
  cachedMap = map;
  cachedAt = Date.now();
  setActiveCapabilityGrants(map);
  return map;
}

async function loadFreshRows(supabase: SupabaseClient): Promise<CapabilityGrantRow[]> {
  if (inflight) return inflight;
  inflight = fetchCapabilityGrants(supabase).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Load (or reuse) grant overrides and install them for sync canUserDo. */
export async function ensureServerCapabilityGrants(
  supabase: SupabaseClient = supabaseAdmin,
): Promise<CapabilityGrantMap> {
  if (cachedMap && cachedRows && Date.now() - cachedAt < TTL_MS) {
    setActiveCapabilityGrants(cachedMap);
    return cachedMap;
  }
  const rows = await loadFreshRows(supabase);
  return installRows(rows);
}

/** Rows for session / admin UI — shares the same process cache as authorize. */
export async function loadCapabilityGrantRows(
  supabase: SupabaseClient = supabaseAdmin,
): Promise<CapabilityGrantRow[]> {
  if (cachedRows && Date.now() - cachedAt < TTL_MS) {
    return cachedRows;
  }
  await ensureServerCapabilityGrants(supabase);
  return cachedRows ?? [];
}
