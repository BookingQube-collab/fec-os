/**
 * Creates FEC maintenance & logistics test logins via Supabase Admin API.
 * Idempotent — safe to re-run; does not modify admin@fec.com or supervisor accounts.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Usage: node --env-file=.env.local scripts/seed-maintenance-logistics.mjs
 */
import { createClient } from "@supabase/supabase-js";

const TEST_PASSWORD = "FecTest2026!";

const ROLE_LEVELS = {
  tech_supervisor: 50,
  technician: 30,
};

/** Protected accounts — never modified by this script. */
const PROTECTED_EMAILS = new Set([
  "admin@fec.com",
  "mary.supervisor@fec.test",
  "ashfaq.supervisor@fec.test",
  "rosebelt.supervisor@fec.test",
  "romel.supervisor@fec.test",
  "zaryab.supervisor@fec.test",
  "waqar.supervisor@fec.test",
]);

/**
 * Maintenance & logistics test accounts.
 * `locationScope: "all"` grants every active FEC venue (estate-wide maintenance / central warehouse).
 */
const ACCOUNTS = [
  {
    email: "lead.maintenance@fec.test",
    displayName: "Faisal Al-Mansouri",
    employeeCode: null,
    role: "tech_supervisor",
    locationScope: "all",
    note: "Generic maintenance team lead — WO/PM/requests/dashboard estate-wide",
  },
  {
    email: "hannan.maintenance@fec.test",
    displayName: "Hannan Abid",
    employeeCode: "28405028554",
    role: "technician",
    locationCodes: ["UA-DM"],
    note: "Mapped to imported staff roster (UA-DM Technician, Maintenance)",
  },
  {
    email: "warehouse.logistics@fec.test",
    displayName: "Salim Al-Kuwari",
    employeeCode: null,
    role: "tech_supervisor",
    locationScope: "all",
    note: "Central logistics / warehouse — submit, warehouse, verify",
  },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadAllActiveLocationIds() {
  const { data, error } = await admin
    .from("locations")
    .select("id, code")
    .eq("status", "active")
    .order("code");
  if (error) throw new Error(`Failed to load active locations: ${error.message}`);
  if (!data?.length) throw new Error("No active locations found — run seed:locations first.");
  return { ids: data.map((row) => row.id), codes: data.map((row) => row.code) };
}

async function loadLocationMap(codes) {
  const { data, error } = await admin.from("locations").select("id, code").in("code", codes);
  if (error) throw new Error(`Failed to load locations: ${error.message}`);

  const map = new Map((data ?? []).map((row) => [row.code, row.id]));
  const missing = codes.filter((c) => !map.has(c));
  if (missing.length) {
    throw new Error(`Missing location codes in database: ${missing.join(", ")}`);
  }
  return map;
}

async function resolveLocationIds(account, allActive) {
  if (account.locationScope === "all") {
    return { locationIds: allActive.ids, locationLabel: allActive.codes.join(", ") };
  }
  const map = await loadLocationMap(account.locationCodes);
  const codes = account.locationCodes;
  return {
    locationIds: codes.map((code) => map.get(code)),
    locationLabel: codes.join(", "),
  };
}

async function findUserIdByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Failed to list users: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensureAuthUser(account) {
  if (PROTECTED_EMAILS.has(account.email)) {
    throw new Error(`Refusing to modify protected account ${account.email}`);
  }

  let userId = await findUserIdByEmail(account.email);

  if (userId) {
    console.log(`  Auth user exists: ${account.email} (${userId})`);
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: account.displayName },
    });
    if (updateError) {
      throw new Error(`Failed to update auth user ${account.email}: ${updateError.message}`);
    }
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: account.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: account.displayName },
    });
    if (createError) {
      throw new Error(`Failed to create ${account.email}: ${createError.message}`);
    }
    userId = created.user.id;
    console.log(`  Created auth user: ${account.email} (${userId})`);
  }

  return userId;
}

