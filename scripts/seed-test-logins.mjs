/**
 * Creates (or refreshes) UAT logins for procurement, HR, and department-head testing.
 * Idempotent — safe to re-run. Does not change admin@fec.com or existing
 * supervisor / maintenance @fec.test passwords.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Usage: node --env-file=.env.local scripts/seed-test-logins.mjs
 */
import { createClient } from "@supabase/supabase-js";

const TEST_PASSWORD = "FecTest2026!";

const ROLE_LEVELS = {
  ceo: 100,
  coo: 95,
  cfo: 90,
  regional_ops: 80,
  branch_gm: 70,
  duty_manager: 60,
  hr: 55,
  tech_supervisor: 50,
  auditor: 40,
  technician: 30,
  cashier_host: 20,
  customer_service: 45,
};

/** Never create, update, or reset these accounts. */
const PROTECTED_EMAILS = new Set([
  "admin@fec.com",
  "mary.supervisor@fec.test",
  "ashfaq.supervisor@fec.test",
  "rosebelt.supervisor@fec.test",
  "romel.supervisor@fec.test",
  "zaryab.supervisor@fec.test",
  "waqar.supervisor@fec.test",
  "lead.maintenance@fec.test",
  "hannan.maintenance@fec.test",
  "warehouse.logistics@fec.test",
]);

const CORPORATE_DEPARTMENTS = [
  { name: "IT", code: "IT", sort_order: 260 },
  { name: "Site Operations", code: "SITE_OPS", sort_order: 270 },
  { name: "HR", code: "HR", sort_order: 280 },
  { name: "Finance", code: "FIN", sort_order: 290 },
];

/**
 * New UAT personas. Requester + dept head share IT so PR routing has a real
 * department pair. Existing supervisor / maintenance / CEO accounts are listed
 * at the end of this script — they are not created here.
 */
const ACCOUNTS = [
  {
    email: "pr.requester@fec.test",
    displayName: "Lina Al-Suwaidi",
    employeeCode: "UAT-PR-REQ",
    role: "cashier_host",
    staffRole: "cashier",
    jobTitle: "Procurement Coordinator",
    departmentName: "IT",
    locationCodes: ["UA-DM"],
    note: "Creates PRs and sees own requests. Cannot approve (not owner / no approve_* cap).",
  },
  {
    email: "dept.head@fec.test",
    displayName: "Omar Al-Kuwari",
    employeeCode: "UAT-IT-HD",
    role: "duty_manager",
    staffRole: "other",
    jobTitle: "IT Department Head",
    departmentName: "IT",
    locationScope: "all",
    note: "Dept-head PR step only (procurement.approve_dept). Same department as requester.",
  },
  {
    email: "hr@fec.test",
    displayName: "Mariam Al-Attiyah",
    employeeCode: "UAT-HR",
    role: "hr",
    staffRole: "other",
    jobTitle: "HR Manager",
    departmentName: "HR",
    locationScope: "all",
    note: "People / attendance / performance as allowed by hr capabilities.",
  },
  {
    email: "finance.approver@fec.test",
    displayName: "Khalid Al-Mahmoud",
    employeeCode: "UAT-FIN",
    role: "cfo",
    staffRole: "other",
    jobTitle: "Finance Manager",
    departmentName: "Finance",
    locationScope: "all",
    note: "PR finance sign-off (procurement.finance). role_level 90 = estate-wide.",
  },
];

