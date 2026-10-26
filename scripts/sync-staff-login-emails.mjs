/**
 * One-time (idempotent) sync: push public.staff.email → auth.users.email for linked staff.
 *
 * Why: Payslips are opened in-app via staff.user_id after login. Sign-in uses auth email.
 * Roster / payslip contact uses staff.email. After HR revises staff.email (People roster or CSV),
 * run this so the next login (and email fan-out that resolves staff.email) uses the new address.
 *
 * Prerequisites:
 *   1. Put the revised addresses on staff.email (People → edit staff), OR pass --csv.
 *   2. Staff who need app access must already have a login (staff.user_id set).
 *
 * Usage (PowerShell-friendly):
 *   node --env-file=.env.local scripts/sync-staff-login-emails.mjs
 *   node --env-file=.env.local scripts/sync-staff-login-emails.mjs --apply
 *   node --env-file=.env.local scripts/sync-staff-login-emails.mjs --csv "C:\path\email-revision.csv"
 *   node --env-file=.env.local scripts/sync-staff-login-emails.mjs --csv "C:\path\email-revision.csv" --apply
 *
 * CSV columns (header row required): employee_code,email
 *   Optional aliases: code / staff_code for employee_code; new_email for email.
 *   When --csv is used, staff.email is updated first, then auth is synced.
 *
 * Default is dry-run. Pass --apply to write.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { parseCsv } from "./lib/csv-utils.mjs";

const APPLY = process.argv.includes("--apply");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const csvPath = argValue("--csv");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed || !EMAIL_RE.test(trimmed) || trimmed.length > 200) return null;
  return trimmed;
}

async function listAuthUsersByEmail() {
  const byEmail = new Map();
  const byId = new Map();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const user of data.users) {
      const email = (user.email ?? "").trim().toLowerCase();
      byId.set(user.id, email || null);
      if (email && !byEmail.has(email)) byEmail.set(email, user.id);
    }
    if (!data.users.length || data.users.length < 200) break;
  }
  return { byEmail, byId };
}

function planRow(row, authByEmail, authById) {
  if (!row.user_id) return { action: "skip_no_login" };
  const raw = (row.email ?? "").trim();
  if (!raw) return { action: "skip_no_email" };
  const email = parseEmail(raw);
  if (!email) return { action: "skip_invalid_email", staffEmail: raw };
  const previous = authById.get(row.user_id) ?? null;
  if (previous === email) return { action: "skip_already_matched", email };
  const takenBy = authByEmail.get(email);
  if (takenBy && takenBy !== row.user_id) {
    return { action: "conflict_taken", email, takenByUserId: takenBy };
  }
  return { action: "update_auth", email, previousEmail: previous };
}

function loadCsvRevisions(path) {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const map = new Map();
  for (const row of rows) {
    const code = (
      row.employee_code ||
      row.code ||
      row.staff_code ||
      row.employee ||
      ""
    ).trim();
    const email = parseEmail(row.email || row.new_email || row.login_email || "");
    if (!code) {
      console.warn(`  CSV skip: missing employee_code in row ${JSON.stringify(row)}`);
      continue;
    }
    if (!email) {
      console.warn(`  CSV skip: invalid email for ${code}`);
      continue;
    }
    map.set(code.toUpperCase(), email);
  }
  return map;
}

async function applyCsvToStaff(revisions) {
  const { data: staffRows, error } = await admin
    .from("staff")
    .select("id, employee_code, email, user_id")
    .is("deleted_at", null);
  if (error) throw error;

  const byCode = new Map();
  for (const row of staffRows ?? []) {
    const code = String(row.employee_code ?? "").trim().toUpperCase();
    if (code) byCode.set(code, row);
  }

  let updated = 0;
  let missing = 0;
  let already = 0;
  for (const [code, email] of revisions) {
    const staff = byCode.get(code);
    if (!staff) {
      missing += 1;
      console.warn(`  CSV: no staff for employee_code=${code}`);
      continue;
    }
    const current = parseEmail(staff.email) ?? "";
    if (current === email) {
      already += 1;
      continue;
    }
    console.log(
      `  ${APPLY ? "SET" : "WOULD SET"} staff.email ${staff.employee_code}: ${current || "(empty)"} → ${email}`,
    );
    if (APPLY) {
      const { error: updErr } = await admin.from("staff").update({ email }).eq("id", staff.id);
      if (updErr) throw updErr;
    }
    updated += 1;
  }
  return { updated, missing, already };
}

async function main() {
  console.log(APPLY ? "APPLY mode — writing auth (and CSV staff) emails." : "DRY-RUN — pass --apply to write.");

  if (csvPath) {
    console.log(`\nCSV revisions from ${csvPath}`);
    const revisions = loadCsvRevisions(csvPath);
    console.log(`  ${revisions.size} valid row(s)`);
    const csvResult = await applyCsvToStaff(revisions);
    console.log(
      `  staff.email: ${csvResult.updated} ${APPLY ? "updated" : "would update"}, ${csvResult.already} already ok, ${csvResult.missing} missing codes`,
    );
  } else {
    console.log("\nNo --csv: using current public.staff.email as source of truth.");
    console.log("If emails are still wrong on the roster, update People first or pass --csv.");
  }

  const { byEmail: authByEmail, byId: authById } = await listAuthUsersByEmail();
  const { data: staffRows, error } = await admin
    .from("staff")
    .select("id, employee_code, full_name, email, user_id")
    .is("deleted_at", null)
    .order("employee_code");
  if (error) throw error;

  const counts = {
    skip_no_login: 0,
    skip_no_email: 0,
    skip_invalid_email: 0,
    skip_already_matched: 0,
    update_auth: 0,
    conflict_taken: 0,
    failed: 0,
  };

  for (const row of staffRows ?? []) {
    const decision = planRow(row, authByEmail, authById);
    counts[decision.action] = (counts[decision.action] ?? 0) + 1;

    if (decision.action === "update_auth") {
      const label = `${row.employee_code ?? row.id} ${row.full_name ?? ""}`.trim();
      console.log(
        `  ${APPLY ? "UPDATE" : "WOULD UPDATE"} auth ${label}: ${decision.previousEmail ?? "(none)"} → ${decision.email}`,
      );
      if (APPLY) {
        const { error: updErr } = await admin.auth.admin.updateUserById(row.user_id, {
          email: decision.email,
          email_confirm: true,
        });
        if (updErr) {
          counts.failed += 1;
          counts.update_auth -= 1;
          console.error(`  FAILED ${label}: ${updErr.message}`);
          continue;
        }
        // Keep conflict map accurate for later rows in this run.
        if (decision.previousEmail) authByEmail.delete(decision.previousEmail);
        authByEmail.set(decision.email, row.user_id);
        authById.set(row.user_id, decision.email);
      }
    } else if (decision.action === "conflict_taken") {
      console.warn(
        `  CONFLICT ${row.employee_code}: ${decision.email} already used by ${decision.takenByUserId}`,
      );
    } else if (decision.action === "skip_invalid_email") {
      console.warn(`  INVALID email on ${row.employee_code}: ${decision.staffEmail}`);
    }
  }

  console.log("\nSummary:");
  console.log(`  already matched: ${counts.skip_already_matched}`);
  console.log(`  ${APPLY ? "auth updated" : "would update auth"}: ${counts.update_auth}`);
  console.log(`  conflicts (email taken): ${counts.conflict_taken}`);
  console.log(`  no login (user_id null): ${counts.skip_no_login}`);
  console.log(`  no staff.email: ${counts.skip_no_email}`);
  console.log(`  invalid staff.email: ${counts.skip_invalid_email}`);
  if (APPLY) console.log(`  auth failures: ${counts.failed}`);
  if (!APPLY && counts.update_auth > 0) {
    console.log("\nRe-run with --apply to write these changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
