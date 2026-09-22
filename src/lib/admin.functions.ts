"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ROLE_LEVELS, codeDefaultAllowed, CAPABILITIES, type AppRole, type Capability } from "@/lib/rbac";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";
import {
  ensureServerCapabilityGrants,
  invalidateServerCapabilityGrantsCache,
} from "@/lib/server/capability-grants";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RoleEnum = z.enum([
  "ceo",
  "coo",
  "cfo",
  "regional_ops",
  "branch_gm",
  "duty_manager",
  "tech_supervisor",
  "technician",
  "cashier_host",
  "auditor",
  "hr",
  "customer_service",
]);

async function requireExec(supabase: SupabaseClient, minLevel = 95) {
  const { data } = await supabase.rpc("current_user_role_level");
  const level = typeof data === "number" ? data : 0;
  if (level < minLevel) throw new Error("Forbidden: insufficient role level");
}

export const listUsersWithRoles = createAuthenticatedActionNoInput(
  async (context) => {
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
  },
  { auth: { capability: "admin.view" } },
);

export const grantRole = createAuthenticatedAction(
  z.object({
    user_id: z.string().uuid(),
    role: RoleEnum,
    location_ids: z.array(z.string().uuid()).default([]),
  }),
  async (data, context) => {
    await requireExec(context.supabase, 95);
    const role = data.role as AppRole;
    const role_level = ROLE_LEVELS[role];
    const { error } = await supabaseAdmin.from("user_roles").upsert(
      {
        user_id: data.user_id,
        role,
        role_level,
        location_ids: data.location_ids,
      },
      { onConflict: "user_id,role" },
    );
    if (error) throw error;
    await context.supabase.rpc("log_audit", {
      _action: "admin.role_granted",
      _table_name: "user_roles",
      _row_id: data.user_id,
      _after: { role, role_level, location_ids: data.location_ids },
      _metadata: {},
    });
    return { ok: true };
  },
  { auth: { capability: "admin.manage_roles" } },
);

export const revokeRole = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    await requireExec(context.supabase, 95);
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "admin.manage_roles" } },
);

const CapabilityKey = z.string().min(1).max(120);

export const listCapabilityGrants = createAuthenticatedActionNoInput(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("role_capability_grants")
      .select("role, capability, allowed");
    if (error) throw error;
    return (data ?? []) as Array<{ role: AppRole; capability: string; allowed: boolean }>;
  },
  { auth: { requireRole: true } },
);

export const setRoleCapabilityGrant = createAuthenticatedAction(
  z.object({
    role: RoleEnum,
    capability: CapabilityKey,
    allowed: z.boolean(),
  }),
  async (data, context) => {
    const role = data.role as AppRole;
    const capability = data.capability as Capability;

    if (!(capability in CAPABILITIES)) {
      throw new Error(`Unknown capability: ${data.capability}`);
    }

    // Prevent locking every CEO out of role management.
    if (role === "ceo" && capability === "admin.manage_roles" && data.allowed === false) {
      throw new Error("Cannot revoke admin.manage_roles from CEO");
    }

    const matchesDefault = codeDefaultAllowed(role, capability) === data.allowed;

    if (matchesDefault) {
      const { error } = await supabaseAdmin
        .from("role_capability_grants")
        .delete()
        .eq("role", role)
        .eq("capability", capability);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("role_capability_grants").upsert(
        {
          role,
          capability,
          allowed: data.allowed,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        },
        { onConflict: "role,capability" },
      );
      if (error) throw error;
    }

    invalidateServerCapabilityGrantsCache();
    await ensureServerCapabilityGrants();

    await context.supabase.rpc("log_audit", {
      _action: "admin.capability_grant_set",
      _table_name: "role_capability_grants",
      _row_id: null,
      _after: { role, capability, allowed: data.allowed, reset_to_default: matchesDefault },
      _metadata: {},
    });

    return { ok: true as const, resetToDefault: matchesDefault };
  },
  { auth: { capability: "admin.manage_roles" } },
);

export const provisionUser = createAuthenticatedAction(
  z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    display_name: z.string().min(1).max(200),
    employee_code: z.string().max(50).optional(),
    role: RoleEnum,
    location_ids: z.array(z.string().uuid()).default([]),
  }),
  async (data, context) => {
    await requireExec(context.supabase, 95);
    const role = data.role as AppRole;
    const role_level = ROLE_LEVELS[role];

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name },
    });
    if (createErr) throw createErr;
    if (!created.user) throw new Error("User creation failed");

    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      display_name: data.display_name,
      employee_code: data.employee_code ?? null,
    });
    if (profileErr) throw profileErr;

    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: created.user.id,
      role,
      role_level,
      location_ids: data.location_ids,
    });
    if (roleErr) throw roleErr;

    await context.supabase.rpc("log_audit", {
      _action: "admin.user_provisioned",
      _table_name: "profiles",
      _row_id: created.user.id,
      _after: { email: data.email, role, role_level },
      _metadata: {},
    });

    return { ok: true, user_id: created.user.id };
  },
  { auth: { capability: "admin.provision_users" } },
);
