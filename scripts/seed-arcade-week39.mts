/**
 * Loads the week-39 Magic Table damage report and the August 2026 maintenance
 * workbook into the arcade tables the admin panel reads.
 *
 * Usage: node --experimental-strip-types --env-file=.env.local scripts/seed-arcade-week39.mts
 */
import { createRequire } from "node:module";

import { createClient } from "@supabase/supabase-js";

import { applyArcadeWorkbookPlan } from "../src/lib/arcade/apply-workbook.ts";
import { gridFromSheet, parseArcadeWorkbooks } from "../src/lib/arcade/workbook-import.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const DAMAGE = "A:/Weekly Meeting/week39/MACHINE DAMAGE REPORT  (Magic Table).xlsx";
const AUGUST = "A:/Weekly Meeting/week39/E3 Monthly Maintenance Report (August).xlsx";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

function grids(path: string) {
  const book = XLSX.readFile(path, { cellDates: true });
  return book.SheetNames.map((name) => gridFromSheet(name, book.Sheets[name] ?? {}));
}

const damage = grids(DAMAGE)[0];
const plan = parseArcadeWorkbooks({ damage, maintenance: grids(AUGUST) });
console.log(
  `Parsed ${plan.machines.length} machines, ${plan.damage.length} damage, ${plan.maintenance.length} maintenance, ${plan.parts.length} parts, ${plan.unmapped.length} unmapped.`,
);
if (plan.unmapped.length) {
  for (const row of plan.unmapped) console.log(`  unmapped: ${row.name} @ ${row.locationText || "—"} (${row.reason})`);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const result = await applyArcadeWorkbookPlan(admin, plan, null);
console.log(JSON.stringify({
  machinesCreated: result.machinesCreated,
  machinesExisting: result.machinesExisting,
  suppliersAttached: result.suppliersAttached,
  damageCreated: result.damageCreated,
  maintenanceCreated: result.maintenanceCreated,
  partsCreated: result.partsCreated,
  skipped: result.skipped,
  failures: result.failures,
  headline: result.headline,
}, null, 2));
if (result.failures.length) {
  console.error(`Completed with ${result.failures.length} row failure(s).`);
  process.exit(1);
}
process.exit(0);
