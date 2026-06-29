/**
 * Import staff directory and shift roster from user-friendly CSV templates.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-staff-roster.mjs --staff demo-data/templates/staff_import_template.csv
 *   node --env-file=.env.local scripts/import-staff-roster.mjs --roster demo-data/templates/roster_weekly_template.csv --month 2026-06
 *   node --env-file=.env.local scripts/import-staff-roster.mjs --roster demo-data/templates/roster_dated_template.csv
 *   node --env-file=.env.local scripts/import-staff-roster.mjs --staff ... --roster ... --month 2026-06 --dry-run
 *
 * Options:
 *   --staff <path>     Staff CSV (see demo-data/templates/staff_import_template.csv)
 *   --roster <path>    Roster CSV — weekly (weekday column) or dated (date column)
 *   --month YYYY-MM    Expand weekly roster for this month (required for weekly templates)
 *   --dry-run          Validate and print counts only
 *   --skip-auth        Skip auth user creation (staff still imported; logins must exist)
 */
import { createClient } from "@supabase/supabase-js";

import { readCsvFile } from "./lib/csv-utils.mjs";
import {
  ROLE_LEVELS,
  expandWeeklyRoster,
  parseDatedRosterRows,
  parseStaffRows,
  shiftUuid,
  staffUuid,
  toQatarIso,
} from "./lib/staff-import.mjs";

const DEMO_PASSWORD = "Demo@FEC2026!";
const BATCH = 200;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipAuth = args.includes("--skip-auth");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const staffPath = argValue("--staff");
const rosterPath = argValue("--roster");
const monthArg = argValue("--month");

if (!staffPath && !rosterPath) {
  console.error("Provide --staff and/or --roster CSV path. See demo-data/STAFF_IMPORT_GUIDE.md");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!url || !serviceKey)) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = dryRun
  ? null
  : createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function upsertBatch(table, rows, onConflict = "id") {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await admin.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
  }
}

async function loadLocations() {
  const { data, error } = await admin.from("locations").select("id, code").eq("status", "active");
  if (error) throw error;
  const map = new Map();
  for (const loc of data ?? []) map.set(loc.code, loc.id);
  return map;
}

async function ensureAuthUser(email, displayName) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = listed.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError) throw createError;
  return created.user.id;
}

async function main() {
  let staffRows = [];
  let rosterRows = [];

  if (staffPath) {
    staffRows = parseStaffRows(readCsvFile(staffPath));
  }

  if (rosterPath) {
    const raw = readCsvFile(rosterPath);
    const hasWeekday = raw.some((r) => r.weekday);
    const hasDate = raw.some((r) => r.date || r.shift_date);
    if (hasWeekday) {
      if (!monthArg) {
        console.error("Weekly roster CSV requires --month YYYY-MM");
        process.exit(1);
      }
      const [year, month] = monthArg.split("-").map(Number);
      rosterRows = expandWeeklyRoster(raw, year, month);
    } else if (hasDate) {
      rosterRows = parseDatedRosterRows(raw);
    } else {
      console.error("Roster CSV must include weekday (weekly) or date/shift_date (dated) column");
      process.exit(1);
    }
  }

  const summary = { staff: staffRows.length, shifts: rosterRows.length };

  if (dryRun) {
    console.log("Dry run — would import:");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const locByCode = await loadLocations();
  for (const code of new Set([...staffRows, ...rosterRows].map((r) => r.location_code))) {
    if (!locByCode.has(code)) {
      throw new Error(`Location "${code}" not found. Run: npm run seed:locations`);
    }
  }

  const profileIdMap = new Map();
  const staffByCode = new Map();

  if (staffRows.length) {
    if (!skipAuth) {
      for (const s of staffRows.filter((x) => x.create_login)) {
        const authId = await ensureAuthUser(s.email, s.full_name);
        profileIdMap.set(s.employee_code, authId);
      }
      if (profileIdMap.size) {
        console.log(`Ensured ${profileIdMap.size} auth user(s).`);
      }
    }

    const profiles = staffRows
      .filter((s) => profileIdMap.has(s.employee_code))
      .map((s) => ({
        id: profileIdMap.get(s.employee_code),
        display_name: s.full_name,
        employee_code: s.employee_code,
        phone: s.phone,
        preferred_language: "en",
      }));
    if (profiles.length) {
      await upsertBatch("profiles", profiles);
      console.log(`Upserted ${profiles.length} profile(s).`);
    }

    const userRoles = staffRows
      .filter((s) => profileIdMap.has(s.employee_code) && s.app_role)
      .map((s) => ({
        id: staffUuid(`role:${s.employee_code}`),
        user_id: profileIdMap.get(s.employee_code),
        role: s.app_role,
        role_level: ROLE_LEVELS[s.app_role] ?? 25,
        location_ids: [locByCode.get(s.location_code)],
      }));
    if (userRoles.length) {
      await upsertBatch("user_roles", userRoles);
      console.log(`Upserted ${userRoles.length} user_role(s).`);
    }

    const staffDb = staffRows.map((s) => ({
      id: staffUuid(s.employee_code),
      location_id: locByCode.get(s.location_code),
      user_id: profileIdMap.get(s.employee_code) ?? null,
      employee_code: s.employee_code,
      full_name: s.full_name,
      job_title: s.job_title,
      department: s.department,
      hire_date: s.hire_date,
      status: s.status,
      phone: s.phone,
      email: s.email,
    }));
    await upsertBatch("staff", staffDb);
    for (const s of staffDb) staffByCode.set(s.employee_code, s);
    console.log(`Upserted ${staffDb.length} staff record(s).`);
  }

  if (rosterRows.length) {
    if (!staffByCode.size) {
      const codes = [...new Set(rosterRows.map((r) => r.employee_code))];
      const { data, error } = await admin
        .from("staff")
        .select("id, employee_code, location_id, user_id, job_title")
        .in("employee_code", codes)
        .is("deleted_at", null);
      if (error) throw error;
      for (const s of data ?? []) staffByCode.set(s.employee_code, s);
      const missing = codes.filter((c) => !staffByCode.has(c));
      if (missing.length) {
        throw new Error(`Roster references unknown employee_code(s): ${missing.join(", ")}. Import staff first.`);
      }
    }

    const shifts = rosterRows.map((r) => {
      const st = staffByCode.get(r.employee_code);
      const starts_at = toQatarIso(r.date, r.start_time);
      const ends_at = toQatarIso(r.date, r.end_time);
      return {
        id: shiftUuid(r.employee_code, starts_at),
        location_id: locByCode.get(r.location_code),
        user_id: st?.user_id ?? null,
        role_label: r.role_label || st?.job_title || null,
        starts_at,
        ends_at,
        status: r.status || "scheduled",
      };
    });
    await upsertBatch("shifts", shifts);
    console.log(`Upserted ${shifts.length} shift(s) (roster).`);
  }

  console.log("\nImport complete.");
  console.log(JSON.stringify(summary, null, 2));
  if (!skipAuth && profileIdMap.size) {
    console.log(`\nNew login password (if users were created): ${DEMO_PASSWORD}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
