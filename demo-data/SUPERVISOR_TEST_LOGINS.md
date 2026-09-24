# Location supervisor test logins

Test accounts for verifying **supervisor** navigation and location-scoped data access in FEC-OS.

## Shared password

All accounts use: **`FecTest2026!`**

## Accounts

| Email | Name | App role | Location code(s) | Staff `employee_code` |
|-------|------|----------|------------------|------------------------|
| mary.supervisor@fec.test | Mary Wangare Muiruri | branch_gm | INF-CC | INF-CC-VS |
| ashfaq.supervisor@fec.test | Ashfaq Noori | branch_gm | KDS-CC | KDS-CC-VS |
| rosebelt.supervisor@fec.test | Rosebelt Fatal | branch_gm | CB-VM | CB-VM-BM2 |
| romel.supervisor@fec.test | Romel Chavez Pusung | branch_gm | CB-DSM | CB-DSM-VS |
| zaryab.supervisor@fec.test | Zaryab Javaid | branch_gm | CAR-AP | CAR-AP-VS |
| waqar.supervisor@fec.test | Waqar Asghar | branch_gm | UA-DM, KDS-DM | UA-DM-VS |
| wm.supervisor@fec.test | Winter Mirage Supervisor | branch_gm | WM-VM | WM-VM-VS (synthetic) |

### Notes

- **CB-DSM:** The product brief listed “Paw”; the imported staff roster has **Romel Chavez Pusung** as venue supervisor at Dar Al Salam Mall. The test login uses Romel’s staff record (`romel.supervisor@fec.test`).
- **Waqar:** Multi-site manager — one `branch_gm` row with **both** `UA-DM` and `KDS-DM` in `user_roles.location_ids`.
- **WM-VM:** No venue supervisor on the staff roster; seed creates synthetic staff `WM-VM-VS` + `wm.supervisor@fec.test`.
- **HO (Head Office):** Active corporate location — not assigned a site supervisor; Admin/HR cover it.
- **INF-CC dual login:** `site.supervisor@fec.test` (role persona) and `mary.supervisor@fec.test` both scope to INF-CC; profile `employee_code` INF-CC-VS stays on the persona account.
- Profiles link to staff via matching `profiles.employee_code` when unique (there is no `staff_id` on profiles). Location ACL is always `user_roles.location_ids`.

## Why `branch_gm` (not `venue_supervisor`)

- `venue_supervisor` is a **staff roster** role (`staff_role` enum), not an app login role.
- Supervisor sidebar rail (`nav-config.ts`) uses audience `supervisor`, which maps to app roles **`branch_gm`** and **`duty_manager`** only.

## Location scoping

Access is enforced server-side:

1. **`user_roles.location_ids`** — UUID array on the role row; empty means no branch restriction for portfolio roles (`role_level >= 80` sees all sites).
2. **`user_can_access_location(location_id)`** — SQL helper used by RLS and API guards.
3. **`user_can_access_staff(staff_id)`** — home location **or** work-location membership in the caller’s assigned sites.
4. **Dashboard / daily ops** — When no branch is selected, KPIs aggregate all IDs in `location_ids`; selecting a branch in the top bar filters to that site (and `assertLocationAccess` blocks out-of-scope picks).

The branch switcher lists all **active** locations; supervisors should only use branches they are assigned. Data APIs reject unauthorized locations. Staff RLS hides out-of-scope people.

## Salary & sensitive documents

Site supervisors (`branch_gm`), ops supervisors (`duty_manager`), and employees **cannot** see salary or QID/passport document numbers. Those require Admin/exec (`ceo` / `coo` / `cfo`) or **HR** capabilities (`people.view_salary`, `hr.profile.view_sensitive`).

## Provision / refresh

```bash
npm run seed:supervisors
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The script is idempotent and **does not** modify `admin@fec.com`. It fails if any active location has no supervisor assignment.

## Manual test checklist

1. Sign out, then sign in at `/auth` with a supervisor email and `FecTest2026!`.
2. Confirm **supervisor** primary rail (not executive): Dashboard, Daily Ops, Sites, Issues, Snags, Maintenance, E3 Tracker — no Admin/CEO.
3. Open the **branch** dropdown in the top bar; confirm assigned code(s) appear and data changes when switching.
4. For **waqar.supervisor@fec.test**, switch between UA-DM and KDS-DM; daily ops / people should reflect each mall.
5. Open People → staff profile: QID/passport/salary/documents must be masked or hidden.
6. Sign in as **hr.manager@fec.test** or **admin@fec.com** and confirm salary + documents are visible estate-wide.
7. Sign in as **admin@fec.com** and confirm the CEO account is unchanged.
