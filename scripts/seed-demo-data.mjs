/**
 * Seeds Qatar FEC June 2026 demo data into Supabase.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-demo-data.mjs   # refresh CSVs
 *   node --env-file=.env.local scripts/seed-demo-data.mjs       # insert into DB
 *
 * Options:
 *   --dry-run     Print row counts only, no DB writes
 *   --skip-auth   Skip auth user creation (profiles/user_roles need existing users)
 */
import { createClient } from "@supabase/supabase-js";
import { generateDemoData } from "./generate-demo-data.mjs";

const DEMO_PASSWORD = "Demo@FEC2026!";
const BATCH = 200;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const skipAuth = process.argv.includes("--skip-auth");

if (!dryRun && (!url || !serviceKey)) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = dryRun
  ? null
  : createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

async function upsertBatch(table, rows, onConflict = "id") {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await admin.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
  }
}

async function closeLegacyLocations(allowedCodes) {
  const { data: all, error } = await admin.from("locations").select("id, code, status");
  if (error) throw error;
  const legacy = (all ?? []).filter((r) => !allowedCodes.includes(r.code) && r.status !== "closed");
  if (!legacy.length) return 0;
  const { error: e2 } = await admin
    .from("locations")
    .update({ status: "closed" })
    .in(
      "id",
      legacy.map((r) => r.id),
    );
  if (e2) throw e2;
  return legacy.length;
}

async function ensureAuthUser(profile) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = listed.users.find((u) => u.email === profile.email);
  if (existing) return existing.id;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: profile.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: profile.display_name },
  });
  if (createError) throw createError;
  return created.user.id;
}

