import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { ArcadeListHide } from "@/lib/arcade/domain";

type Client = SupabaseClient<Database>;

export const ARCADE_LIST_HIDE_UNAVAILABLE =
  "Removing a location from the list is not available until the database update is applied.";

export function isMissingHideTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const code = error.code ?? "";
  const message = error.message ?? "";
  return code === "42P01" || code === "PGRST205" || /arcade_list_hides/i.test(message);
}

/** Saved display hides. A missing table means nothing is hidden yet. */
export async function readArcadeListHides(supabase: Client): Promise<ArcadeListHide[]> {
  const { data, error } = await supabase.from("arcade_list_hides").select("location_id, machine_id");
  if (error) {
    if (isMissingHideTable(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    locationId: row.location_id,
    machineId: row.machine_id,
  }));
}
