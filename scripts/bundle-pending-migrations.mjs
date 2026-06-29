/**
 * Concatenates Sprint 1–3 migrations not yet on remote into one SQL file
 * for Supabase Dashboard → SQL Editor when CLI/pooler push is unavailable.
 *
 * Usage: node scripts/bundle-pending-migrations.mjs > pending-migrations.sql
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dir = path.join(root, "supabase", "migrations");

const sprintFiles = [
  "20260620120000_kpi_engine.sql",
  "20260620130000_sop_management.sql",
  "20260620140000_attendance_automation.sql",
  "20260620150000_snag_management.sql",
  "20260620160000_vendor_management.sql",
  "20260620170000_compliance_calendar.sql",
  "20260620180000_notification_center.sql",
  "20260620190000_inventory.sql",
  "20260621120000_amc_scheduler.sql",
];

console.log("-- FEC pending migrations bundle");
console.log("-- Run in Supabase Dashboard → SQL Editor");
console.log("BEGIN;\n");

for (const file of sprintFiles) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) {
    console.error(`-- missing ${file}`);
    continue;
  }
  console.log(`-- ========== ${file} ==========`);
  console.log(fs.readFileSync(full, "utf8"));
  console.log(`\nINSERT INTO public.schema_migrations (version) VALUES ('${file.replace(/\.sql$/, "")}') ON CONFLICT DO NOTHING;\n`);
}

console.log("COMMIT;");
