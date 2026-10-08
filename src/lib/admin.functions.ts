"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ROLE_LEVELS, canUserDo, codeDefaultAllowed, CAPABILITIES, type AppRole, type Capability } from "@/lib/rbac";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  createSafeAuthenticatedAction,
} from "@/lib/server/create-action";
import {
  ensureServerCapabilityGrants,
  invalidateServerCapabilityGrantsCache,
} from "@/lib/server/capability-grants";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loginReportingTeam } from "@/lib/reporting-chain";
import { loadDirectReportStaffIds } from "@/lib/reporting-manager-access.server";
import { applyStoredTrainingRules } from "@/lib/training/execute-rules";
import {
  chooseStaffLoginEmail,
  parseStaffLoginEmail,
  resolveStaffLoginEmail,
  staffLoginCodeEmails,
  staffLoginEmailCandidates,
  STAFF_LOGIN_DEFAULT_PASSWORD,
  STAFF_LOGIN_PASSWORD_MAX,
  STAFF_LOGIN_PASSWORD_MIN,
  STAFF_LOGIN_ROLE,
} from "@/lib/staff-login";

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

/** Company-wide login creation stays with CEO and COO. A reporting manager may create one for a direct report. */
async function assertCanProvisionStaffLogin(
  context: { supabase: SupabaseClient; userId: string; roles?: AppRole[] },
  staffId: string,
) {
  const { data } = await context.supabase.rpc("current_user_role_level");
  const level = typeof data === "number" ? data : 0;
  if (level >= 95) {
    await ensureServerCapabilityGrants();
    if (!canUserDo(context.roles ?? [], "admin.provision_users")) {
      throw new Error("Forbidden: insufficient role level");
    }
    return;
  }
  const access = await loadDirectReportStaffIds(context.userId);
  if (!access.directReportStaffIds.includes(staffId)) {
    throw new Error("Forbidden: insufficient role level");
  }
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
    const { data: people, error: peopleErr } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("user_id", data.user_id)
      .is("deleted_at", null);
    if (peopleErr) throw peopleErr;
    for (const person of people ?? []) {
      await applyStoredTrainingRules(context, {
        trigger: "ROLE_CHANGE",
        staffId: person.id,
        roleCode: role,
      });
    }
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
      _row_id: undefined,
      _after: { role, capability, allowed: data.allowed, reset_to_default: matchesDefault },
      _metadata: {},
    });

    return { ok: true as const, resetToDefault: matchesDefault };
  },
  { auth: { capability: "admin.manage_roles" } },
);

async function createProvisionedAuthUser(input: {
  email: string;
  password: string;
  displayName: string;
  employeeCode?: string | null;
  role: AppRole;
  locationIds: string[];
}): Promise<{ userId: string }> {
  const role_level = ROLE_LEVELS[input.role];
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: input.displayName },
  });
  if (createErr) throw createErr;
  if (!created.user) throw new Error("User creation failed");

  await saveLoginProfile({
    userId: created.user.id,
    displayName: input.displayName,
    employeeCode: input.employeeCode,
  });

  const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
    user_id: created.user.id,
    role: input.role,
    role_level,
    location_ids: input.locationIds,
  });
  if (roleErr && !isUniqueViolation(roleErr)) throw roleErr;

  return { userId: created.user.id };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  return code === "23505";
}

/**
 * profiles.employee_code is unique and is often already owned by a supervisor
 * or role-persona login that is not linked on staff.user_id. Keep the auth
 * user; skip the code instead of failing the whole provision.
 */
async function saveLoginProfile(input: {
  userId: string;
  displayName: string;
  employeeCode?: string | null;
}) {
  const employeeCode = input.employeeCode?.trim() || null;
  const { error } = employeeCode
    ? await supabaseAdmin.from("profiles").upsert({
        id: input.userId,
        display_name: input.displayName,
        employee_code: employeeCode,
      })
    : await supabaseAdmin.from("profiles").upsert({
        id: input.userId,
        display_name: input.displayName,
      });
  if (!error) return;
  if (!employeeCode || !isUniqueViolation(error)) throw error;

  const { error: retryErr } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: input.userId, display_name: input.displayName });
  if (retryErr) throw retryErr;
}

function isDuplicateAuthEmail(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "email_exists" || /already been registered/i.test(message);
}

async function listAuthUsersByEmail(): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const user of data.users) {
      const email = (user.email ?? "").trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, user.id);
    }
    if (data.users.length < 200) break;
  }
  return byEmail;
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const users = await listAuthUsersByEmail();
  return users.get(target) ?? null;
}

