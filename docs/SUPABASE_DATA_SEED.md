# Supabase data seeding (FEC-OS)

Project: **lexpbagpnenvgawjljwa** (`NEXT_PUBLIC_SUPABASE_URL` in `.env.local`).

Use **`SESSION_POOLER_DATABASE_URL`** for `npm run db:push` and direct SQL (Session pooler from Supabase Dashboard ? Connect). On Windows, the direct `DATABASE_URL` host often fails; the pooler is preferred.

## What lives where

| Source | Data |
|--------|------|
| **SQL migrations** (`npm run db:push`) | Schema + one-time seed rows: Qatar locations patch, inventory sock variants (`20260628120000_inventory_socks_variants.sql`), **61 real staff** + departments (`20260629180000_staff_directory_replace.sql`, `20260629200000_staff_master_departments.sql`), maintenance/inventory DDL, etc. Migrations are tracked in `public.schema_migrations` and are **not re-applied** once recorded. |
| **seed:locations** | Activates the 6 Qatar FEC venues by code; closes legacy non-Qatar location codes. |
| **seed:admin** | Auth user **admin@fec.com** / **123456**, `ceo` role (level 100). |
| **seed:supervisors** | Six `branch_gm` test accounts `@fec.test`, password **FecTest2026!**, linked to real staff employee codes. |
| **seed:maintenance-logistics** | Maintenance/logistics test accounts `@fec.test`, password **FecTest2026!**. |
| **seed:e3-compliance** | ~144 rows in `e3_compliance_items` (idempotent upsert). |
| **seed:demo** | Synthetic **June 2026** ops data: attractions, assets, shifts, transactions, work orders, tickets, etc. Matches existing location **codes** (not demo UUIDs). Adds 45 fictional staff rows alongside the 61 imported staff. Demo auth password: **Demo@FEC2026!** (`gm@fec.qa`, `ops@fec.qa`, branch managers, etc.). |
| **import:staff** | Re-import staff/roster from CSV templates (use if migration staff missing after a partial deploy). |
| **seed-attendance-ingest-sample.mjs** | POSTs sample payloads to `/api/attendance-ingest`; needs **running Next app** and server-side `ATTENDANCE_INGEST_API_KEY`. |

## Fresh Supabase (schema empty)

```bash
# .env.local: SUPABASE_SERVICE_ROLE_KEY, SESSION_POOLER_DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL

npm run db:push              # all migrations (includes 61 staff + inventory seeds)
npm run seed:all             # locations, admin, supervisors, maintenance, e3, demo

# Or step by step:
npm run seed:locations
npm run seed:admin
npm run seed:supervisors
npm run seed:maintenance-logistics
npm run seed:e3-compliance
npm run seed:demo            # optional for dashboards; skip with seed:all --skip-demo
```

Production (**fec-os.vercel.app**) uses the same Supabase project when Vercel env vars point at `lexpbagpnenvgawjljwa`. Seeding the database updates production immediately; no separate “prod DB” if env matches.

## Re-seed anytime (idempotent scripts)

```bash
npm run db:push              # only pending migrations
npm run seed:all
npm run seed:all -- --skip-demo   # reference data + auth only
```

Individual scripts are safe to re-run (admin/supervisors/maintenance/e3/locations are idempotent).

## If schema exists but **staff (61)** is empty

Migration `20260629180000_staff_directory_replace.sql` already applied in `schema_migrations` will **not** run again via `db:push`. Options:

1. Run `npm run import:staff` with your staff CSV (see `demo-data/templates/staff_import_template.csv`), or  
2. Manually re-execute the INSERT section from that migration in the SQL editor (destructive: deletes existing `staff` first), or  
3. Remove that version from `schema_migrations` and run `db:push` again (only on a throwaway DB).

## Manual / not in seeds

- Historical production transactions, bookings, or HR exports not in repo CSVs  
- `supervisor_kpis` / extra CSV prototypes under `demo-data/` (no tables)  
- Attendance ingest samples (needs live API)  
- File uploads (compliance documents, photos) in Supabase Storage  
- Vercel env: ensure `ATTENDANCE_INGEST_API_KEY` matches `.env.local` if using ingest API on production

## Verify counts (example)

```bash
node --env-file=.env.local scripts/verify-db-counts.mjs

-- SELECT 'staff', count(*) FROM staff;
-- SELECT 'locations', count(*) FROM locations WHERE status = 'active';
```

Expected after full seed (approx.): **61+ demo staff (106 if demo ran)**, **6 active locations**, **14 inventory_items**, **996 shifts** (with demo), **admin@fec.com** in `auth.users`.

## Login summary (seeded)

| Account | Password | Role |
|---------|----------|------|
| admin@fec.com | 123456 | ceo |
| *@fec.test (supervisors/maintenance) | FecTest2026! | branch_gm / tech_supervisor / technician |
| Demo corporate/branch users | Demo@FEC2026! | various (`seed:demo`) |

Change passwords in Supabase Auth after first login in production.