async function ensureProfile(userId, account) {
  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select("id, display_name, employee_code")
    .eq("id", userId)
    .maybeSingle();

  if (readError) throw new Error(`Failed to read profile: ${readError.message}`);

  const payload = {
    display_name: account.displayName,
    ...(account.employeeCode ? { employee_code: account.employeeCode } : {}),
  };

  if (existing) {
    const { error: updateError } = await admin.from("profiles").update(payload).eq("id", userId);
    if (updateError) throw new Error(`Failed to update profile: ${updateError.message}`);
    console.log(`  Updated profile${account.employeeCode ? ` (${account.employeeCode})` : ""}`);
  } else {
    const { error: insertError } = await admin.from("profiles").insert({ id: userId, ...payload });
    if (insertError) throw new Error(`Failed to insert profile: ${insertError.message}`);
    console.log(`  Inserted profile${account.employeeCode ? ` (${account.employeeCode})` : ""}`);
  }
}

async function ensureRole(userId, account, locationIds) {
  const roleLevel = ROLE_LEVELS[account.role];
  if (roleLevel == null) {
    throw new Error(`Unknown role ${account.role}`);
  }

  const { data: existing, error: readError } = await admin
    .from("user_roles")
    .select("id, role, location_ids")
    .eq("user_id", userId)
    .eq("role", account.role)
    .maybeSingle();

  if (readError) throw new Error(`Failed to read user_roles: ${readError.message}`);

  const payload = {
    user_id: userId,
    role: account.role,
    role_level: roleLevel,
    location_ids: locationIds,
  };

  if (existing) {
    const same =
      existing.location_ids?.length === locationIds.length &&
      locationIds.every((id) => existing.location_ids?.includes(id));
    if (same) {
      console.log(`  ${account.role} role already scoped (${locationIds.length} location(s))`);
      return;
    }
    const { error: updateError } = await admin
      .from("user_roles")
      .update({ role_level: roleLevel, location_ids: locationIds })
      .eq("id", existing.id);
    if (updateError) throw new Error(`Failed to update role: ${updateError.message}`);
    console.log(`  Updated ${account.role} scope (${locationIds.length} location(s))`);
  } else {
    const { error: insertError } = await admin.from("user_roles").insert(payload);
    if (insertError) throw new Error(`Failed to grant role: ${insertError.message}`);
    console.log(`  Granted ${account.role} (level ${roleLevel})`);
  }
}

async function verifyStaffLink(account) {
  if (!account.employeeCode) return;

  const { data, error } = await admin
    .from("staff")
    .select("id, full_name, location_id")
    .eq("employee_code", account.employeeCode)
    .maybeSingle();

  if (error) {
    console.warn(`  Warning: could not verify staff link for ${account.employeeCode}: ${error.message}`);
    return;
  }
  if (!data) {
    console.warn(`  Warning: no staff row for employee_code ${account.employeeCode}`);
    return;
  }
  if (data.full_name !== account.displayName) {
    console.warn(`  Warning: staff name "${data.full_name}" differs from "${account.displayName}"`);
  }
}

async function main() {
  console.log("Loading active locations…");
  const allActive = await loadAllActiveLocationIds();

  const results = [];

  for (const account of ACCOUNTS) {
    console.log(`\n${account.displayName} <${account.email}>`);
    const { locationIds, locationLabel } = await resolveLocationIds(account, allActive);
    const userId = await ensureAuthUser(account);
    await ensureProfile(userId, account);
    await ensureRole(userId, account, locationIds);
    await verifyStaffLink(account);

    results.push({
      email: account.email,
      name: account.displayName,
      role: account.role,
      locations: locationLabel,
      userId,
    });
  }

  console.log("\n--- Maintenance & logistics test accounts ---");
  console.log(`Password (all): ${TEST_PASSWORD}\n`);
  for (const row of results) {
    console.log(`${row.email}\t${row.name}\t${row.role}\t${row.locations}`);
  }
  console.log("\nMaintenance & logistics seed complete.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