const EXISTING_REFERENCE = [
  {
    email: "admin@fec.com",
    password: "123456",
    role: "ceo",
    department: "Corporate",
    note: "Existing seed:admin — CEO / GM / configure / any PR step including finance.",
  },
  {
    email: "waqar.supervisor@fec.test",
    password: TEST_PASSWORD,
    role: "branch_gm",
    department: "OverAll (UA-DM / KDS-DM)",
    note: "Existing seed:supervisors — GM PR step + daily ops at Urban Arena / Kids Doha Mall.",
  },
  {
    email: "mary.supervisor@fec.test",
    password: TEST_PASSWORD,
    role: "branch_gm",
    department: "Inflatapark (INF-CC)",
    note: "Existing seed:supervisors — site supervisor / daily ops / GM PR step at Inflatapark.",
  },
  {
    email: "lead.maintenance@fec.test",
    password: TEST_PASSWORD,
    role: "tech_supervisor",
    department: "Maintenance (estate)",
    note: "Existing seed:maintenance-logistics — WO / PM / requests / logistics.",
  },
  {
    email: "hannan.maintenance@fec.test",
    password: TEST_PASSWORD,
    role: "technician",
    department: "Maintenance (UA-DM)",
    note: "Existing seed:maintenance-logistics — technician work orders / request handling.",
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

async function loadAllActiveLocations() {
  const { data, error } = await admin
    .from("locations")
    .select("id, code")
    .eq("status", "active")
    .order("code");
  if (error) throw new Error(`Failed to load active locations: ${error.message}`);
  if (!data?.length) throw new Error("No active locations found — run seed:locations first.");
  return data;
}

async function ensureCorporateDepartments() {
  const { data: existing, error } = await admin.from("master_departments").select("id, name");
  if (error) throw new Error(`Failed to read master_departments: ${error.message}`);

  const byName = new Map((existing ?? []).map((row) => [row.name.toLowerCase(), row]));

  for (const dept of CORPORATE_DEPARTMENTS) {
    const found = byName.get(dept.name.toLowerCase());
    if (found) {
      console.log(`  Department exists: ${dept.name}`);
      continue;
    }
    const { data: created, error: insertError } = await admin
      .from("master_departments")
      .insert(dept)
      .select("id, name")
      .single();
    if (insertError) {
      const { data: raced } = await admin
        .from("master_departments")
        .select("id, name")
        .ilike("name", dept.name)
        .maybeSingle();
      if (!raced) throw new Error(`Failed to insert department ${dept.name}: ${insertError.message}`);
      byName.set(raced.name.toLowerCase(), raced);
      console.log(`  Department exists (race): ${raced.name}`);
      continue;
    }
    byName.set(created.name.toLowerCase(), created);
    console.log(`  Inserted department: ${created.name}`);
  }

  return byName;
}

async function resolveLocationIds(account, allActive) {
  if (account.locationScope === "all") {
    return { locationIds: allActive.map((row) => row.id), locationLabel: allActive.map((row) => row.code).join(", ") };
  }
  const wanted = account.locationCodes ?? [];
  const map = new Map(allActive.map((row) => [row.code, row.id]));
  const missing = wanted.filter((code) => !map.has(code));
  if (missing.length) {
    throw new Error(`Missing location codes: ${missing.join(", ")}`);
  }
  return {
    locationIds: wanted.map((code) => map.get(code)),
    locationLabel: wanted.join(", "),
    homeLocationId: wanted[0] ? map.get(wanted[0]) : allActive[0].id,
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
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: account.displayName },
    });
    if (updateError) {
      throw new Error(`Failed to update auth user ${account.email}: ${updateError.message}`);
    }
    console.log(`  Auth user exists: ${account.email} (${userId})`);
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
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (readError) throw new Error(`Failed to read profile: ${readError.message}`);

  const payload = {
    display_name: account.displayName,
    employee_code: account.employeeCode,
  };

  if (existing) {
    const { error: updateError } = await admin.from("profiles").update(payload).eq("id", userId);
    if (updateError) throw new Error(`Failed to update profile: ${updateError.message}`);
    console.log(`  Updated profile (${account.employeeCode})`);
    return;
  }

  const { error: insertError } = await admin.from("profiles").insert({ id: userId, ...payload });
  if (insertError) throw new Error(`Failed to insert profile: ${insertError.message}`);
  console.log(`  Inserted profile (${account.employeeCode})`);
}

async function ensureRole(userId, account, locationIds) {
  const roleLevel = ROLE_LEVELS[account.role];
  if (roleLevel == null) throw new Error(`Unknown role ${account.role}`);

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
    return;
  }

  const { error: insertError } = await admin.from("user_roles").insert(payload);
  if (insertError) throw new Error(`Failed to grant role: ${insertError.message}`);
  console.log(`  Granted ${account.role} (level ${roleLevel})`);
}