async function authEmailForUser(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}

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
    const { userId } = await createProvisionedAuthUser({
      email: data.email,
      password: data.password,
      displayName: data.display_name,
      employeeCode: data.employee_code,
      role,
      locationIds: data.location_ids,
    });

    await context.supabase.rpc("log_audit", {
      _action: "admin.user_provisioned",
      _table_name: "profiles",
      _row_id: userId,
      _after: { email: data.email, role, role_level: ROLE_LEVELS[role] },
      _metadata: {},
    });

    return { ok: true, user_id: userId };
  },
  { auth: { capability: "admin.provision_users" } },
);

type StaffLoginTeam = {
  managerName: string | null;
  reportNames: string[];
  furtherReportCount: number;
};

/** Manager and reports from staff_profile_ext.reporting_manager_staff_id — the operations chart. */
async function loginTeamForStaff(staffId: string): Promise<StaffLoginTeam> {
  const names = new Map<string, string>();
  const rows: { staffId: string; reportingManagerStaffId: string | null }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) names.set(row.id, row.full_name?.trim() || "Staff");
    if (page.length < 1000) break;
    from += 1000;
  }
  from = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("staff_profile_ext")
      .select("staff_id, reporting_manager_staff_id")
      .order("staff_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      if (!names.has(row.staff_id)) continue;
      rows.push({ staffId: row.staff_id, reportingManagerStaffId: row.reporting_manager_staff_id });
    }
    if (page.length < 1000) break;
    from += 1000;
  }
  const seen = new Set(rows.map((row) => row.staffId));
  for (const id of names.keys()) {
    if (!seen.has(id)) rows.push({ staffId: id, reportingManagerStaffId: null });
  }
  const team = loginReportingTeam(staffId, rows);
  const direct = new Set(team.directReportStaffIds);
  return {
    managerName: team.managerStaffId ? (names.get(team.managerStaffId) ?? null) : null,
    reportNames: team.directReportStaffIds
      .map((id) => names.get(id) ?? "Staff")
      .sort((a, b) => a.localeCompare(b)),
    furtherReportCount: team.reportStaffIds.filter((id) => !direct.has(id)).length,
  };
}

/** Suggested sign-in email for the create-login form. Does not create a user. */
export const previewStaffLogin = createSafeAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
  }),
  async (data, context) => {
    await requireExec(context.supabase, 95);

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, email, full_name, employee_code, deleted_at")
      .eq("id", data.staffId)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff || staff.deleted_at) throw new Error("Staff member not found");
    const team = await loginTeamForStaff(staff.id);
    if (staff.user_id) {
      return { email: await authEmailForUser(staff.user_id), alreadyLinked: true as const, team };
    }

    const takenEmails = (await listAuthUsersByEmail()).keys();
    return {
      email: resolveStaffLoginEmail(staff.email, staff.employee_code, {
        fullName: staff.full_name,
        takenEmails,
      }),
      alreadyLinked: false as const,
      team,
    };
  },
  { auth: { capability: "admin.provision_users" } },
);

