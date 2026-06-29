# Location supervisor test logins

Test accounts for verifying **supervisor** navigation and location-scoped data access in FEC-OS.

## Shared password

All accounts use: **`FecTest2026!`**

## Accounts

| Email | Name | App role | Location code(s) | Staff `employee_code` |
|-------|------|----------|------------------|------------------------|
| mary.supervisor@fec.test | Mary Muiruri | branch_gm | INF-CC | 29440401419 |
| ashfaq.supervisor@fec.test | Ashfaq Noori | branch_gm | KDS-CC | 29735603636 |
| rosebelt.supervisor@fec.test | Rosebelt Fatal | branch_gm | CB-VM | 29660800835 |
| romel.supervisor@fec.test | Romel Chavez Pusung | branch_gm | CB-DSM | 28360804725 |
| zaryab.supervisor@fec.test | Zaryab Javaid | branch_gm | CAR-AP | 28858608039 |
| waqar.supervisor@fec.test | Waqar Asghar | branch_gm | UA-DM, KDS-DM | 29658611062 |

### Notes

- **CB-DSM:** The product brief listed “Paw”; the imported staff roster has **Romel Chavez Pusung** as venue supervisor at Dar Al Salam Mall. The test login uses Romel’s staff record (`romel.supervisor@fec.test`).
- **Waqar:** Multi-site manager — one `branch_gm` row with **both** `UA-DM` and `KDS-DM` in `user_roles.location_ids`.
- Profiles link to staff via matching `profiles.employee_code` (there is no `staff_id` on profiles).

## Why `branch_gm` (not `venue_supervisor`)

- `venue_supervisor` is a **staff roster** role (`staff_role` enum), not an app login role.
- Supervisor sidebar rail (`nav-config.ts`) uses audience `supervisor`, which maps to app roles **`branch_gm`** and **`duty_manager`** only.

## Location scoping

Access is enforced server-side:

1. **`user_roles.location_ids`** — UUID array on the role row; empty means no branch restriction for portfolio roles (`role_level >= 80` sees all sites).
2. **`user_can_access_location(location_id)`** — SQL helper used by RLS and API guards.
3. **Dashboard / daily ops** — When no branch is selected, KPIs aggregate all IDs in `location_ids`; selecting a branch in the top bar filters to that site (and `assertLocationAccess` blocks out-of-scope picks).

The branch switcher lists all **active** locations; supervisors should only use branches they are assigned. Data APIs reject unauthorized locations.

## Provision / refresh

```bash
npm run seed:supervisors
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The script is idempotent and **does not** modify `admin@fec.com`.

## Manual test checklist

1. Sign out, then sign in at `/auth` with a supervisor email and `FecTest2026!`.
2. Confirm **supervisor** primary rail (not executive): Dashboard, Daily Ops, Sites, Issues, Snags, Maintenance, E3 Tracker — no Admin/CEO.
3. Open the **branch** dropdown in the top bar; confirm assigned code(s) appear and data changes when switching.
4. For **waqar.supervisor@fec.test**, switch between UA-DM and KDS-DM; daily ops / people should reflect each mall.
5. Sign in as **admin@fec.com** and confirm the CEO account is unchanged.
