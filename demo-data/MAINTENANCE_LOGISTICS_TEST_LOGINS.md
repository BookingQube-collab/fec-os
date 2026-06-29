# Maintenance & logistics test logins

Test accounts for verifying **maintenance** navigation, work orders, requests, and logistics flows in FEC-OS.

## Shared password

All accounts use: **`FecTest2026!`**

## Accounts

| Email | Name | App role | Location scope | Staff `employee_code` |
|-------|------|----------|----------------|------------------------|
| lead.maintenance@fec.test | Faisal Al-Mansouri | tech_supervisor | All active FEC venues | — |
| hannan.maintenance@fec.test | Hannan Abid | technician | UA-DM | 28405028554 |
| warehouse.logistics@fec.test | Salim Al-Kuwari | tech_supervisor | All active FEC venues | — |

### Notes

- **Hannan Abid** is mapped to the imported staff roster (Technician, Maintenance activity at UA-DM). Profile links via `profiles.employee_code`.
- **Faisal** and **Salim** are generic test personas — no staff roster row required.
- **Logistics** uses `tech_supervisor` (not `branch_gm`) so the app resolves the **maintenance** primary rail, while still granting `maintenance.logistics_submit`, `maintenance.logistics_warehouse`, and `maintenance.logistics_verify`.

## Why `tech_supervisor` / `technician`

- `nav-config.ts` maps audience **`maintenance`** to app roles **`tech_supervisor`** and **`technician`** only.
- `branch_gm` / `duty_manager` see the **supervisor** rail instead, even though they also have many maintenance capabilities.
- Staff roster roles (`technician`, `venue_supervisor`, etc.) are separate from app login roles in `user_roles`.

## Role capabilities (summary)

| Capability | lead (tech_supervisor) | hannan (technician) | warehouse (tech_supervisor) |
|------------|------------------------|---------------------|----------------------------|
| maintenance.view | ✓ | ✓ | ✓ |
| maintenance.manage | ✓ | — | ✓ |
| maintenance.schedule_pm | ✓ | — | ✓ |
| maintenance.execute_wo | ✓ | ✓ | ✓ |
| maintenance.request_submit | ✓ | ✓ | ✓ |
| maintenance.weekly_report | ✓ | ✓ | ✓ |
| maintenance.weekly_report.review | ✓ | — | ✓ |
| maintenance.logistics_view | ✓ | ✓ | ✓ |
| maintenance.logistics_submit | ✓ | — | ✓ |
| maintenance.logistics_warehouse | ✓ | — | ✓ |
| maintenance.logistics_verify | ✓ | — | ✓ |
| issues.view / create | ✓ | ✓ | ✓ |
| inventory.view | ✓ | — | ✓ |
| amc.view (Inspections) | ✓ | — | ✓ |

## Navigation (maintenance audience)

Primary rail (icon shortcuts):

- **lead** & **warehouse** (`tech_supervisor`): Dashboard, Maintenance, Requests, Inventory, Inspections, Issues, Logistics
- **hannan** (`technician`): Dashboard, Maintenance, Requests, Issues, Logistics (no Inventory or Inspections — missing `inventory.view` / `amc.view`)

Maintenance sidebar group:

- Dashboard (`/maintenance`)
- Requests (`/maintenance/requests`)
- Logistics (`/maintenance/logistics`) — warehouse account can submit/verify; technician sees read-only logistics
- Weekly report + review (lead & warehouse; technician can submit own weekly report)

Technician (**hannan**) additionally lands on maintenance-focused dashboard (`dashboard.view_maintenance`) with **My queue** work-order scope.

## Location scoping

Access is enforced server-side via `user_can_access_location`:

1. **`user_roles.location_ids`** — UUID array; `role_level >= 80` bypasses (exec/regional).
2. **Estate-wide accounts** (`lead`, `warehouse`) — all active venue IDs from `locations`.
3. **Hannan** — scoped to **UA-DM** only (matches staff assignment).

## Provision / refresh

```bash
npm run seed:maintenance-logistics
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The script is idempotent and **does not** modify `admin@fec.com` or any `*.supervisor@fec.test` account.

## Manual test checklist

1. Sign out, then sign in at `/auth` with each email and `FecTest2026!`.
2. Confirm **maintenance** primary rail (not executive or supervisor): Dashboard, Maintenance, Requests, Inventory, Issues, Logistics.
3. As **lead.maintenance@fec.test**: open `/maintenance`, create/assign a work order, schedule PM, review weekly reports.
4. As **hannan.maintenance@fec.test**: confirm **My queue** WOs, execute assigned orders, submit a maintenance request; UA-DM data only.
5. As **warehouse.logistics@fec.test**: open `/maintenance/logistics`, submit and verify logistics requests across venues.
6. Sign in as **admin@fec.com** and a supervisor account — confirm they are unchanged.
