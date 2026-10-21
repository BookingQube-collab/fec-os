import "server-only";

import { cache } from "react";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  linkedStaffCacheTtlMs,
  shouldHealStaffUserId,
  type LinkedStaffMatchKind,
} from "@/lib/linked-staff-link";

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
  user_id?: string | null;
};

const STAFF_SELECT =
  "id, job_title, staff_role, department, status, employment_type, employee_code, full_name, user_id";

/** Warm-instance reuse across server actions (React cache is per-request only). */
const processCache = new Map<string, { at: number; row: LinkedStaffRecord | null }>();
const processInflight = new Map<string, Promise<LinkedStaffRecord | null>>();

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

/** Write staff.user_id when a stable fallback found the row — heals My Day RLS paths. */
function healStaffUserId(staffId: string, userId: string, currentUserId: string | null | undefined) {
  if (currentUserId === userId) return;
  void supabaseAdmin
    .from("staff")
    .update({ user_id: userId })
    .eq("id", staffId)
    .then(({ error }) => {
      if (error) console.warn("[linked-staff] user_id heal failed", error.message);
    });
}

function acceptMatch(
  row: StaffRow,
  userId: string,
  match: LinkedStaffMatchKind,
): LinkedStaffRecord {
  if (shouldHealStaffUserId(match)) {
    healStaffUserId(String(row.id), userId, row.user_id);
  }
  return mapStaffRow(row);
}

async function lookupLinkedStaffRecord(userId: string): Promise<LinkedStaffRecord | null> {
  const byUser = await supabaseAdmin
    .from("staff")
    .select(STAFF_SELECT)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1);
  if (byUser.error) throw new Error(byUser.error.message);
  if (byUser.data?.[0]?.id) return acceptMatch(byUser.data[0] as StaffRow, userId, "user_id");

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
    if (byEmail.data?.[0]?.id) return acceptMatch(byEmail.data[0] as StaffRow, userId, "email");
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
    if (byEmployeeCode.data?.[0]?.id) {
      return acceptMatch(byEmployeeCode.data[0] as StaffRow, userId, "employee_code");
    }

    const byQid = await supabaseAdmin
      .from("staff")
      .select(STAFF_SELECT)
      .eq("qid", code)
      .is("deleted_at", null)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1);
    if (byQid.error) throw new Error(byQid.error.message);
    if (byQid.data?.[0]?.id) return acceptMatch(byQid.data[0] as StaffRow, userId, "qid");
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
      return acceptMatch(byName.data[0] as StaffRow, userId, "name");
    }
  }

  return null;
}

/**
 * Newest non-deleted staff row for this login.
 * Prefer staff.user_id. When that is missing (test login desynced from the
 * live staff row — e.g. mary.supervisor@fec.test vs srsupervisor@fec.qa),
 * fall back through auth email, profile employee_code/qid, then unique name.
 *
 * Request-scoped via React cache(); process TTL reuses hits across actions on a
 * warm instance (authorize + session + inbox). Misses are not retained.
 */
export const loadLinkedStaffRecord = cache(async (userId: string): Promise<LinkedStaffRecord | null> => {
  const hit = processCache.get(userId);
  if (hit) {
    const ttl = linkedStaffCacheTtlMs(hit.row != null);
    if (ttl > 0 && Date.now() - hit.at < ttl) {
      return hit.row;
    }
  }

  const existing = processInflight.get(userId);
  if (existing) return existing;

  const task = lookupLinkedStaffRecord(userId)
    .then((row) => {
      if (row) {
        processCache.set(userId, { at: Date.now(), row });
      } else {
        processCache.delete(userId);
      }
      return row;
    })
    .finally(() => {
      processInflight.delete(userId);
    });
  processInflight.set(userId, task);
  return task;
});

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

/** Linked staff id for self-service My Day paths. Null when unlinked. */
export async function loadLinkedStaffId(userId: string): Promise<string | null> {
  return (await loadLinkedStaffRecord(userId))?.id ?? null;
}