async function main() {
  const data = generateDemoData();
  const allowedCodes = data.locations.map((l) => l.code);

  const summary = {
    locations: data.locations.length,
    attractions: data.attractions.length,
    assets: data.assets.length,
    staff: data.staff.length,
    profiles: data.profiles.length,
    user_roles: data.userRoles.length,
    task_templates: data.taskTemplates.length,
    task_template_items: data.taskTemplateItems.length,
    task_instances: data.taskInstances.length,
    task_item_results: data.taskItemResults.length,
    shifts: data.shifts.length,
    financial_snapshots: data.financialSnapshots.length,
    transactions: data.transactions.length,
    complaints: data.complaints.length,
    tickets: data.tickets.length,
    work_orders: data.workOrders.length,
    incidents: data.incidents.length,
    purchase_orders: data.purchaseOrders.length,
    staff_leaderboard: data.staffLeaderboard.length,
    skipped_no_table: ["inventory_items", "supervisor_kpis"],
  };

  if (dryRun) {
    console.log("Dry run — row counts:");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const closed = await closeLegacyLocations(allowedCodes);
  if (closed) console.log(`Closed ${closed} legacy location(s).`);

  await upsertBatch(
    "locations",
    data.locations.map(({ surge_mode, ...l }) => l),
  );
  console.log(`Upserted ${data.locations.length} locations.`);

  const profileIdMap = new Map();

  if (!skipAuth) {
    for (const p of data.profiles.filter((x) => x.has_auth)) {
      const authId = await ensureAuthUser(p);
      profileIdMap.set(p.id, authId);
    }
    console.log(`Ensured ${profileIdMap.size} auth users.`);
  }

  const profiles = data.profiles
    .filter((p) => p.has_auth)
    .map((p) => ({
      id: profileIdMap.get(p.id) ?? p.id,
      display_name: p.display_name,
      employee_code: p.employee_code,
      phone: p.phone,
      preferred_language: p.preferred_language,
    }));

  if (profiles.length) {
    await upsertBatch("profiles", profiles);
    console.log(`Upserted ${profiles.length} profiles.`);
  }

  const remap = (id) => (id && profileIdMap.has(id) ? profileIdMap.get(id) : id);

  const userRoles = data.userRoles.map((r) => ({
    id: r.id,
    user_id: remap(r.user_id),
    role: r.role,
    role_level: r.role_level,
    location_ids: r.location_ids ? r.location_ids.split("|").filter(Boolean) : [],
  }));
  if (userRoles.length) {
    await upsertBatch("user_roles", userRoles);
    console.log(`Upserted ${userRoles.length} user_roles.`);
  }

  await upsertBatch(
    "attractions",
    data.attractions.map(({ location_code, ...r }) => r),
  );
  await upsertBatch(
    "assets",
    data.assets.map(({ location_code, ...r }) => r),
  );

  const staff = data.staff.map(({ location_code, qid: _qid, app_role: _role, email, ...r }) => ({
    ...r,
    user_id: remap(r.user_id),
    email,
  }));
  await upsertBatch("staff", staff);
  console.log(`Upserted ${staff.length} staff.`);

  await upsertBatch(
    "task_templates",
    data.taskTemplates.map(({ location_code, ...r }) => r),
  );
  await upsertBatch(
    "task_template_items",
    data.taskTemplateItems.map(({ location_code, template_kind, ...r }) => r),
  );

  const taskInstances = data.taskInstances.map(
    ({ location_code, checklist_date, checklist_kind, ...r }) => ({
      ...r,
      assigned_to: remap(r.assigned_to),
      submitted_by: remap(r.submitted_by),
    }),
  );
  await upsertBatch("task_instances", taskInstances);

  const taskItemResults = data.taskItemResults.map((r) => ({
    ...r,
    completed_by: remap(r.completed_by),
  }));
  await upsertBatch("task_item_results", taskItemResults);
  console.log(`Upserted ${taskInstances.length} task instances.`);

  const shifts = data.shifts.map(({ location_code, employee_code, staff_name, ...r }) => ({
    ...r,
    user_id: remap(r.user_id),
  }));
  await upsertBatch("shifts", shifts);
  console.log(`Upserted ${shifts.length} shifts (attendance).`);

  await upsertBatch(
    "financial_snapshots",
    data.financialSnapshots.map(({ location_code, ebitda: _ebitda, ...r }) => r),
  );
  console.log(`Upserted ${data.financialSnapshots.length} financial_snapshots.`);

  const transactions = data.transactions.map(({ location_code, ...r }) => ({
    ...r,
    cashier_id: remap(r.cashier_id),
  }));
  await upsertBatch("transactions", transactions);
  console.log(`Upserted ${transactions.length} transactions.`);

  const complaints = data.complaints.map(({ location_code, ...r }) => r);
  await upsertBatch("complaints", complaints);

  const tickets = data.tickets.map(({ location_code, ...r }) => ({
    ...r,
    reported_by: remap(r.reported_by),
    assigned_to: remap(r.assigned_to),
  }));
  await upsertBatch("tickets", tickets);

  const workOrders = data.workOrders.map(({ location_code, ...r }) => ({
    ...r,
    assigned_to: remap(r.assigned_to),
  }));
  await upsertBatch("work_orders", workOrders);

  const incidents = data.incidents.map(({ location_code, ...r }) => ({
    ...r,
    reported_by: remap(r.reported_by),
  }));
  await upsertBatch("incidents", incidents);

  const purchaseOrders = data.purchaseOrders.map(({ location_code, ...r }) => ({
    ...r,
    requested_by: remap(r.requested_by),
  }));
  await upsertBatch("purchase_orders", purchaseOrders);

  const leaderboard = data.staffLeaderboard.map(
    ({ location_code, employee_code, staff_name, ...r }) => ({
      ...r,
      profile_id: remap(r.profile_id),
    }),
  );
  await upsertBatch("staff_leaderboard", leaderboard);

  console.log("\nSeed complete.");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nNote: inventory_items.csv and supervisor_kpis.csv have no DB tables — use for reporting/import prototypes.");
  if (!skipAuth) {
    console.log(`\nDemo auth users password: ${DEMO_PASSWORD}`);
    console.log("Emails: gm@fec.qa, ops@fec.qa, {branch-code}.bm@fec.qa pattern — see profiles.csv");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
