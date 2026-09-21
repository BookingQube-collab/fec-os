# Role persona demo logins

Four accounts covering the three requested personas, with site vs ops supervisors as the natural fourth.

| Login | Email | App role | Staff link | Locations | Password |
|-------|-------|----------|------------|-----------|----------|
| Site supervisor | `site.supervisor@fec.test` | `branch_gm` | `INF-CC-VS` (Mary Wangare Muiruri) | INF-CC | **FecTest2026!** |
| Ops supervisor | `ops.supervisor@fec.test` | `duty_manager` | `UA-DM-STF06` (Ali Husnain) | UA-DM | **FecTest2026!** |
| HR | `hr.manager@fec.test` | `hr` | `PERSONA-HR` (created) | all active | **FecTest2026!** |
| Employee | `employee@fec.test` | `cashier_host` | `INF-CC-CSH01` (Jorene Tesoro Quixote) | INF-CC | **FecTest2026!** |

## Passwords

By default all four share the same stable UAT password as other `@fec.test` seeds: **`FecTest2026!`**.

Re-running the seed **does not rotate** passwords unless you ask it to.

```bash
npm run seed:role-personas
# or: pnpm seed:role-personas

# Optional: override the shared password
ROLE_PERSONA_PASSWORD='YourSharedPass!' npm run seed:role-personas

# Optional: mint unique strong passwords (stdout only; prior shared password stops working)
npm run seed:role-personas -- --rotate
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the same anon/publishable key the Next app uses (seed verifies `signInWithPassword` with the anon key at the end).

If localhost `/auth` returns “Invalid login credentials”, confirm you are on project `lexpbagpnenvgawjljwa` (see `.env.local`) and using **FecTest2026!** — not an older rotated stdout password from a prior `--rotate` run.

## Access notes

- **Site supervisor** — roster import (`/people/import`), monthly roster (`/people/roster`), daily ops, leave manage (`/people/leave`), attendance, employee app (`/hr/me`).
- **Ops supervisor** — same supervisor rail; leave is manager-approve (`hr.leave.approve_manager`), not full leave admin.
- **HR** — full People / attendance / leave / payroll / HR admin capabilities.
- **Employee** — use `/employee` or `/hr/me` for own data. Role is `cashier_host` (product has no dedicated “employee-only” app role); floor tasks/issues remain reachable if navigated deliberately. No HR admin.

Does **not** modify `admin@fec.com` or shared-password `@fec.test` UAT accounts from `seed:supervisors` / `seed:test-logins`.
