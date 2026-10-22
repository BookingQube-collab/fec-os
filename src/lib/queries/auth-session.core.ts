import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import { resolveSessionAvatarUrl } from "@/lib/profile-avatar";
import type { CapabilityGrantRow } from "@/lib/rbac-grants";
import type { AuthContext } from "@/lib/server/auth";
import { loadCapabilityGrantRows } from "@/lib/server/capability-grants";
import type { RoleAssignment } from "@/lib/rbac";
import { loadReportsToHeadOfOperations } from "@/lib/site-ops-access.server";
import { staffPhotoUrl } from "@/lib/staff-photo";

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
  /** DB capability overrides — bundled so AuthProvider skips a second grants fetch. */
  capabilityGrants: CapabilityGrantRow[];
}

type ProfileDbRow = {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  preferred_language: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

/**
 * Prefer service-role reads (same as getUserRoles). Cookie-scoped PostgREST
 * sometimes returns zero rows under RLS even when auth.uid() matches — that
 * surfaces as "Access pending" while capability APIs still work.
 */
async function loadProfileAndRoles(
  userClient: SupabaseClient,
  userId: string,
): Promise<{ profile: ProfileDbRow | null; roles: RoleAssignment[] }> {
  try {
    const [{ data: profile, error: profileErr }, { data: rolesData, error: rolesErr }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, display_name, employee_code, preferred_language, avatar_url, updated_at")
          .eq("id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("user_roles")
          .select("role, role_level, location_ids")
          .eq("user_id", userId),
      ]);
    if (!profileErr && !rolesErr) {
      return {
        profile: (profile as ProfileDbRow) ?? null,
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
        .select("id, display_name, employee_code, preferred_language, avatar_url, updated_at")
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
    profile: (profile as ProfileDbRow) ?? null,
    roles: (rolesData ?? []) as RoleAssignment[],
  };
}

async function loadStaffPhotoFallback(staffId: string | null | undefined): Promise<string | null> {
  if (!staffId) return null;
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("photo_updated_at")
    .eq("id", staffId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data?.photo_updated_at) return null;
  return staffPhotoUrl(staffId, data.photo_updated_at);
}

/** Loads profile + role assignments for the authenticated user. */
export async function fetchAuthSession(context: AuthContext): Promise<AuthSessionPayload> {
  const email = typeof context.claims.email === "string" ? context.claims.email : null;
  // Job title does not depend on the profile row. Run it with the role lookup so
  // the shell gate is not stuck behind a second staff round trip. Grants share
  // the process cache used by requireCapability.
  const [{ profile, roles }, linked, reportsToHeadOfOperations, capabilityGrants] = await Promise.all([
    loadProfileAndRoles(context.supabase, context.userId),
    loadLinkedStaffRecord(context.userId).catch((error: unknown) => {
      console.warn("[auth/session] staff job title lookup failed", error);
      return null;
    }),
    loadReportsToHeadOfOperations(context.userId).catch((error: unknown) => {
      console.warn("[auth/session] HoO reporting lookup failed", error);
      return false;
    }),
    loadCapabilityGrantRows().catch((error: unknown) => {
      console.warn("[auth/session] capability grants lookup failed", error);
      return [] as CapabilityGrantRow[];
    }),
  ]);
  const employeeCode = linked?.employeeCode ?? profile?.employee_code ?? null;
  // Only hit staff photos when the profile has no avatar of its own.
  const staffPhotoFallback = profile?.avatar_url?.trim()
    ? null
    : await loadStaffPhotoFallback(linked?.id).catch(() => null);
  // Never return a multi-hundred-KB data URL in session JSON — topbar uses a short img src.
  const avatarUrl = resolveSessionAvatarUrl(
    profile?.avatar_url,
    profile?.updated_at,
    staffPhotoFallback,
  );
  return {
    user: { id: context.userId, email },
    profile: profile
      ? {
          id: profile.id,
          display_name: profile.display_name,
          employee_code: employeeCode,
          preferred_language: profile.preferred_language,
          avatar_url: avatarUrl,
          job_title: linked?.jobTitle ?? null,
          staff_role: linked?.staffRole ?? null,
          department: linked?.department ?? null,
          staff_id: linked?.id ?? null,
          reports_to_head_of_operations: reportsToHeadOfOperations,
        }
      : null,
    roles,
    capabilityGrants,
  };
}
