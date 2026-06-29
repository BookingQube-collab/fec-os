/**
 * Marks pre-Sprint-1 migrations as applied when remote DB was created
 * without schema_migrations tracking.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SPRINT1 = "20260620120000_kpi_engine";

function loadDatabaseUrl() {
  const fromEnv =
    process.env.SESSION_POOLER_DATABASE_URL ??
    process.env.POOLER_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const envPath = path.join(root, ".env.local");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    if (line.startsWith("SESSION_POOLER_DATABASE_URL=")) {
      return line.slice("SESSION_POOLER_DATABASE_URL=".length).trim();
    }
    if (line.startsWith("DATABASE_URL=")) return line.slice("DATABASE_URL=".length).trim();
  }
  throw new Error("No DATABASE_URL");
}

async function main() {
  const client = new pg.Client({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query("SELECT version FROM public.schema_migrations");
    if (rows.length > 0) {
      console.log(`schema_migrations already has ${rows.length} row(s) — skipping baseline seed.`);
      return;
    }

    const dir = path.join(root, "supabase", "migrations");
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => f < `${SPRINT1}.sql`);

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      await client.query("INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [
        version,
      ]);
      console.log(`baseline  ${file}`);
    }

    console.log(`Seeded ${files.length} baseline migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
