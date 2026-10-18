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
  employeeCode: string | null;
  fullName: string | null;
};

type StaffRow = {
  id: string;
  job_title: string | null;
  staff_role: string | null;
  department: string | null;
  status: string | null;
  employment_type: string | null;
  employee_code: string | null;
  full_name: string | null;
};

const STAFF_SELECT =
  "id, job_title, staff_role, department, status, employment_type, employee_code, full_name";

function mapStaffRow(row: StaffRow): LinkedStaffRecord {
  const raw = row.job_title;
  const title = typeof raw === "string" ? raw.trim() : "";
  const department = typeof row.department === "string" ? row.department.trim() : "";
  const employeeCode = typeof row.employee_code === "string" ? row.employee_code.trim() : "";
  const fullName = typeof row.full_name === "string" ? row.full_name.trim() : "";
  return {
    id: String(row.id),
    jobTitle: title || null,
    staffRole: row.staff_role ?? null,
    department: department || null,
    status: row.status ?? null,
    employmentType: row.employment_type ?? null,
    employeeCode: employeeCode || null,
    fullName: fullName || null,
  };
}

/**
 * Newest non-deleted staff row for this login.
 * Prefer staff.user_id. When that is missing (test login desynced from the
 * live staff row — e.g. mary.supervisor@fec.test vs srsupervisor@fec.qa),
 * fall back through auth email, profile employee_code/qid, then unique name.
 */
export async function loadLinkedStaffRecord(userId: string): Promise<LinkedStaffRecord | null> {
  const byUser = await supabaseAdmin
    .from("staff")
    .select(STAFF_SELECT)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1);
  if (byUser.error) throw new Error(byUser.error.message);
  if (byUser.data?.[0]?.id) return mapStaffRow(byUser.data[0] as StaffRow);

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authErr) {
    console.warn("[linked-staff] auth.admin.getUserById failed", authErr.message);
  }
  const email = (authData?.user?.email ?? "").trim().toLowerCase();
  if (email) {
    const byEmail = await supabaseAdmin
      .from("staff")
      .select(STAFF_SELECT)
      .ilike("email", email)
      .is("deleted_at", null)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1);
    if (byEmail.error) throw new Error(byEmail.error.message);
    if (byEmail.data?.[0]?.id) return mapStaffRow(byEmail.data[0] as StaffRow);
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("employee_code, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);

  const code = (profile?.employee_code ?? "").trim();
  if (code) {
    const byEmployeeCode = await supabaseAdmin
      .from("staff")
      .select(STAFF_SELECT)
      .eq("employee_code", code)
      .is("deleted_at", null)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1);
    if (byEmployeeCode.error) throw new Error(byEmployeeCode.error.message);
    if (byEmployeeCode.data?.[0]?.id) return mapStaffRow(byEmployeeCode.data[0] as StaffRow);

    const byQid = await supabaseAdmin
      .from("staff")
      .select(STAFF_SELECT)
      .eq("qid", code)
      .is("deleted_at", null)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1);
    if (byQid.error) throw new Error(byQid.error.message);
    if (byQid.data?.[0]?.id) return mapStaffRow(byQid.data[0] as StaffRow);
  }

  const displayName = (profile?.display_name ?? "").trim();
  if (displayName) {
    const byName = await supabaseAdmin
      .from("staff")
      .select(STAFF_SELECT)
      .eq("full_name", displayName)
      .is("deleted_at", null)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(2);
    if (byName.error) throw new Error(byName.error.message);
    // Only use a unique full-name hit so we never attach the wrong person.
    if ((byName.data?.length ?? 0) === 1 && byName.data?.[0]?.id) {
      return mapStaffRow(byName.data[0] as StaffRow);
    }
  }

  return null;
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
