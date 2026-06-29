import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { canUserDo, type AppRole, type Capability } from "@/lib/rbac";
import { createTimer } from "@/lib/performance/timer";
import { updateAuthRolesCache } from "./auth";
import type { AuthContext } from "./auth";

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
  return context.roles;
}

export async function requireCapability(
  context: AuthContext,
  capability: Capability,
): Promise<AppRole[]> {
  const roles = await ensureUserRoles(context);
  if (roles.length === 0) {
    throw new ForbiddenError("No role assigned. Contact an administrator.");
  }
  if (!canUserDo(roles, capability)) {
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
  const allowed = capabilities.some((c) => canUserDo(roles, c));
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

export async function requireRolesAssigned(context: AuthContext): Promise<AppRole[]> {
  const roles = await ensureUserRoles(context);
  if (roles.length === 0) {
    throw new ForbiddenError("No role assigned. Contact an administrator.");
  }
  return roles;
}
