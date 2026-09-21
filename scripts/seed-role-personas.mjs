/**
 * Provisions the four FEC-OS role demo logins (site supervisor, ops supervisor, HR, employee).
 * Idempotent. By default uses a stable shared UAT password (same family as other @fec.test seeds).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Usage:
 *   npm run seed:role-personas
 *   npm run seed:role-personas -- --rotate          # unique random password per account
 *   ROLE_PERSONA_PASSWORD='CustomPass!' npm run seed:role-personas
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const ROLE_LEVELS = {
  branch_gm: 70,
  duty_manager: 60,
  hr: 55,
  cashier_host: 20,
};

/** Shared with seed:supervisors / seed:test-logins / seed:maintenance-logistics. */
const DEFAULT_UAT_PASSWORD = "FecTest2026!";

/** Never touch CEO / existing shared-password UAT accounts. */
const PROTECTED_EMAILS = new Set([
  "admin@fec.com",
  "mary.supervisor@fec.test",
  "ashfaq.supervisor@fec.test",
  "rosebelt.supervisor@fec.test",
  "romel.supervisor@fec.test",
  "zaryab.supervisor@fec.test",
  "waqar.supervisor@fec.test",
  "hr@fec.test",
  "dept.head@fec.test",
  "pr.requester@fec.test",
  "finance.approver@fec.test",
  "lead.maintenance@fec.test",
  "hannan.maintenance@fec.test",
  "warehouse.logistics@fec.test",
]);

/**
 * Four personas covering the three requested roles + natural site vs ops split.
 * Staff links use live roster employee_codes (not legacy Qatar-ID codes).
 */
const PERSONAS = [
  {
    key: "site_supervisor",
    email: "site.supervisor@fec.test",
    displayName: "Mary Wangare Muiruri",
    role: "branch_gm",
    staffEmployeeCode: "INF-CC-VS",
    profileEmployeeCode: "INF-CC-VS",
    locationCodes: ["INF-CC"],
    access:
      "Site supervisor (branch_gm) at Inflatapark: roster import/edit, monthly roster, daily-ops roster, leave manage/approve, attendance, employee app (/hr/me).",
  },
  {
    key: "ops_supervisor",
    email: "ops.supervisor@fec.test",
    displayName: "Ali Husnain",
    role: "duty_manager",
    staffEmployeeCode: "UA-DM-STF06",
    profileEmployeeCode: "UA-DM-STF06",
    locationCodes: ["UA-DM"],
    access:
      "Ops / shift supervisor (duty_manager) at Urban Arena: roster import/edit, daily-ops, attendance correct, leave manager-approve (not full leave admin), employee app (/hr/me).",
  },
  {
    key: "hr",
    email: "hr.manager@fec.test",
    displayName: "Mariam Al-Attiyah",
    role: "hr",
    staffEmployeeCode: null,
    createStaffCode: "PERSONA-HR",
    profileEmployeeCode: "PERSONA-HR",
    staffRole: "other",
    jobTitle: "HR Manager",
    department: "HR",
    locationScope: "all",
    access:
      "Full HR module: people directory, roster, attendance HR, leave admin, payroll view/generate/lock/export, HR admin, performance — estate-wide locations.",
  },
  {
    key: "employee",
    email: "employee@fec.test",
    displayName: "Jorene Tesoro Quixote",
    role: "cashier_host",
    staffEmployeeCode: "INF-CC-CSH01",
    profileEmployeeCode: "INF-CC-CSH01",
    locationCodes: ["INF-CC"],
    access:
      "Employee app only path: /employee → /hr/me (own attendance, leave, OT, profile). No HR admin. Note: cashier_host can still open floor tasks/issues if navigated deliberately.",
  },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rotate = process.argv.includes("--rotate");

function strongPassword() {
  // 24 chars: base64url without padding — unique per account, not stored in repo.
  return randomBytes(18).toString("base64url");
}

function resolvePassword() {
  const fromEnv = process.env.ROLE_PERSONA_PASSWORD?.trim();
  if (rotate) {
    return { mode: "rotate", shared: null };
  }
  if (fromEnv) {
    return { mode: "env", shared: fromEnv };
  }
  return { mode: "default", shared: DEFAULT_UAT_PASSWORD };
}

async function loadAllActiveLocations() {
  const { data, error } = await admin
    .from("locations")
    .select("id, code")
    .eq("status", "active")
    .order("code");
  if (error) throw new Error(`Failed to load locations: ${error.message}`);
  if (!data?.length) throw new Error("No active locations — run npm run seed:locations first.");
  return data;
}

async function resolveLocationIds(persona, allActive) {
  if (persona.locationScope === "all") {
    return {
      locationIds: allActive.map((row) => row.id),
      locationLabel: "all active",
      homeLocationId: allActive.find((r) => r.code === "UA-DM")?.id ?? allActive[0].id,
    };
  }
  const map = new Map(allActive.map((row) => [row.code, row.id]));
  const wanted = persona.locationCodes ?? [];
  const missing = wanted.filter((code) => !map.has(code));
  if (missing.length) throw new Error(`Missing location codes: ${missing.join(", ")}`);
  return {
    locationIds: wanted.map((code) => map.get(code)),
    locationLabel: wanted.join(", "),
    homeLocationId: map.get(wanted[0]),
  };
}

async function findUserIdByEmail(email) {
  const target = email.toLowerCase();
  // Paginate — a single page of 1000 misses users on larger projects.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (!data.users.length || data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(persona, password) {
  if (PROTECTED_EMAILS.has(persona.email)) {
    throw new Error(`Refusing to modify protected account ${persona.email}`);
  }

  let userId = await findUserIdByEmail(persona.email);

  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { display_name: persona.displayName },
    });
    if (error) throw new Error(`Failed to update ${persona.email}: ${error.message}`);
    console.log(`  Auth user refreshed: ${persona.email} (${userId})`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: persona.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: persona.displayName },
    });
    if (error) throw new Error(`Failed to create ${persona.email}: ${error.message}`);
    userId = data.user.id;
    console.log(`  Auth user created: ${persona.email} (${userId})`);
  }

  return userId;
}

