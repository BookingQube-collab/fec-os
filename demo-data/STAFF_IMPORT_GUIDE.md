# Staff & Roster Import Guide — FEC Qatar

This guide explains how to bulk-import **staff** for all six branches and create their **shift roster** (schedule) in FEC-OS.

## Key concepts

| Term in FEC | Database table | What it stores |
|-------------|----------------|----------------|
| **Staff directory** | `staff` | HR record per person, linked to one `location_id` |
| **Roster / schedule** | `shifts` | Planned shift windows per staff member (`starts_at`, `ends_at`, `status`) |
| **App login** | `auth.users` + `profiles` + `user_roles` | Only needed for managers/supervisors/cashiers who sign in |

There is **no separate “roster” table**. The People → **Shifts** tab reads from `shifts`. Attendance (clock in/out) uses the same table.

### Six branches (location codes)

| Code | Attraction | Mall / area |
|------|------------|-------------|
| `KDS-CC` | Kids Driving School | City Center |
| `INF-CC` | Inflatapark | City Center |
| `UA-DM` | Urban Arena | Doha Mall |
| `CB-VM` | Crayons & Bricks | Vendome Mall |
| `CB-DSM` | Crayons & Bricks | Dar Al Salam Mall |
| `CAR-AP` | Carousel | Aspire Park |

---

## Recommended import order

1. **Locations** — ensure all six branches exist  
   `npm run seed:locations`

2. **Staff** — directory records (`staff` table)  
   Fill `demo-data/templates/staff_import_template.csv` → import (CLI or People UI)

3. **Logins (optional)** — only rows with `create_login=true` and an `app_role`  
   Use the **CLI import script** (creates `auth.users`, `profiles`, `user_roles`)

4. **Roster** — shift schedule (`shifts` table), linked by `employee_code`  
   Fill weekly or dated roster template → import with `--month` if weekly

5. **Full demo dataset (optional)** — transactions, tasks, attendance history  
   `npm run seed:demo`

---

## Option A — CLI import (recommended for bulk + logins)

Templates live in `demo-data/templates/`:

- `staff_import_template.csv` — staff directory
- `roster_weekly_template.csv` — recurring weekly pattern (expand with `--month`)
- `roster_dated_template.csv` — explicit dates (e.g. June 2026)

### Staff CSV columns

| Column | Required | Notes |
|--------|----------|-------|
| `location_code` | Yes | One of the six codes above |
| `employee_code` | Yes | Unique, e.g. `KDS-CC-STF01` |
| `full_name` | Yes | Display name |
| `job_title` | No | e.g. Attraction Operator |
| `department` | No | Default `Operations` |
| `hire_date` | No | `YYYY-MM-DD` |
| `status` | No | `active`, `on_leave`, `terminated` (default `active`) |
| `phone` | No | Qatar format `+974…` |
| `email` | No | Required if `create_login=true` |
| `qid` | No | Reference only (not stored in `staff` table) |
| `app_role` | No | `branch_gm`, `duty_manager`, `cashier_host`, etc. |
| `create_login` | No | `true`/`false` — CLI only; creates Supabase auth user |

### Roster CSV — weekly template

| Column | Required | Notes |
|--------|----------|-------|
| `location_code` | Yes | Branch code |
| `employee_code` | Yes | Must exist in `staff` |
| `weekday` | Yes | `sun`…`sat` (Qatar weekend: Fri–Sat) |
| `start_time` | No | `HH:MM` 24h, default `09:00` |
| `end_time` | No | default `17:00` |
| `role_label` | No | Defaults to staff `job_title` |

Use `--month YYYY-MM` to expand each weekday row into every matching day that month.

### Roster CSV — dated template

| Column | Required | Notes |
|--------|----------|-------|
| `location_code` | Yes | |
| `employee_code` | Yes | |
| `date` | Yes | `YYYY-MM-DD` |
| `start_time` | No | |
| `end_time` | No | |
| `role_label` | No | |
| `status` | No | Default `scheduled` |

