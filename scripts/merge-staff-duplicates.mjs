/**
 * Merge duplicate staff rows and delete the stub.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/merge-staff-duplicates.mjs
 *   node --experimental-strip-types --env-file=.env.local scripts/merge-staff-duplicates.mjs --apply
 *
 * Dry-run prints the pairs. --apply writes them in one transaction.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

import { splitSqlStatements } from "./sql-split.mjs";
import { planStaffDuplicateMerges } from "../src/lib/staff-mapped-duplicates.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const apply = process.argv.includes("--apply");
const MIGRATION = "20260929223000_merge_staff_duplicate.sql";

function loadDatabaseUrl() {
  const fromEnv = process.env.SESSION_POOLER_DATABASE_URL || process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  throw new Error("Set SESSION_POOLER_DATABASE_URL or DATABASE_URL in .env.local");
}

const client = new pg.Client({
  connectionString: loadDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const staff = await client.query(`
    SELECT id, full_name, employee_code, location_id, phone, user_id
    FROM public.staff
    WHERE deleted_at IS NULL
  `);
  const mapped = await client.query(`
    SELECT DISTINCT staff_id
    FROM public.attendance_biometric_users
    WHERE staff_id IS NOT NULL
  `);
  const attendanceMapped = new Set(mapped.rows.map((row) => row.staff_id));
  const rows = staff.rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    employee_code: row.employee_code,
    location_id: row.location_id,
    phone: row.phone,
    user_id: row.user_id,
    attendance_mapped: attendanceMapped.has(row.id),
  }));
  const plans = planStaffDuplicateMerges(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));

  console.log(`pairs ${plans.length}`);
  for (const plan of plans) {
    const keep = byId.get(plan.keepId);
    const remove = byId.get(plan.removeId);
    const links = await client.query(
      `
      SELECT
        (SELECT count(*)::int FROM public.hr_employee_documents WHERE staff_id = $1) AS documents,
        (SELECT count(*)::int FROM public.attendance_logs WHERE staff_id = $1) AS attendance_logs,
        (SELECT count(*)::int FROM public.attendance_daily_summary WHERE staff_id = $1) AS attendance_days,
        (SELECT count(*)::int FROM public.shifts WHERE staff_id = $1) AS shifts,
        (SELECT count(*)::int FROM public.staff_profile_ext WHERE staff_id = $1) AS profiles
      `,
      [plan.removeId],
    );
    const link = links.rows[0];
    console.log(
      JSON.stringify({
        name: keep?.full_name ?? remove?.full_name,
        keep: keep?.employee_code,
        remove: remove?.employee_code,
        keepHasLogin: Boolean(keep?.user_id),
        removeHasLogin: Boolean(remove?.user_id),
        documents: link.documents,
        attendance_logs: link.attendance_logs,
        attendance_days: link.attendance_days,
        shifts: link.shifts,
        profiles: link.profiles,
      }),
    );
  }

  if (!apply) {
    console.log("dry-run");
    process.exitCode = 0;
  } else {
    const sql = fs.readFileSync(path.join(root, "supabase", "migrations", MIGRATION), "utf8");
    await client.query("BEGIN");
    try {
      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement);
      }
      for (const plan of plans) {
        await client.query("SELECT public.merge_staff_into($1::uuid, $2::uuid)", [
          plan.keepId,
          plan.removeId,
        ]);
      }
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query(
        `INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
        [MIGRATION.replace(/\.sql$/, "")],
      );
      await client.query("COMMIT");
      console.log(`applied ${plans.length}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const sarah = await client.query(`
      SELECT employee_code, full_name, status, employment_type, job_title
      FROM public.staff
      WHERE deleted_at IS NULL
        AND full_name ILIKE 'sarah oxel'
      ORDER BY employee_code
    `);
    console.log("sarah_remaining", JSON.stringify(sarah.rows));
  }
} finally {
  await client.end();
}
