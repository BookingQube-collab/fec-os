/**
 * Applies pending SQL migrations when Supabase CLI db push is unavailable.
 * Usage: node scripts/push-migrations.mjs
 * Requires DATABASE_URL in .env.local or environment.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { splitSqlStatements } from "./sql-split.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadDatabaseUrl() {
  const fromEnv =
    process.env.SESSION_POOLER_DATABASE_URL ??
    process.env.POOLER_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;

  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "Set SESSION_POOLER_DATABASE_URL (IPv4 pooler from Supabase Connect) or DATABASE_URL in .env.local",
    );
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    if (line.startsWith("SESSION_POOLER_DATABASE_URL=")) {
      return line.slice("SESSION_POOLER_DATABASE_URL=".length).trim();
    }
    if (line.startsWith("DATABASE_URL=")) return line.slice("DATABASE_URL=".length).trim();
  }
  throw new Error(
    "DATABASE_URL not found. Add SESSION_POOLER_DATABASE_URL from Supabase Dashboard → Connect → Session pooler.",
  );
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedVersions(client) {
  const { rows } = await client.query("SELECT version FROM public.schema_migrations ORDER BY version");
  return new Set(rows.map((r) => r.version));
}

async function main() {
  const dbUrl = loadDatabaseUrl();
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await appliedVersions(client);

    const dir = path.join(root, "supabase", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

    let count = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        console.log(`skip  ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      console.log(`apply ${file}...`);
      try {
        for (const stmt of splitSqlStatements(sql)) {
          await client.query(stmt);
        }
        await client.query("INSERT INTO public.schema_migrations (version) VALUES ($1)", [version]);
        count += 1;
        console.log(`ok    ${file}`);
      } catch (err) {
        throw new Error(`${file}: ${err.message}`);
      }
    }

    console.log(count === 0 ? "No new migrations." : `Applied ${count} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
