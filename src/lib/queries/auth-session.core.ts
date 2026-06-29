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

/** Loads profile + role assignments for the authenticated user. */
export async function fetchAuthSession(context: AuthContext): Promise<AuthSessionPayload> {
  const [{ data: profile, error: profileErr }, { data: rolesData, error: rolesErr }] =
    await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, display_name, employee_code, preferred_language, avatar_url")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("user_roles")
        .select("role, role_level, location_ids")
        .eq("user_id", context.userId),
    ]);

  if (profileErr) throw profileErr;
  if (rolesErr) throw rolesErr;

  const email = typeof context.claims.email === "string" ? context.claims.email : null;
  return {
    user: { id: context.userId, email },
    profile: profile ?? null,
    roles: (rolesData ?? []) as RoleAssignment[],
  };
}
