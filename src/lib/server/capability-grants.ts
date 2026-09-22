import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  setActiveCapabilityGrants,
  toGrantMap,
  type CapabilityGrantMap,
  type CapabilityGrantRow,
} from "@/lib/rbac-grants";
import type { AppRole } from "@/lib/rbac";

let cached: CapabilityGrantMap | null = null;
let cachedAt = 0;
/** ponytail: 15s TTL — upgrade to pub/sub invalidation if multi-instance drift hurts. */
const TTL_MS = 15_000;

export function invalidateServerCapabilityGrantsCache(): void {
  cached = null;
  cachedAt = 0;
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

/** Load (or reuse) grant overrides and install them for sync canUserDo. */
export async function ensureServerCapabilityGrants(
  supabase: SupabaseClient = supabaseAdmin,
): Promise<CapabilityGrantMap> {
  if (cached && Date.now() - cachedAt < TTL_MS) {
    setActiveCapabilityGrants(cached);
    return cached;
  }
  const rows = await fetchCapabilityGrants(supabase);
  const map = toGrantMap(rows);
  cached = map;
  cachedAt = Date.now();
  setActiveCapabilityGrants(map);
  return map;
}

export async function loadCapabilityGrantRows(
  supabase: SupabaseClient = supabaseAdmin,
): Promise<CapabilityGrantRow[]> {
  return fetchCapabilityGrants(supabase);
}