async function ensureProfile(userId, persona) {
  const payload = {
    display_name: persona.displayName,
    employee_code: persona.profileEmployeeCode,
  };
  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (readError) throw new Error(`Failed to read profile: ${readError.message}`);

  if (existing) {
    const { error } = await admin.from("profiles").update(payload).eq("id", userId);
    if (error) throw new Error(`Failed to update profile: ${error.message}`);
    console.log(`  Profile updated (${persona.profileEmployeeCode})`);
    return;
  }

  const { error } = await admin.from("profiles").insert({ id: userId, ...payload });
  if (error) throw new Error(`Failed to insert profile: ${error.message}`);
  console.log(`  Profile inserted (${persona.profileEmployeeCode})`);
}

async function ensureRole(userId, persona, locationIds) {
  const roleLevel = ROLE_LEVELS[persona.role];
  if (roleLevel == null) throw new Error(`Unknown role ${persona.role}`);

  const { data: existing, error: readError } = await admin
    .from("user_roles")
    .select("id, location_ids")
    .eq("user_id", userId)
    .eq("role", persona.role)
    .maybeSingle();
  if (readError) throw new Error(`Failed to read user_roles: ${readError.message}`);

  const payload = {
    user_id: userId,
    role: persona.role,
    role_level: roleLevel,
    location_ids: locationIds,
  };

  if (existing) {
    const { error } = await admin
      .from("user_roles")
      .update({ role_level: roleLevel, location_ids: locationIds })
      .eq("id", existing.id);
    if (error) throw new Error(`Failed to update role: ${error.message}`);
    console.log(`  Role ${persona.role} scoped (${locationIds.length} location(s))`);
    return;
  }

  const { error } = await admin.from("user_roles").insert(payload);
  if (error) throw new Error(`Failed to grant role: ${error.message}`);
  console.log(`  Granted ${persona.role} (level ${roleLevel})`);
}