/** Create (or link) an email/password login and set staff.user_id so /hr/me resolves. */
export const provisionStaffLogin = createSafeAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    email: z.string().trim().email().max(200).optional(),
    password: z.string().min(STAFF_LOGIN_PASSWORD_MIN).max(STAFF_LOGIN_PASSWORD_MAX).optional(),
  }),
  async (data, context) => {
    await assertCanProvisionStaffLogin(context, data.staffId);

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, email, full_name, employee_code, location_id, deleted_at")
      .eq("id", data.staffId)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff || staff.deleted_at) throw new Error("Staff member not found");

    if (staff.user_id) {
      return {
        created: false,
        linkedExisting: false,
        alreadyLinked: true,
        userId: staff.user_id,
        email: await authEmailForUser(staff.user_id),
        password: null,
        role: STAFF_LOGIN_ROLE,
        team: await loginTeamForStaff(staff.id),
      };
    }

    if (!staff.location_id) throw new Error("Staff member has no branch");

    const password = data.password ?? STAFF_LOGIN_DEFAULT_PASSWORD;
    const authByEmail = await listAuthUsersByEmail();
    const autoEmails = new Set([
      ...staffLoginEmailCandidates(staff.full_name),
      ...staffLoginCodeEmails(staff.employee_code),
    ]);
    let email = data.email
      ? parseStaffLoginEmail(data.email)
      : resolveStaffLoginEmail(staff.email, staff.employee_code, {
          fullName: staff.full_name,
          takenEmails: authByEmail.keys(),
        });
    if (!email) throw new Error("Enter a valid email address.");

    const existingForEmail = authByEmail.get(email);
    if (existingForEmail && autoEmails.has(email)) {
      const { data: ownerRows, error: ownerErr } = await supabaseAdmin
        .from("staff")
        .select("id, full_name, employee_code")
        .eq("user_id", existingForEmail)
        .neq("id", staff.id)
        .is("deleted_at", null)
        .limit(1);
      if (ownerErr) throw ownerErr;
      const owner = ownerRows?.[0];
      if (owner) {
        const next = chooseStaffLoginEmail({
          fullName: staff.full_name,
          employeeCode: staff.employee_code,
          takenEmails: authByEmail.keys(),
          fromEmail: email,
        });
        if (!next || next === email) {
          throw new Error(`This login is already linked to ${owner.full_name} (${owner.employee_code})`);
        }
        email = next;
      }
    }

    const locationIds = [staff.location_id];
    let userId: string;
    let created = false;
    let linkedExisting = false;
    let issuedPassword: string | null = null;

    try {
      const createdUser = await createProvisionedAuthUser({
        email,
        password,
        displayName: staff.full_name,
        employeeCode: staff.employee_code,
        role: STAFF_LOGIN_ROLE,
        locationIds,
      });
      userId = createdUser.userId;
      created = true;
      issuedPassword = password;
    } catch (error) {
      if (!isDuplicateAuthEmail(error)) throw error;
      const existingId = await findAuthUserIdByEmail(email);
      if (!existingId) {
        throw new Error("A login with this email already exists, but it could not be found to link");
      }
      userId = existingId;
      linkedExisting = true;
    }

    const { data: takenRows, error: takenErr } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, employee_code")
      .eq("user_id", userId)
      .neq("id", staff.id)
      .is("deleted_at", null)
      .limit(1);
    if (takenErr) throw takenErr;
    const taken = takenRows?.[0];
    if (taken) {
      throw new Error(`This login is already linked to ${taken.full_name} (${taken.employee_code})`);
    }

    if (linkedExisting) {
      const { data: existingRoles, error: rolesErr } = await supabaseAdmin
        .from("user_roles")
        .select("id, role")
        .eq("user_id", userId);
      if (rolesErr) throw rolesErr;
      const elevated = (existingRoles ?? []).some((row) => row.role !== STAFF_LOGIN_ROLE);
      if (elevated) {
        throw new Error(
          `A login for ${email} already exists with another role. Clear the staff email to create a separate login from the employee code.`,
        );
      }

      const { data: profile, error: profileReadErr } = await supabaseAdmin
        .from("profiles")
        .select("id, employee_code")
        .eq("id", userId)
        .maybeSingle();
      if (profileReadErr) throw profileReadErr;
      await saveLoginProfile({
        userId,
        displayName: staff.full_name,
        employeeCode: profile?.employee_code ? null : staff.employee_code,
      });

      if (!existingRoles?.length) {
        const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
          user_id: userId,
          role: STAFF_LOGIN_ROLE,
          role_level: ROLE_LEVELS[STAFF_LOGIN_ROLE],
          location_ids: locationIds,
        });
        if (roleErr && !isUniqueViolation(roleErr)) throw roleErr;
        const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
        });
        if (pwErr) throw pwErr;
        issuedPassword = password;
      }
    }

    const { data: linked, error: linkErr } = await supabaseAdmin
      .from("staff")
      .update({ user_id: userId })
      .eq("id", staff.id)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!linked) throw new Error("Staff login was already linked");

    const { error: auditErr } = await context.supabase.rpc("log_audit", {
      _action: "admin.staff_login_provisioned",
      _table_name: "staff",
      _row_id: staff.id,
      _after: {
        user_id: userId,
        email,
        role: STAFF_LOGIN_ROLE,
        created,
        linked_existing: linkedExisting,
      },
      _metadata: {},
    });
    if (auditErr) console.error("[provisionStaffLogin] audit log failed");

    return {
      created,
      linkedExisting,
      alreadyLinked: false,
      userId,
      email,
      password: issuedPassword,
      role: STAFF_LOGIN_ROLE,
      team: await loginTeamForStaff(staff.id),
    };
  },
  { auth: { requireRole: true } },
);
