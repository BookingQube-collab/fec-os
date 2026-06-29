# FEC Qatar Demo Data — June 2026

Realistic demo/test dataset for the **FEC Operations Management Platform** (Qatar, QAR, `Asia/Qatar` timezone).

**Bulk staff + roster import:** see [STAFF_IMPORT_GUIDE.md](./STAFF_IMPORT_GUIDE.md) and templates in `templates/`.

## Branches (6)

| Code | Name | Mall |
|------|------|------|
| KDS-CC | Kids Driving School | City Center |
| INF-CC | Inflatapark | City Center |
| UA-DM | Urban Arena | Doha Mall |
| CB-VM | Crayons & Bricks | Vendome Mall |
| CB-DSM | Crayons & Bricks | Dar Al Salam Mall |
| CAR-AP | Carousel | Aspire Park |

## Files & row counts

Regenerate counts: `node scripts/generate-demo-data.mjs`

| CSV file | DB table | Rows (approx.) | Notes |
|----------|----------|----------------|-------|
| `locations.csv` | `locations` | 6 | Branch master |
| `attractions.csv` | `attractions` | 16 | Per-branch rides/zones |
| `assets.csv` | `assets` | 42 | POS, HVAC, ride controls, etc. |
| `staff.csv` | `staff` | 45 | 1 BM + 1 supervisor + 1 cashier + 4–6 floor staff per branch |
| `profiles.csv` | `profiles` | 24 | Auth-linked users (corporate + branch leads) |
| `user_roles.csv` | `user_roles` | 24 | RBAC assignments |
| `shifts.csv` | `shifts` | ~996 | **Attendance** — June shifts with clock in/out |
| `task_templates.csv` | `task_templates` | 12 | Opening + closing per branch |
| `task_template_items.csv` | `task_template_items` | 96 | Checklist line items |
| `task_instances.csv` | `task_instances` | ~372 | Daily opening/closing + ad-hoc tasks |
| `task_item_results.csv` | `task_item_results` | ~2880 | Checklist completions |
| `financial_snapshots.csv` | `financial_snapshots` | ~186 | Daily P&L (`period_kind=day`) + monthly targets (`month_target`) |
| `transactions.csv` | `transactions` | ~2196 | POS revenue lines (QAR) |
| `complaints.csv` | `complaints` | 28 | Guest complaints |
| `tickets.csv` | `tickets` | 32 | Maintenance tickets |
| `work_orders.csv` | `work_orders` | 18 | Linked corrective/preventive WOs |
| `incidents.csv` | `incidents` | 18 | Safety/security/medical reports |
| `purchase_orders.csv` | `purchase_orders` | 18 | Inventory restock POs |
| `staff_leaderboard.csv` | `staff_leaderboard` | 18 | **Staff KPIs** (June period) |
| `inventory_items.csv` | *(none)* | 72 | Logical inventory — no table in schema |
| `supervisor_kpis.csv` | *(none)* | 6 | Logical supervisor KPIs — no table in schema |

## Data characteristics

- **Dates:** 1–30 June 2026 only (daily records where applicable)
- **Weekend peaks:** Friday/Saturday (Qatar weekend) higher revenue, footfall, and transactions
- **Names:** Qatari-style names; **QID** 11-digit IDs; **+974** phones
- **Currency:** QAR throughout
- **Statuses:** Mixed open, in progress, resolved, closed, pending, etc.
- **Attendance:** Not every staff member every day; includes late arrivals and one no-show pattern

## RBAC mapping (app roles)

| Business role | `app_role` | Scope |
|---------------|------------|--------|
| General Manager | `ceo` | All branches (`role_level` ≥ 80) |
| Operations Manager | `coo` | All branches |
| Finance | `cfo` | All branches |
| HR / Admin | `auditor` | All branches |
| Branch Manager | `branch_gm` | Assigned branch |
| Supervisor | `duty_manager` | Assigned branch |
| Cashier | `cashier_host` | Assigned branch |
| Maintenance | `technician` | Maintenance tickets (estate-wide) |

## Import order (manual / SQL)

1. `locations.csv`
2. `attractions.csv`, `assets.csv`
3. `profiles.csv` (requires `auth.users` first)
4. `user_roles.csv`, `staff.csv`
5. `task_templates.csv` → `task_template_items.csv` → `task_instances.csv` → `task_item_results.csv`
6. `shifts.csv`
7. `financial_snapshots.csv`, `transactions.csv`
8. `complaints.csv`, `tickets.csv`, `work_orders.csv`, `incidents.csv`
9. `purchase_orders.csv`, `staff_leaderboard.csv`

## Scripts

```bash
# Regenerate UTF-8 CSVs (Excel-friendly BOM)
node scripts/generate-demo-data.mjs

# Upsert into Supabase (reads .env.local — never commit secrets)
node --env-file=.env.local scripts/seed-demo-data.mjs

# Dry run (counts only)
node --env-file=.env.local scripts/seed-demo-data.mjs --dry-run

# Skip auth user creation if users already exist
node --env-file=.env.local scripts/seed-demo-data.mjs --skip-auth
```

Also update branch codes in DB:

```bash
node --env-file=.env.local scripts/seed-locations.mjs
```

## Schema notes & mismatches

| User category | Schema mapping |
|---------------|----------------|
| Branch master | `locations` |
| Attendance | `shifts` (no separate attendance table) |
| Opening/closing checklists | `task_templates` (`kind`: `opening` / `closing`) + `task_instances` |
| Daily revenue | `financial_snapshots` (`period_kind=day`) + detail in `transactions` |
| Monthly targets | `financial_snapshots` (`period_kind=month_target`) |
| Maintenance | `tickets` + `work_orders` |
| Inventory | **No table** — `inventory_items.csv` + `purchase_orders` for restock |
| Staff KPIs | `staff_leaderboard` |
| Supervisor KPIs | **No table** — `supervisor_kpis.csv` only |
| HR roles | Closest match: `auditor` (no dedicated `hr` enum) |
| `ebitda` column | **Generated** in DB — present in CSV for reference; omit on insert |

### Legacy location codes

Previous migration used `KDS`, `INFLATAPARK`, `URBAN-ARENA`, etc. Demo data and `seed-locations.mjs` now use **KDS-CC**, **INF-CC**, **UA-DM**, **CB-VM**, **CB-DSM**, **CAR-AP**. The seed script closes legacy active locations not in this list.

### Deterministic UUIDs

All `id` values are SHA-256–derived UUIDs from stable keys (e.g. `loc:KDS-CC`), so re-running the generator produces the same IDs.

## Security

- Do **not** commit `.env.local` or service role keys.
- Demo auth password is printed only when running `seed-demo-data.mjs` (default: `Demo@FEC2026!`).
