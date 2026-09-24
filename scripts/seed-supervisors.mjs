/**
 * Creates FEC location-supervisor test logins (branch_gm) via Supabase Admin API.
 * Idempotent — safe to re-run; does not modify admin@fec.com or other existing users.
 * Ensures every active location has at least one site supervisor in user_roles.location_ids.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Usage: node --env-file=.env.local scripts/seed-supervisors.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const TEST_PASSWORD = "FecTest2026!";
const SUPERVISOR_ROLE = "branch_gm";
const SUPERVISOR_ROLE_LEVEL = 70;

/** Protected accounts — never modified by this script. */
const PROTECTED_EMAILS = new Set(["admin@fec.com"]);

/**
 * Test supervisors mapped to imported staff records.
 * CB-DSM: "Paw" in the brief maps to Romel Chavez Pusung (venue supervisor on staff roster).
 * WM-VM has no venue supervisor on the roster — synthetic staff + login.
 */
const SUPERVISORS = [
  {
    email: "mary.supervisor@fec.test",
    displayName: "Mary Wangare Muiruri",
    employeeCode: "INF-CC-VS",
    qidHint: "29440401619",
    locationCodes: ["INF-CC"],
  },
  {
    email: "ashfaq.supervisor@fec.test",
    displayName: "Ashfaq Noori",
    employeeCode: "KDS-CC-VS",
    qidHint: "29735603636",
    locationCodes: ["KDS-CC"],
  },
  {
    email: "rosebelt.supervisor@fec.test",
    displayName: "Rosebelt Fatal",
    employeeCode: "CB-VM-BM2",
    qidHint: "29660806855",
    locationCodes: ["CB-VM"],
  },
  {
    email: "romel.supervisor@fec.test",
    displayName: "Romel Chavez Pusung",
    employeeCode: "CB-DSM-VS",
    qidHint: "28360804725",
    locationCodes: ["CB-DSM"],
    note: "User brief listed as Paw; staff roster venue supervisor at CB-DSM",
  },
  {
    email: "zaryab.supervisor@fec.test",
    displayName: "Zaryab Javaid",
    employeeCode: "CAR-AP-VS",
    qidHint: "28858608039",
    locationCodes: ["CAR-AP"],
  },
  {
    email: "waqar.supervisor@fec.test",
    displayName: "Waqar Asghar",
    employeeCode: "UA-DM-VS",
    qidHint: "29658611062",
    locationCodes: ["UA-DM", "KDS-DM"],
  },
  {
    email: "wm.supervisor@fec.test",
    displayName: "Winter Mirage Supervisor",
    employeeCode: "WM-VM-VS",
    locationCodes: ["WM-VM"],
    createStaffIfMissing: true,
    jobTitle: "Venue Supervisor",
    staffRole: "venue_supervisor",
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
  const { data, error } = await admin
    .from("locations")
    .select("id, code, status")
    .eq("status", "active")
    .order("code");
  if (error) throw new Error(`Failed to load locations: ${error.message}`);
  if (!data?.length) throw new Error("No active locations — run npm run seed:locations first.");

  const map = new Map(data.map((row) => [row.code, row.id]));
  const needed = [...new Set(SUPERVISORS.flatMap((s) => s.locationCodes))];
  const missing = needed.filter((c) => !map.has(c));
  if (missing.length) {
    throw new Error(`Missing location codes in database: ${missing.join(", ")}`);
  }
  return { map, active: data };
}

async function findUserIdByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (!data.users.length || data.users.length < 200) return null;
  }
  return null;
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

  const { data: codeOwner, error: ownerError } = await admin
    .from("profiles")
    .select("id")
    .eq("employee_code", supervisor.employeeCode)
    .neq("id", userId)
    .maybeSingle();
  if (ownerError) throw new Error(`Failed to check employee_code owner: ${ownerError.message}`);

  const payload = {
    display_name: supervisor.displayName,
    // profiles.employee_code is unique — role personas may already own the live code.
    ...(codeOwner ? {} : { employee_code: supervisor.employeeCode }),
  };
  if (codeOwner) {
    console.log(
      `  Profile employee_code ${supervisor.employeeCode} owned by another user — keeping display_name only (location scope still on user_roles)`,
    );
  }

  if (existing) {
    const { error: updateError } = await admin.from("profiles").update(payload).eq("id", userId);
    if (updateError) throw new Error(`Failed to update profile: ${updateError.message}`);
    console.log(`  Updated profile (${payload.employee_code ?? existing.employee_code ?? "no code"})`);
  } else {
    const insertPayload = {
      id: userId,
      display_name: supervisor.displayName,
      employee_code: codeOwner ? null : supervisor.employeeCode,
    };
    const { error: insertError } = await admin.from("profiles").insert(insertPayload);
    if (insertError) throw new Error(`Failed to insert profile: ${insertError.message}`);
    console.log(`  Inserted profile (${insertPayload.employee_code ?? "no code"})`);
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

async function ensureSyntheticStaff(supervisor, homeLocationId, userId) {
  if (!supervisor.createStaffIfMissing) return;

  const payload = {
    user_id: userId,
    employee_code: supervisor.employeeCode,
    full_name: supervisor.displayName,
    job_title: supervisor.jobTitle ?? "Venue Supervisor",
    location_id: homeLocationId,
    email: supervisor.email,
    staff_role: supervisor.staffRole ?? "venue_supervisor",
    status: "active",
    deleted_at: null,
  };

  const { data: byCode, error: codeError } = await admin
    .from("staff")
    .select("id")
    .eq("employee_code", supervisor.employeeCode)
    .maybeSingle();
  if (codeError) throw new Error(`Failed to read staff ${supervisor.employeeCode}: ${codeError.message}`);

  if (byCode) {
    const { error } = await admin.from("staff").update(payload).eq("id", byCode.id);
    if (error) throw new Error(`Failed to update synthetic staff: ${error.message}`);
    console.log(`  Linked synthetic staff ${supervisor.employeeCode}`);
    return;
  }

  const { error } = await admin.from("staff").insert({ id: randomUUID(), ...payload });
  if (error) throw new Error(`Failed to insert synthetic staff: ${error.message}`);
  console.log(`  Created synthetic staff ${supervisor.employeeCode}`);
}

/**
 * Resolve live staff.employee_code. Roster imports often moved QIDs into staff.qid
 * and set employee_code to INF-CC-BM style — keep profiles linked to the live code.
 */
async function resolveProfileEmployeeCode(supervisor) {
  const { data: byCode } = await admin
    .from("staff")
    .select("employee_code, full_name, qid")
    .eq("employee_code", supervisor.employeeCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (byCode?.employee_code) return byCode.employee_code;

  const qidCandidates = [supervisor.qidHint, supervisor.employeeCode].filter(Boolean);
  for (const qid of qidCandidates) {
    const { data: byQid } = await admin
      .from("staff")
      .select("employee_code, full_name, qid")
      .eq("qid", qid)
      .is("deleted_at", null)
      .maybeSingle();
    if (byQid?.employee_code) {
      console.log(`  Resolved staff via qid → ${byQid.employee_code}`);
      return byQid.employee_code;
    }
  }

  return supervisor.employeeCode;
}

async function verifyStaffLink(employeeCode, displayName) {
  const { data, error } = await admin
    .from("staff")
    .select("id, full_name, location_id")
    .eq("employee_code", employeeCode)
    .maybeSingle();

  if (error) {
    console.warn(`  Warning: could not verify staff link for ${employeeCode}: ${error.message}`);
    return;
  }
  if (!data) {
    console.warn(`  Warning: no staff row for employee_code ${employeeCode}`);
    return;
  }
  if (data.full_name !== displayName) {
    console.warn(`  Warning: staff name "${data.full_name}" differs from "${displayName}"`);
  }
}

/** Corporate / non-venue sites — Admin/HR scoped, not per-site branch_gm. */
const NON_VENUE_LOCATION_CODES = new Set(["HO"]);

async function assertEveryActiveLocationCovered(activeLocations, results) {
  const covered = new Set(results.flatMap((r) => r.locationCodes));
  const uncovered = activeLocations.filter(
    (loc) => !NON_VENUE_LOCATION_CODES.has(loc.code) && !covered.has(loc.code),
  );
  if (uncovered.length) {
    throw new Error(
      `Active venue locations without a site supervisor: ${uncovered.map((l) => l.code).join(", ")}. Add them to SUPERVISORS.`,
    );
  }
  const skipped = activeLocations.filter((loc) => NON_VENUE_LOCATION_CODES.has(loc.code));
  if (skipped.length) {
    console.log(
      `\nSkipped non-venue location(s): ${skipped.map((l) => l.code).join(", ")} (Admin/HR, not site supervisor).`,
    );
  }
  console.log(
    `All ${activeLocations.length - skipped.length} active venue locations have a site supervisor assignment.`,
  );
}

async function main() {
  console.log("Ensuring required locations…");
  await ensureExtraLocations();

  console.log("Loading location IDs…");
  const { map: locationMap, active } = await loadLocationMap();

  const results = [];

  for (const supervisor of SUPERVISORS) {
    console.log(`\n${supervisor.displayName} <${supervisor.email}>`);
    const locationIds = supervisor.locationCodes.map((code) => locationMap.get(code));
    const userId = await ensureAuthUser(supervisor);
    const profileCode = await resolveProfileEmployeeCode(supervisor);
    const linked = { ...supervisor, employeeCode: profileCode };
    await ensureProfile(userId, linked);
    await ensureRole(userId, locationIds);
    await ensureSyntheticStaff(linked, locationIds[0], userId);
    await verifyStaffLink(profileCode, supervisor.displayName);

    results.push({
      email: supervisor.email,
      name: supervisor.displayName,
      role: SUPERVISOR_ROLE,
      locations: supervisor.locationCodes.join(", "),
      locationCodes: supervisor.locationCodes,
      userId,
    });
  }

  await assertEveryActiveLocationCovered(active, results);

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
