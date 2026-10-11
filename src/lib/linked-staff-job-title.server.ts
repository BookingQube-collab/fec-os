import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Job title on the newest non-deleted staff row linked to this login.
 * staff.user_id is not unique. Blank when there is no row or no title.
 */
export async function loadLinkedStaffJobTitle(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("job_title")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const raw = data?.[0]?.job_title;
  if (typeof raw !== "string") return null;
  const title = raw.trim();
  return title || null;
}
