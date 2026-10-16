import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LinkedStaffIdentity = {
  jobTitle: string | null;
  staffRole: string | null;
  department: string | null;
};

export type LinkedStaffRecord = LinkedStaffIdentity & {
  id: string;
  status: string | null;
  employmentType: string | null;
};

/**
 * Newest non-deleted staff row for this login.
 * staff.user_id is not unique — never use maybeSingle on it.
 */
export async function loadLinkedStaffRecord(userId: string): Promise<LinkedStaffRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, job_title, staff_role, department, status, employment_type")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row?.id) return null;
  const raw = row.job_title;
  const title = typeof raw === "string" ? raw.trim() : "";
  const department = typeof row.department === "string" ? row.department.trim() : "";
  return {
    id: String(row.id),
    jobTitle: title || null,
    staffRole: row.staff_role ?? null,
    department: department || null,
    status: row.status ?? null,
    employmentType: row.employment_type ?? null,
  };
}

/**
 * Job title and staff role on the newest non-deleted staff row linked to this login.
 * staff.user_id is not unique. Blank when there is no row.
 */
export async function loadLinkedStaffIdentity(userId: string): Promise<LinkedStaffIdentity> {
  const row = await loadLinkedStaffRecord(userId);
  if (!row) {
    return { jobTitle: null, staffRole: null, department: null };
  }
  return {
    jobTitle: row.jobTitle,
    staffRole: row.staffRole,
    department: row.department,
  };
}

/** Job title on the newest non-deleted staff row linked to this login. */
export async function loadLinkedStaffJobTitle(userId: string): Promise<string | null> {
  return (await loadLinkedStaffIdentity(userId)).jobTitle;
}