async function ensureStaff(userId, account, locationId, department) {
  const { data: byCode, error: codeError } = await admin
    .from("staff")
    .select("id, user_id")
    .eq("employee_code", account.employeeCode)
    .maybeSingle();
  if (codeError) throw new Error(`Failed to read staff by code: ${codeError.message}`);

  let staff = byCode;
  if (!staff) {
    const { data: byUser, error: userError } = await admin
      .from("staff")
      .select("id, user_id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (userError) throw new Error(`Failed to read staff by user: ${userError.message}`);
    staff = byUser;
  }

  const payload = {
    user_id: userId,
    employee_code: account.employeeCode,
    full_name: account.displayName,
    job_title: account.jobTitle,
    department: department.name,
    location_id: locationId,
    email: account.email,
    staff_role: account.staffRole,
    status: "active",
    deleted_at: null,
  };

  let staffId;
  if (staff) {
    const { error: updateError } = await admin.from("staff").update(payload).eq("id", staff.id);
    if (updateError) throw new Error(`Failed to update staff: ${updateError.message}`);
    staffId = staff.id;
    console.log(`  Updated staff row (${account.employeeCode})`);
  } else {
    const { data: created, error: insertError } = await admin
      .from("staff")
      .insert(payload)
      .select("id")
      .single();
    if (insertError) throw new Error(`Failed to insert staff: ${insertError.message}`);
    staffId = created.id;
    console.log(`  Inserted staff row (${account.employeeCode})`);
  }

  const { error: delError } = await admin.from("staff_departments").delete().eq("staff_id", staffId);
  if (delError) throw new Error(`Failed to clear staff_departments: ${delError.message}`);

  const { error: linkError } = await admin
    .from("staff_departments")
    .insert({ staff_id: staffId, department_id: department.id });
  if (linkError) throw new Error(`Failed to link staff department: ${linkError.message}`);
  console.log(`  Linked staff → ${department.name}`);
}

async function main() {
  console.log("Ensuring corporate departments…");
  const deptMap = await ensureCorporateDepartments();

  console.log("Loading active locations…");
  const allActive = await loadAllActiveLocations();
  const uaDm = allActive.find((row) => row.code === "UA-DM");
  if (!uaDm) throw new Error("UA-DM location missing — run seed:locations first.");

  const results = [];

  for (const account of ACCOUNTS) {
    console.log(`\n${account.displayName} <${account.email}>`);
    const { locationIds, locationLabel } = await resolveLocationIds(account, allActive);
    const department = deptMap.get(account.departmentName.toLowerCase());
    if (!department) throw new Error(`Department not found: ${account.departmentName}`);

    const userId = await ensureAuthUser(account);
    await ensureProfile(userId, account);
    await ensureRole(userId, account, locationIds);
    // UAT personas stay as auth/profile/role only — do not add them to the E3 employee roster.

    results.push({
      email: account.email,
      name: account.displayName,
      role: account.role,
      department: account.departmentName,
      locations: locationLabel,
      note: account.note,
    });
  }

  console.log("\n--- UAT test logins ---");
  console.log(`Shared @fec.test password: ${TEST_PASSWORD}`);
  console.log("Sign in at /auth (http://localhost:3000/auth)\n");

  console.log("Created / refreshed:");
  for (const row of results) {
    console.log(`  ${row.email}\t${row.role}\t${row.department}\t${row.note}`);
  }

  console.log("\nReuse existing (not modified by this script):");
  for (const row of EXISTING_REFERENCE) {
    console.log(`  ${row.email}\t${row.password}\t${row.role}\t${row.note}`);
  }

  console.log("\nPR cycle: requester → dept.head (IT) → waqar.supervisor (GM if > QAR 5,000) → admin (CEO if > QAR 20,000) → finance.approver.");
  console.log("Test logins seed complete.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
