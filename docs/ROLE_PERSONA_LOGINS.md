# Role persona demo logins

Four accounts covering the three requested personas, with site vs ops supervisors as the natural fourth.

| Login | Email | App role | Staff link | Locations |
|-------|-------|----------|------------|-----------|
| Site supervisor | `site.supervisor@fec.test` | `branch_gm` | `INF-CC-VS` (Mary Wangare Muiruri) | INF-CC |
| Ops supervisor | `ops.supervisor@fec.test` | `duty_manager` | `UA-DM-STF06` (Ali Husnain) | UA-DM |
| HR | `hr.manager@fec.test` | `hr` | `PERSONA-HR` (created) | all active |
| Employee | `employee@fec.test` | `cashier_host` | `INF-CC-CSH01` (Jorene Tesoro Quixote) | INF-CC |

## Passwords

Generated uniquely on each seed run and printed to **stdout only**. They are never committed.
**Re-running the seed rotates passwords** — any earlier chat/terminal password stops working. Use the latest stdout table.

```bash
npm run seed:role-personas
# or: pnpm seed:role-personas
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the same anon/publishable key the Next app uses (seed verifies `signInWithPassword` at the end).

If localhost `/auth` returns “Invalid login credentials”, re-seed and copy the **new** passwords — do not reuse passwords from an older run.

## Access notes

- **Site supervisor** — roster import (`/people/import`), monthly roster (`/people/roster`), daily ops, leave manage (`/people/leave`), attendance, employee app (`/hr/me`).
- **Ops supervisor** — same supervisor rail; leave is manager-approve (`hr.leave.approve_manager`), not full leave admin.
- **HR** — full People / attendance / leave / payroll / HR admin capabilities.
- **Employee** — use `/employee` or `/hr/me` for own data. Role is `cashier_host` (product has no dedicated “employee-only” app role); floor tasks/issues remain reachable if navigated deliberately. No HR admin.

Does **not** modify `admin@fec.com` or shared-password `@fec.test` UAT accounts from `seed:supervisors` / `seed:test-logins`.
