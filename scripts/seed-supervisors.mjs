/**
 * Creates FEC location-supervisor test logins (branch_gm) via Supabase Admin API.
 * Idempotent — safe to re-run; does not modify admin@fec.com or other existing users.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Usage: node --env-file=.env.local scripts/seed-supervisors.mjs
 */
import { createClient } from "@supabase/supabase-js";

const TEST_PASSWORD = "FecTest2026!";
const SUPERVISOR_ROLE = "branch_gm";
const SUPERVISOR_ROLE_LEVEL = 70;

/** Protected accounts — never modified by this script. */
const PROTECTED_EMAILS = new Set(["admin@fec.com"]);

/**
 * Test supervisors mapped to imported staff records.
 * CB-DSM: "Paw" in the brief maps to Romel Chavez Pusung (venue supervisor on staff roster).
 */
const SUPERVISORS = [
  {
    email: "mary.supervisor@fec.test",
    displayName: "Mary Muiruri",
    employeeCode: "29440401419",
    locationCodes: ["INF-CC"],
  },
  {
    email: "ashfaq.supervisor@fec.test",
    displayName: "Ashfaq Noori",
    employeeCode: "29735603636",
    locationCodes: ["KDS-CC"],
  },
  {
    email: "rosebelt.supervisor@fec.test",
    displayName: "Rosebelt Fatal",
    employeeCode: "29660800835",
    locationCodes: ["CB-VM"],
  },
  {
    email: "romel.supervisor@fec.test",
    displayName: "Romel Chavez Pusung",
    employeeCode: "28360804725",
    locationCodes: ["CB-DSM"],
    note: "User brief listed as Paw; staff roster venue supervisor at CB-DSM",
  },
  {
    email: "zaryab.supervisor@fec.test",
    displayName: "Zaryab Javaid",
    employeeCode: "28858608039",
    locationCodes: ["CAR-AP"],
  },
  {
    email: "waqar.supervisor@fec.test",
    displayName: "Waqar Asghar",
    employeeCode: "29658611062",
    locationCodes: ["UA-DM", "KDS-DM"],
  },
];

