/**
 * Runs database migrations and all FEC seed scripts in dependency order.
 * Usage: node --env-file=.env.local scripts/seed-all.mjs
 * Options:
 *   --skip-demo     Skip June 2026 demo operational data (seed:demo)
 *   --skip-db-push  Skip npm run db:push
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const skipDemo = process.argv.includes("--skip-demo");
const skipDbPush = process.argv.includes("--skip-db-push");

const steps = [
  ...(skipDbPush ? [] : [{ cmd: "npm", args: ["run", "db:push"], label: "db:push" }]),
  { cmd: "npm", args: ["run", "seed:locations"], label: "seed:locations" },
  { cmd: "npm", args: ["run", "seed:admin"], label: "seed:admin" },
  { cmd: "npm", args: ["run", "seed:supervisors"], label: "seed:supervisors" },
  { cmd: "npm", args: ["run", "seed:maintenance-logistics"], label: "seed:maintenance-logistics" },
  { cmd: "npm", args: ["run", "seed:e3-compliance"], label: "seed:e3-compliance" },
  ...(skipDemo ? [] : [{ cmd: "npm", args: ["run", "seed:demo"], label: "seed:demo" }]),
];

for (const { cmd, args, label } of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true, env: process.env });
  if (result.status !== 0) {
    console.error(`\n${label} failed (exit ${result.status ?? 1}).`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nAll seed steps completed.");
console.log("Optional: node --env-file=.env.local scripts/seed-attendance-ingest-sample.mjs (requires running app + API key on server)");
