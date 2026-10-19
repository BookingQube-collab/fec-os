import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import type { AuthContext } from "@/lib/server/auth";
import type { RoleAssignment } from "@/lib/rbac";
import { loadReportsToHeadOfOperations } from "@/lib/site-ops-access.server";

export interface AuthSessionPayload {
  user: { id: string; email: string | null };
  profile: {
    id: string;
    display_name: string | null;
    employee_code: string | null;
    preferred_language: string | null;
    avatar_url: string | null;
    job_title: string | null;
    staff_role: string | null;
    department: string | null;
    /** Linked staff row id (Mia / People-admin identity). */
    staff_id: string | null;
    /** Direct report of Head of Operations on the ops chart. Used for shift-roster UI. */
    reports_to_head_of_operations: boolean;
  } | null;
  roles: RoleAssignment[];
}

type ProfileRow = AuthSessionPayload["profile"];

/**
 * Prefer service-role reads (same as getUserRoles). Cookie-scoped PostgREST
 * sometimes returns zero rows under RLS even when auth.uid() matches — that
 * surfaces as "Access pending" while capability APIs still work.
 */
async function loadProfileAndRoles(
  userClient: SupabaseClient,
  userId: string,
): Promise<{ profile: ProfileRow; roles: RoleAssignment[] }> {
  try {
    const [{ data: profile, error: profileErr }, { data: rolesData, error: rolesErr }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, display_name, employee_code, preferred_language, avatar_url")
          .eq("id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("user_roles")
          .select("role, role_level, location_ids")
          .eq("user_id", userId),
      ]);
    if (!profileErr && !rolesErr) {
      return {
        profile: (profile as ProfileRow) ?? null,
        roles: (rolesData ?? []) as RoleAssignment[],
      };
    }
  } catch {
    /* service role missing — fall back to the user-scoped client */
  }

  const [{ data: profile, error: profileErr }, { data: rolesData, error: rolesErr }] =
    await Promise.all([
      userClient
        .from("profiles")
        .select("id, display_name, employee_code, preferred_language, avatar_url")
        .eq("id", userId)
        .maybeSingle(),
      userClient
        .from("user_roles")
        .select("role, role_level, location_ids")
        .eq("user_id", userId),
    ]);

  if (profileErr) throw profileErr;
  if (rolesErr) throw rolesErr;

  return {
    profile: (profile as ProfileRow) ?? null,
    roles: (rolesData ?? []) as RoleAssignment[],
  };
}

/** Loads profile + role assignments for the authenticated user. */
export async function fetchAuthSession(context: AuthContext): Promise<AuthSessionPayload> {
  const email = typeof context.claims.email === "string" ? context.claims.email : null;
  // Job title does not depend on the profile row. Run it with the role lookup so
  // the shell gate is not stuck behind a second staff round trip.
  const [{ profile, roles }, linked, reportsToHeadOfOperations] = await Promise.all([
    loadProfileAndRoles(context.supabase, context.userId),
    loadLinkedStaffRecord(context.userId).catch((error: unknown) => {
      console.warn("[auth/session] staff job title lookup failed", error);
      return null;
    }),
    loadReportsToHeadOfOperations(context.userId).catch((error: unknown) => {
      console.warn("[auth/session] HoO reporting lookup failed", error);
      return false;
    }),
  ]);
  const employeeCode = linked?.employeeCode ?? profile?.employee_code ?? null;
  return {
    user: { id: context.userId, email },
    profile: profile
      ? {
          ...profile,
          employee_code: employeeCode,
          job_title: linked?.jobTitle ?? null,
          staff_role: linked?.staffRole ?? null,
          department: linked?.department ?? null,
          staff_id: linked?.id ?? null,
          reports_to_head_of_operations: reportsToHeadOfOperations,
        }
      : null,
    roles,
  };
}