/** KDS-DM may exist from migrations but is omitted from seed-locations.mjs — ensure active. */
const EXTRA_LOCATIONS = [
  {
    code: "KDS-DM",
    name: "Kids Mini Driving School",
    city: "Doha",
    region: "Doha Mall",
    country: "QA",
    timezone: "Asia/Qatar",
    status: "active",
    launched_on: "2022-04-01",
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

async function ensureExtraLocations() {
  for (const loc of EXTRA_LOCATIONS) {
    const { data: existing, error: fetchError } = await admin
      .from("locations")
      .select("id, status")
      .eq("code", loc.code)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to read location ${loc.code}: ${fetchError.message}`);
    }

    if (existing) {
      if (existing.status !== "active") {
        const { error: updateError } = await admin
          .from("locations")
          .update({ ...loc, status: "active" })
          .eq("id", existing.id);
        if (updateError) throw new Error(`Failed to reactivate ${loc.code}: ${updateError.message}`);
        console.log(`Reactivated location ${loc.code}`);
      }
      continue;
    }

    const { error: insertError } = await admin.from("locations").insert(loc);
    if (insertError) throw new Error(`Failed to insert ${loc.code}: ${insertError.message}`);
    console.log(`Inserted location ${loc.code}`);
  }
}

async function loadLocationMap() {
  const codes = [...new Set(SUPERVISORS.flatMap((s) => s.locationCodes))];
  const { data, error } = await admin.from("locations").select("id, code").in("code", codes);
  if (error) throw new Error(`Failed to load locations: ${error.message}`);

  const map = new Map((data ?? []).map((row) => [row.code, row.id]));
  const missing = codes.filter((c) => !map.has(c));
  if (missing.length) {
    throw new Error(`Missing location codes in database: ${missing.join(", ")}`);
  }
  return map;
}

async function findUserIdByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Failed to list users: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensureAuthUser(supervisor) {
  if (PROTECTED_EMAILS.has(supervisor.email)) {
    throw new Error(`Refusing to modify protected account ${supervisor.email}`);
  }

  let userId = await findUserIdByEmail(supervisor.email);

  if (userId) {
    console.log(`  Auth user exists: ${supervisor.email} (${userId})`);
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: supervisor.displayName },
    });
    if (updateError) {
      throw new Error(`Failed to update auth user ${supervisor.email}: ${updateError.message}`);
    }
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: supervisor.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: supervisor.displayName },
    });
    if (createError) {
      throw new Error(`Failed to create ${supervisor.email}: ${createError.message}`);
    }
    userId = created.user.id;
    console.log(`  Created auth user: ${supervisor.email} (${userId})`);
  }

  return userId;
}

async function ensureProfile(userId, supervisor) {
  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select("id, display_name, employee_code")
    .eq("id", userId)
    .maybeSingle();

  if (readError) throw new Error(`Failed to read profile: ${readError.message}`);

  const payload = {
    display_name: supervisor.displayName,
    employee_code: supervisor.employeeCode,
  };

  if (existing) {
    const { error: updateError } = await admin.from("profiles").update(payload).eq("id", userId);
    if (updateError) throw new Error(`Failed to update profile: ${updateError.message}`);
    console.log(`  Updated profile (${supervisor.employeeCode})`);
  } else {
    const { error: insertError } = await admin.from("profiles").insert({ id: userId, ...payload });
    if (insertError) throw new Error(`Failed to insert profile: ${insertError.message}`);
    console.log(`  Inserted profile (${supervisor.employeeCode})`);
  }
}

async function ensureRole(userId, locationIds) {
  const { data: existing, error: readError } = await admin
    .from("user_roles")
    .select("id, role, location_ids")
    .eq("user_id", userId)
    .eq("role", SUPERVISOR_ROLE)
    .maybeSingle();

  if (readError) throw new Error(`Failed to read user_roles: ${readError.message}`);

  const payload = {
    user_id: userId,
    role: SUPERVISOR_ROLE,
    role_level: SUPERVISOR_ROLE_LEVEL,
    location_ids: locationIds,
  };

  if (existing) {
    const same =
      existing.location_ids?.length === locationIds.length &&
      locationIds.every((id) => existing.location_ids?.includes(id));
    if (same) {
      console.log(`  ${SUPERVISOR_ROLE} role already scoped (${locationIds.length} location(s))`);
      return;
    }
    const { error: updateError } = await admin
      .from("user_roles")
      .update({ role_level: SUPERVISOR_ROLE_LEVEL, location_ids: locationIds })
      .eq("id", existing.id);
    if (updateError) throw new Error(`Failed to update role: ${updateError.message}`);
    console.log(`  Updated ${SUPERVISOR_ROLE} scope (${locationIds.length} location(s))`);
  } else {
    const { error: insertError } = await admin.from("user_roles").insert(payload);
    if (insertError) throw new Error(`Failed to grant role: ${insertError.message}`);
    console.log(`  Granted ${SUPERVISOR_ROLE} (level ${SUPERVISOR_ROLE_LEVEL})`);
  }
}

async function verifyStaffLink(supervisor) {
  const { data, error } = await admin
    .from("staff")
    .select("id, full_name, location_id")
    .eq("employee_code", supervisor.employeeCode)
    .maybeSingle();

  if (error) {
    console.warn(`  Warning: could not verify staff link for ${supervisor.employeeCode}: ${error.message}`);
    return;
  }
  if (!data) {
    console.warn(`  Warning: no staff row for employee_code ${supervisor.employeeCode}`);
    return;
  }
  if (data.full_name !== supervisor.displayName) {
    console.warn(`  Warning: staff name "${data.full_name}" differs from "${supervisor.displayName}"`);
  }
}

async function main() {
  console.log("Ensuring required locations…");
  await ensureExtraLocations();

  console.log("Loading location IDs…");
  const locationMap = await loadLocationMap();

  const results = [];

  for (const supervisor of SUPERVISORS) {
    console.log(`\n${supervisor.displayName} <${supervisor.email}>`);
    const locationIds = supervisor.locationCodes.map((code) => locationMap.get(code));
    const userId = await ensureAuthUser(supervisor);
    await ensureProfile(userId, supervisor);
    await ensureRole(userId, locationIds);
    await verifyStaffLink(supervisor);

    results.push({
      email: supervisor.email,
      name: supervisor.displayName,
      role: SUPERVISOR_ROLE,
      locations: supervisor.locationCodes.join(", "),
      userId,
    });
  }

  console.log("\n--- Supervisor test accounts ---");
  console.log(`Password (all): ${TEST_PASSWORD}\n`);
  for (const row of results) {
    console.log(`${row.email}\t${row.name}\t${row.role}\t${row.locations}`);
  }
  console.log("\nSupervisor seed complete.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
