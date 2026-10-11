import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LinkedStaffIdentity = {
  jobTitle: string | null;
  staffRole: string | null;
  department: string | null;
};

/**
 * Job title and staff role on the newest non-deleted staff row linked to this login.
 * staff.user_id is not unique. Blank when there is no row.
 */
export async function loadLinkedStaffIdentity(userId: string): Promise<LinkedStaffIdentity> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("job_title, staff_role, department")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  const raw = row?.job_title;
  const title = typeof raw === "string" ? raw.trim() : "";
  const department = typeof row?.department === "string" ? row.department.trim() : "";
  return {
    jobTitle: title || null,
    staffRole: row?.staff_role ?? null,
    department: department || null,
  };
}

/** Job title on the newest non-deleted staff row linked to this login. */
export async function loadLinkedStaffJobTitle(userId: string): Promise<string | null> {
  return (await loadLinkedStaffIdentity(userId)).jobTitle;
}
