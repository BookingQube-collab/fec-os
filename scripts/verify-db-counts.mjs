import pg from "pg";
const tables = ["locations","staff","master_departments","inventory_items","profiles","shifts","work_orders","e3_compliance_items"];
const c = new pg.Client({ connectionString: process.env.SESSION_POOLER_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
for (const t of tables) {
  const r = await c.query(`SELECT count(*)::int n FROM public.${t}`);
  console.log(t, r.rows[0].n);
}
const active = await c.query("SELECT count(*)::int n FROM locations WHERE status='active'");
console.log("locations_active", active.rows[0].n);
await c.end();
