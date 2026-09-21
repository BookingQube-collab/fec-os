import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AuthContext } from "@/lib/server/auth";
import type { RoleAssignment } from "@/lib/rbac";

export interface AuthSessionPayload {
  user: { id: string; email: string | null };
  profile: {
    id: string;
    display_name: string | null;
    employee_code: string | null;
    preferred_language: string | null;
    avatar_url: string | null;
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
  const { profile, roles } = await loadProfileAndRoles(context.supabase, context.userId);
  const email = typeof context.claims.email === "string" ? context.claims.email : null;
  return {
    user: { id: context.userId, email },
    profile,
    roles,
  };
}
