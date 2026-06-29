import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AuthContext } from "@/lib/server/auth";

export async function fetchUsersWithRoles(context: AuthContext) {
  const { data: level } = await context.supabase.rpc("current_user_role_level");
  if ((level ?? 0) < 80) throw new Error("Forbidden: executive access required");

  const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, display_name, employee_code").order("display_name"),
    supabaseAdmin
      .from("user_roles")
      .select("id, user_id, role, role_level, location_ids")
      .order("role_level", { ascending: false }),
  ]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;
  return { profiles: profiles ?? [], roles: roles ?? [] };
}
