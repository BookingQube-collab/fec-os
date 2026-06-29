# Database

PostgreSQL on Supabase. Schema evolves via versioned SQL in `supabase/migrations/`.

## Migration workflow

1. Add `YYYYMMDDHHMMSS_description.sql` under `supabase/migrations/`.
2. Run `npm run db:push` (uses `scripts/push-migrations.mjs`).
3. Applied versions are recorded in `public.schema_migrations`.

**Do not remove applied migrations.** Only abandoned *unapplied* files may be deleted after team confirmation.

## Current status (2026-06-27, Pass 2)

- **51** migration files on disk
- **48** applied to remote (last verified Pass 1)
- **3 pending** (legitimate — do not delete):
  - `20260627130000_expiry_horizon_30_days.sql`
  - `20260627140000_daily_ops_roster.sql`
  - `20260627160000_weekly_operations_reporting.sql` *(new since Pass 1)*

Run `npm run db:push` to apply pending migrations.

## Major modules (applied)

| Migration prefix | Module |
|------------------|--------|
| `20260615120000` | Compliance documents |
| `20260620120000–190000` | KPI, SOP, attendance, snags, vendors, compliance calendar, notifications, inventory |
| `20260621120000–140000` | AMC scheduler, smart maintain, compliance ops |
| `20260622120000–180000` | AMC dedupe, performance indexes, dashboard KPIs, compliance RPC |
| `20260623120000` | E3 compliance tracker |
| `20260626120000` | Daily operations |
| `20260627120000` | E3 tracker phase 5 |
| `20260627160000` | Weekly operations reporting *(pending)* |

## Notable RPCs

- `get_compliance_kpis(p_location_id)` — dashboard compliance KPI strip
- Various dashboard/chart aggregations added in `20260622150000` and related index migrations

## Index overlap (report only — applied migrations unchanged)

These pairs may overlap in query coverage; review before adding new indexes:

| Indexes | Notes |
|---------|-------|
| `idx_compliance_events_due` vs `idx_compliance_events_due_type_status` | Second adds type/status columns |
| `idx_shifts_location_starts` vs `idx_shifts_location_starts_staff` | Roster migration adds staff_id |
| Multiple `20260622160000_*` same timestamp | Three distinct files; all applied |

## Types

Regenerate Supabase types when schema changes:

```bash
npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
```

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — stack and request flow
- [API.md](./API.md) — HTTP route reference
- [BOOKINGQUBE.md](./BOOKINGQUBE.md) — `financial_snapshots` revenue writes