### Commands

```bash
# 1. Ensure branches exist
npm run seed:locations

# 2. Import staff (with manager logins)
npm run import:staff -- --staff demo-data/templates/staff_import_template.csv

# 3. Build June 2026 roster from weekly template
npm run import:staff -- --roster demo-data/templates/roster_weekly_template.csv --month 2026-06

# 4. Or import explicit dated shifts
npm run import:staff -- --roster demo-data/templates/roster_dated_template.csv

# 5. Staff + roster in one run
npm run import:staff -- --staff demo-data/templates/staff_import_template.csv --roster demo-data/templates/roster_weekly_template.csv --month 2026-06

# Validate without writing
npm run import:staff -- --staff demo-data/templates/staff_import_template.csv --dry-run
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (never commit this file).

New auth users get password `Demo@FEC2026!` (printed by the script). Change in production.

---

## Option B — People page CSV upload (managers)

Branch managers and supervisors (`branch_gm`, `duty_manager`) can import from **People → Import CSV**:

- **Staff tab** — upserts `staff` rows for branches they can access (no login creation)
- **Roster tab** — creates `shifts` linked to existing `employee_code`

Download the same templates from the dialog. For logins and roles, use **Option A (CLI)**.

RBAC: data is scoped by `user_roles.location_ids`. Supervisors only see/import staff for their branch.

---

## Option C — Full demo seed

Pre-built dataset (~45 staff, ~996 June shifts, auth users for branch leads):

```bash
npm run seed:locations
npm run seed:demo
```

Source CSVs: `demo-data/staff.csv`, `demo-data/shifts.csv`, etc.  
See `demo-data/README.md` for table mapping and import order.

`npm run seed:demo -- --skip-auth` — skip auth creation if users already exist.

---

## Option D — Supabase dashboard (manual)

1. Open **Table Editor** → `locations` — confirm six branch UUIDs  
2. Import `staff` — map `location_id` from `locations.code`  
3. Create auth users in **Authentication** if needed, then `profiles` + `user_roles`  
4. Import `shifts` — `location_id`, optional `user_id` from staff, `starts_at`/`ends_at` in `Asia/Qatar` (`+03:00`)

Omit CSV-only columns: `location_code`, `employee_code`, `staff_name`, `qid`, `app_role` (not DB columns on `shifts`/`staff`).

---

## Linking staff ↔ roster ↔ location

```
locations (KDS-CC, …)
    └── staff (location_id, employee_code, user_id?)
            └── shifts (location_id, user_id?, role_label, starts_at, ends_at)
```

- Every staff row has exactly one **home branch** (`location_id`).
- Shifts copy `location_id` and `user_id` from staff when imported by `employee_code`.
- Floor staff without logins have `user_id = null` on both `staff` and `shifts`; roster still appears on the Shifts tab.

---

## RBAC summary

| Role | Sees staff | Can import roster |
|------|------------|-------------------|
| `ceo`, `coo`, `regional_ops` (level ≥ 80) | All branches | All branches |
| `branch_gm` | Own branch | Own branch |
| `duty_manager` | Own branch | Own branch |
| `cashier_host`, floor staff | Own branch (read) | No |

`user_roles.location_ids` must include the branch UUID for branch-scoped users.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Location "X" not found` | Run `npm run seed:locations` |
| `unknown employee_code` on roster | Import staff first |
| Staff not visible in UI | Check branch selector matches `location_code`; staff `status` is `active` |
| Shifts empty | Roster uses `shifts`; UI shows rolling **7 days** — schedule future dates or widen query |
| Login fails after import | Use CLI with `create_login=true`; confirm email in CSV |

---

## Related scripts

| npm script | Purpose |
|------------|---------|
| `seed:locations` | Upsert six Qatar branches |
| `seed:demo` | Full June 2026 demo dataset |
| `seed:admin` | Corporate admin user |
| `import:staff` | Staff + roster from templates |
| `generate:demo` | Regenerate `demo-data/*.csv` |