async function linkExistingStaff(userId, employeeCode, email, displayName) {
  const { data: staff, error } = await admin
    .from("staff")
    .select("id, user_id, full_name, email")
    .eq("employee_code", employeeCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to read staff ${employeeCode}: ${error.message}`);
  if (!staff) throw new Error(`No staff row for employee_code ${employeeCode}`);

  // Clear any other staff row already pointing at this user.
  const { error: clearError } = await admin
    .from("staff")
    .update({ user_id: null })
    .eq("user_id", userId)
    .neq("id", staff.id);
  if (clearError) throw new Error(`Failed to clear prior staff links: ${clearError.message}`);

  const { error: updateError } = await admin
    .from("staff")
    .update({
      user_id: userId,
      email,
      status: "active",
      deleted_at: null,
    })
    .eq("id", staff.id);
  if (updateError) throw new Error(`Failed to link staff ${employeeCode}: ${updateError.message}`);

  console.log(`  Linked staff ${employeeCode} (${staff.full_name ?? displayName}) → user`);
  return staff.id;
}

async function ensureHrStaff(userId, persona, homeLocationId) {
  const code = persona.createStaffCode;
  const payload = {
    user_id: userId,
    employee_code: code,
    full_name: persona.displayName,
    job_title: persona.jobTitle,
    department: persona.department,
    location_id: homeLocationId,
    email: persona.email,
    staff_role: persona.staffRole,
    status: "active",
    deleted_at: null,
  };

  const { data: byCode, error: codeError } = await admin
    .from("staff")
    .select("id")
    .eq("employee_code", code)
    .maybeSingle();
  if (codeError) throw new Error(`Failed to read HR staff: ${codeError.message}`);

  if (byCode) {
    const { error } = await admin.from("staff").update(payload).eq("id", byCode.id);
    if (error) throw new Error(`Failed to update HR staff: ${error.message}`);
    console.log(`  HR staff updated (${code})`);
    return byCode.id;
  }

  const { data: created, error } = await admin.from("staff").insert(payload).select("id").single();
  if (error) throw new Error(`Failed to insert HR staff: ${error.message}`);
  console.log(`  HR staff inserted (${code})`);
  return created.id;
}

async function verifySignIn(credentials) {
  if (!anonKey) {
    console.warn(
      "Skipping sign-in verify: set NEXT_PUBLIC_SUPABASE_ANON_KEY (or PUBLISHABLE_KEY) in .env.local.",
    );
    return;
  }
  const browser = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log(`\nVerifying signInWithPassword (anon key) against ${url}…`);
  for (const row of credentials) {
    const { data, error } = await browser.auth.signInWithPassword({
      email: row.email,
      password: row.password,
    });
    if (error || !data.user) {
      throw new Error(`Sign-in verify failed for ${row.email}: ${error?.message ?? "no user"}`);
    }
    console.log(`  OK ${row.email}`);
    await browser.auth.signOut();
  }
}

async function main() {
  const pw = resolvePassword();
  console.log(`Seeding role personas on ${url}`);
  if (pw.mode === "rotate") {
    console.log("Password mode: --rotate (unique strong password per account; stdout only).");
  } else if (pw.mode === "env") {
    console.log("Password mode: ROLE_PERSONA_PASSWORD (shared stable).");
  } else {
    console.log(`Password mode: stable shared UAT default (${DEFAULT_UAT_PASSWORD}).`);
    console.log("Pass --rotate to mint unique passwords, or set ROLE_PERSONA_PASSWORD.");
  }

  console.log("Loading locations…");
  const allActive = await loadAllActiveLocations();
  const credentials = [];

  for (const persona of PERSONAS) {
    console.log(`\n[${persona.key}] ${persona.displayName} <${persona.email}>`);
    const { locationIds, locationLabel, homeLocationId } = await resolveLocationIds(persona, allActive);
    const password = pw.shared ?? strongPassword();

    const userId = await ensureAuthUser(persona, password);
    await ensureProfile(userId, persona);
    await ensureRole(userId, persona, locationIds);

    if (persona.staffEmployeeCode) {
      await linkExistingStaff(userId, persona.staffEmployeeCode, persona.email, persona.displayName);
    } else if (persona.createStaffCode) {
      await ensureHrStaff(userId, persona, homeLocationId);
    }

    credentials.push({
      login: persona.key,
      email: persona.email,
      password,
      role: persona.role,
      locations: locationLabel,
      access: persona.access,
    });
  }

  await verifySignIn(credentials);

  console.log("\n========== ROLE PERSONA CREDENTIALS ==========");
  console.log("| Login | Email | Password | Role | Locations |");
  console.log("|-------|-------|----------|------|-----------|");
  for (const row of credentials) {
    console.log(
      `| ${row.login} | ${row.email} | ${row.password} | ${row.role} | ${row.locations} |`,
    );
  }
  console.log("\nAccess summaries:");
  for (const row of credentials) {
    console.log(`  ${row.email}: ${row.access}`);
  }
  console.log("\nSign in at /auth. Employee shortcut: /employee → /hr/me");
  console.log("CEO admin@fec.com was not modified.");
  console.log("Role personas seed complete.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
