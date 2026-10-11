import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cookies } from "next/headers";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canActorPerform } from "@/lib/arcade/access";
import { loadLinkedStaffIdentity } from "@/lib/linked-staff-job-title.server";
import type { AppRole, Capability } from "@/lib/rbac";
import { createTimer } from "@/lib/performance/timer";
import { updateAuthRolesCache } from "./auth";
import type { AuthContext } from "./auth";
import { ensureServerCapabilityGrants } from "./capability-grants";
import { writeRolesCookie } from "./roles-cookie";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getUserRoles(
  supabase: SupabaseClient,
  userId: string,
): Promise<AppRole[]> {
  const inflightKey = `roles:${userId}`;
  const existing = rolesInflight.get(inflightKey);
  if (existing) return existing;

  const task = (async () => {
    const timer = createTimer("getUserRoles", "user_roles.select");
    try {
      const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (!error) {
        const roles = (data ?? []).map((r) => r.role as AppRole);
        timer.end({ rowCount: roles.length });
        return roles;
      }
    } catch {
      /* service role missing — fall back to the user-scoped client */
    }
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) {
      timer.end({ error: error.message });
      throw error;
    }
    const roles = (data ?? []).map((r) => r.role as AppRole);
    timer.end({ rowCount: roles.length });
    return roles;
  })();

  rolesInflight.set(inflightKey, task);
  try {
    return await task;
  } finally {
    rolesInflight.delete(inflightKey);
  }
}

const rolesInflight = new Map<string, Promise<AppRole[]>>();

async function ensureUserRoles(context: AuthContext): Promise<AppRole[]> {
  if (context.roles) return context.roles;
  context.roles = await getUserRoles(context.supabase, context.userId);
  updateAuthRolesCache(context.userId, context.roles);
  try {
    writeRolesCookie(await cookies(), context.userId, context.roles);
  } catch {
    /* cookie writes from Server Components are ignored */
  }
  return context.roles;
}

async function ensureStaffAccess(context: AuthContext) {
  if (context.access) return context.access;
  try {
    const identity = await loadLinkedStaffIdentity(context.userId);
    context.access = {
      jobTitle: identity.jobTitle,
      staffRole: identity.staffRole,
      department: identity.department,
    };
  } catch {
    context.access = { jobTitle: null, staffRole: null, department: null };
  }
  return context.access;
}

export async function requireCapability(
  context: AuthContext,
  capability: Capability,
): Promise<AppRole[]> {
  const roles = await ensureUserRoles(context);
  if (roles.length === 0) {
    throw new ForbiddenError("No role assigned. Contact an administrator.");
  }
  await ensureServerCapabilityGrants();
  const access = await ensureStaffAccess(context);
  if (!canActorPerform(roles, capability, access)) {
    throw new ForbiddenError(`Forbidden: missing capability ${capability}`);
  }
  return roles;
}

export async function requireAnyCapability(
  context: AuthContext,
  capabilities: Capability[],
): Promise<AppRole[]> {
  const roles = await ensureUserRoles(context);
  if (roles.length === 0) {
    throw new ForbiddenError("No role assigned. Contact an administrator.");
  }
  await ensureServerCapabilityGrants();
  const access = await ensureStaffAccess(context);
  const allowed = capabilities.some((c) => canActorPerform(roles, c, access));
  if (!allowed) {
    throw new ForbiddenError("Forbidden: insufficient permissions");
  }
  return roles;
}

export async function requireRoleLevel(
  context: AuthContext,
  minLevel: number,
): Promise<number> {
  const { data, error } = await context.supabase.rpc("current_user_role_level");
  if (error) throw error;
  const level = typeof data === "number" ? data : 0;
  if (level < minLevel) {
    throw new ForbiddenError("Forbidden: insufficient role level");
  }
  return level;
}

export async function assertLocationAccess(
  context: AuthContext,
  locationId: string,
): Promise<void> {
  const { data, error } = await context.supabase.rpc("user_can_access_location", {
    _location_id: locationId,
  });
  if (error) throw error;
  if (!data) throw new ForbiddenError("Forbidden: cannot access this branch");
}

/** Arcade Technical branch check. F&B managers fail. Head of Operations passes every branch. */
export async function assertArcadeLocationAccess(
  context: AuthContext,
  locationId: string,
): Promise<void> {
  const { data, error } = await context.supabase.rpc("user_can_read_arcade", {
    _location_id: locationId,
  });
  if (error) {
    await assertLocationAccess(context, locationId);
    return;
  }
  if (!data) throw new ForbiddenError("Forbidden: cannot access this branch");
}

export async function requireRolesAssigned(context: AuthContext): Promise<AppRole[]> {
  const roles = await ensureUserRoles(context);
  if (roles.length === 0) {
    throw new ForbiddenError("No role assigned. Contact an administrator.");
  }
  return roles;
}
