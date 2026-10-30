# Event Project Management

Official source of truth for event project management. This is **not** WhatsApp, **not** a messy ClickUp clone, and **not** a second procurement engine. The **13 coordinating workstreams** and the **14-phase lifecycle** are mandatory on every event.

## Reuse vs new

| Existing | How events attach |
| --- | --- |
| Auth, `createAuthenticatedAction`, `CapabilityGate` | Same pattern as procurement |
| RBAC roles (`ceo`, `coo`, `cfo`, `regional_ops`, `branch_gm`, …) | New capabilities only — no parallel user system |
| `locations`, `staff`, `master_departments` | Event site, PM, director, department |
| `vendors`, `/procurement`, `purchase_requisitions` | Optional `event_id` FK on PRs — existing PRs stay valid |
| Inventory, notifications, i18n, PageHeader, lazyView, query keys, app-shell | Shared chrome |
| `next_pr_number()` | Sibling `next_evt_number()` → `EVT-{YEAR}-{NNNN}` (prefix/pad in `evt_settings`) |

**New tables** (used in this slice): config lookups, `events`, team, audit, scope versions, deliverables, WBS, tasks + dependencies, milestones, baselines, budget header/lines, plus thin `event_risks` and `event_readiness_items` so health/readiness are computed from rows — not painted in the UI. Ops structure adds `event_task_supporters`, `event_issues`, `event_documents`, `event_payables`, `event_asset_movements`.

**Not created:** Full PO/GRN engines, crew rostering, warehouse reservation, permit engines, comms, change-control, closeout packs. No empty tab shells. Client invoices remain a thin receivable roll-up. POs/payments on an event are a thin payable list plus optional `purchase_orders.event_id` — not a second procurement engine.

## Phase plan

### Core schema (historical numbering in filenames)

| Slice | Scope | Status |
| --- | --- | --- |
| Schema v1 | Schema, RLS, IDs, config, capabilities | **Shipped** (`20260822120000_event_project_management.sql`) |
| Phase 2 lifecycle | Master, stage gates, health + override, readiness, audit | **Shipped** (`20260822180000_event_project_phase2.sql`) |
| Phase 3 plan | Scope, WBS, tasks, deps, milestones, Gantt, baseline | **Shipped** (`20260822200000_event_project_phase3.sql`) |
| Phase 4 budget | Cost categories, budget lines, financial strip | **Shipped** (`20260822220000_event_project_phase4.sql`) |
| Ops structure | Workstreams / issues / docs / payables | **Shipped** (`20260822230000_event_project_ops_structure.sql` + follow-ons) |
| Canonical lifecycle | 14 phases + Cancelled / On Hold, reports | **Shipped** (`20260822240000_event_lifecycle_14_workstreams.sql`) |
| Vendor / PR link | Deep-link + optional `event_id` on PRs/POs | **Shipped** |

### Enhancement roadmap (Phases 0–9) — **complete** (CR pack deferred)

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Security hardening (RLS split, storage path, cross-event integrity) | **Shipped** (create-only; staging apply pending) |
| 1 | Plan templates | **Shipped** (`20261029190000_evt_plan_templates.sql`) |
| 2 | Advanced tasks (attachments, recurrence, watchers, filters) | **Shipped** (`20261029200000_evt_task_advanced.sql`) |
| 3 | Schedule engine / CPM / auto-schedule | **Shipped** (app compute; no dedicated migrate) |
| 4 | Kanban & thin Agile | **Shipped** (`20261030150000_evt_kanban_agile.sql`) |
| 5 | Resource & workforce | **Shipped** (`20261030160000_evt_resource_planning.sql`) |
| 6 | Collaboration & meetings | **Shipped** (`20261030170000_evt_collaboration.sql`) |
| 7 | Governance & approvals (budget workflow, risk polish) | **Shipped** (`20261030180000_evt_governance.sql`) — **CR pack deferred** |
| 8 | Advanced dashboards & reporting | **Shipped** (no migration) |
| 9 | Integration testing, security validation & optimization | **Shipped** (this doc + vitest pack) |

Later product (outside this roadmap): full crew rostering, warehouse reservation, client portal, closeout packs, Change Request engine.

## 14-phase lifecycle (canonical)

Configurable in `evt_stages`. The previous 20-stage commercial path was remapped into this linear list. Cancelled / On Hold stay non-linear.

1. Event initiation — brief, objectives, location, dates, capacity, scope, stakeholders
2. Feasibility — site survey, measurements, utilities, access, permits, risk assessment
3. Budget approval — estimated budget, quotation comparison, approvals, payment schedule
4. Design — layout, renders, branding, electrical plan, equipment, customer flow
5. Procurement — PRs, POs, suppliers, delivery dates, payment status
6. Pre-production — fabrication, printing, equipment prep, testing, packing
7. Staffing — manpower plan, roster, uniforms, training, access passes
8. Logistics — vehicle plan, loading list, delivery slots, mall access, asset movement
9. Bump-in — installation, technical setup, POS, network, branding, inspections
10. Testing — equipment testing, safety checks, snagging, operational rehearsal
11. Go-live — opening approval, command structure, incident reporting, daily reporting
12. Operations — sales, attendance, staffing, maintenance, stock, incidents, feedback
13. Bump-out — dismantling, asset reconciliation, return transport, damage reporting
14. Closure — supplier settlement, final cost, profitability, lessons learned, sign-off

Side stages: Cancelled · On Hold (`events.manage` / `events.approve`).

Critical stages cannot be skipped: Budget approval, Procurement, Pre-production, Bump-in, Testing, Go-live, Operations, Bump-out.

## Stage gates

Configurable in `evt_stage_gate_requirements`. Gates are evaluated on the **target** stage before advance. Missing blockers are listed in the UI.

Planning → Pre-Production (enter `pre_production`) requires real facts / checklist rows:

- Client-approved scope (`event_scope_versions.is_baseline`)
- Approved project budget (`event_budgets.status`)
- Venue confirmed (`events.venue_name` or readiness `venue_confirmed`)
- Required permits identified (readiness `permits_identified`)
- Critical suppliers appointed (readiness `critical_suppliers`)
- Manpower requirement completed (readiness `manpower_plan`)
- Risk assessment completed (readiness `risk_assessment`)
- Production schedule available (baseline / milestones / readiness `production_schedule`)
- Procurement critical items approved (no pending `purchase_requisitions` for the event, or readiness `critical_prs`)

Health is **never** freely set by the PM. Computed RAG is Green / Amber / Red / **Critical**. Authorized executives (`events.approve`) may override with mandatory justification; the audit trail records it. Green is blocked when overdue critical tasks, open critical risks, severe overrun, or critical readiness exist.

Readiness is 0–100 from real category scores (scope, approvals, budget, procurement, …). Bands: 90–100 Green, 75–89 Amber, 50–74 Red, &lt;50 Critical.

## Event ID on purchase requisitions

`purchase_requisitions.event_id` is **nullable** → `events(id) ON DELETE SET NULL`.

- Existing PRs are unchanged (NULL).
- Event workspace links to `/procurement/requisitions?eventId=`.
- No duplicate PR/PO tables.

## Routes

- `/events` dashboard
- `/events/list`
- `/events/calendar`
- `/events/tasks`
- `/events/reports` — 23 working reports (filters: event, date range, PM). Financial reports need `events.finance`.
- `/events/new` — 7-step guided builder (basics → goal/scope → workstreams → schedule → budget → team → review). AI or template drafts land in editable lists. Seeds the 13 workstreams and 14-phase checklist. New events start as `draft` until **Launch**.
- `/events/[id]` — Plan home: current stage, % complete, overdue, next 5 tasks, budget vs actual, risks. Incomplete setup shows “step X of 7” with Continue. `?setup=1` reopens the builder.
- `/events/[id]/scope` · `/plan` (schedule details) · `/budget` — secondary detail pages, not the front door

This module is the **official source of truth**. Owners, dates, evidence, and approvals live on the event — not WhatsApp.

## Standard workstreams (13 coordinating functions)

Every new event (and every existing event, including EVT-2026-0001) is seeded with these WBS workstreams. Plan filters treat them as owners/departments.

1. Operations
2. Project management
3. Creative and branding
4. Production and technical
5. IT and POS
6. Procurement and finance
7. Logistics and warehouse
8. HR and staffing
9. Marketing
10. Mall or venue management
11. Vendors and contractors
12. Health and safety
13. Maintenance

The previous 15-workstream template was remapped (e.g. Design and branding → Creative and branding; Critical controls merged into Health and safety; Bump-in / Bump-out are lifecycle phases, not departments).

Bump-in / bump-out windows map to existing `venue_access` + `setup_*` and `dismantle_*` dates. Go-live is `events.go_live_approved` plus readiness item `go_live_approval` (gate into Go-live / Operations). Post-event notes live on `events.lessons_learned`.

## Permissions

`events.view` · `events.create` · `events.edit` · `events.manage` · `events.approve` · `events.finance` — mapped to existing `app_role` values in `src/lib/rbac.ts`.

## Kanban & thin Agile (Event PM Phase 4 overlay)

Additive only — reuses `event_tasks` (no second task system). Plan page **Board** tab:

- Kanban columns = existing task statuses; HTML5 drag-and-drop status updates (`events.edit`)
- Optional `event_sprints` + `event_tasks.sprint_id` / `story_points`
- Backlog = unassigned open tasks (or `not_started` when no sprints)
- Scrum board = same Kanban filtered to the active/selected sprint
- Simple burndown + velocity from points / `completed_at` (recharts)

Migration: `20261030150000_evt_kanban_agile.sql` (create only — do **not** apply to production without staging verify).

## Resource & workforce (Event PM Phase 5)

Additive only — reuses `staff`, `event_team_members`, and `event_tasks` hours (no duplicate employees / no HR OT rebuild). Plan page **Resources** tab:

- `event_resource_allocations` — staff → event/task, date range, hours and/or %
- `event_staff_capacity` — modest weekly hours (default 40)
- Conflict detection when weekly allocated hours exceed capacity; overlap warnings
- Workload chart/table + month/week allocation calendar
- `event_timesheet_entries` (draft → submitted → approved/rejected); approve rolls hours into `event_tasks.actual_hours`
- Soft deep-links to People / roster / attendance / OT with `eventId`
- Reports: `resource_utilization`, `est_vs_actual_hours` (task hours)

Migration: `20261030160000_evt_resource_planning.sql` (create only — do **not** apply to production without staging verify).

## Collaboration & meetings (Event PM Phase 6)

Additive only — overview **More** tab + Plan **Collaborate** tab. Reuses staff / `event_documents` / optional `event_tasks` (no wiki engine rebuild, no change-request workflow).

- `event_discussions` + `event_discussion_posts` — threaded discussions; `@[staff:uuid]` / `@Name` mentions → notify when `user_id` linked
- `event_meetings` — agenda, minutes, attendees, optional phase + document link
- `event_meeting_actions` — open/done/cancelled; optional create/link `event_tasks`; assignee notify
- `event_decisions` — simple decision log (title, decision, decided_at/by, context) — **not** full CR/governance (Phase 7)
- `event_wiki_pages` — thin single default Notes page (`slug=notes`) per event

Migration: `20261030170000_evt_collaboration.sql` (create only — do **not** apply to production without staging verify).

## Governance & approvals (Event PM Phase 7)

Additive only — budget approval workflow, risk/issue polish, gate/go-live notifications. **Change Request (CR) pack deferred** (no CR tables).

- Budget status machine: `draft → submitted → approved → locked` (+ `reject` / `reopen`); `events.finance` edits draft/rejected lines; `events.approve` / `events.manage` approve/lock/reopen; lock blocks line edits; each transition audited
- Risk register: owner, mitigation, likelihood × impact matrix, escalate action + notify
- Escalation watchlist on overview (overdue risks/tasks/gates/issues)
- Stage-gate blockers + go-live transitions notify via `notifyUsers` / assignee notify
- Issues: optional `task_id` link + light `sla_due_date`

Migration: `20261030180000_evt_governance.sql` (create only — do **not** apply to production without staging verify).

## Advanced dashboards & reporting (Event PM Phase 8)

Extends the existing reporting engine and `/events` dashboard (no rebuild, no new routes).

- Dashboard: ops strip, readiness bands, stage mix, workload/SPI widgets, portfolio timeline embed; finance KPIs gated by `events.finance`
- Reports: Phase 5 `resource_utilization` / `est_vs_actual_hours` fully wired in UI; new `portfolio_timeline`, `agile_performance`, `earned_value_lite` (finance)
- EV-lite: SPI/CPI proxies from progress × schedule window × budget (not a full EVM suite)
- Export: finance redaction on CSV/PDF/Excel + multi-report CSV pack
- Compute-in-app only — **no Phase 8 migration**

## Security hardening (Phase 0)

Additive migrations (create files only — **do not** apply to production without staging verify):

| Migration | Purpose |
| --- | --- |
| `20261029180000_events_rls_capability_enforcement.sql` | Split `FOR ALL` event RLS into SELECT vs write; `events_capability_allows()` mirrors app CAPABILITIES + `role_capability_grants`. Finance tables require `events.finance`. |
| `20261029180100_event_documents_storage_path_rls.sql` | Path-scoped `event-documents` storage: first path segment must be `event_id` UUID + location + view/edit. |
| `20261029180200_events_cross_event_integrity.sql` | Triggers keeping WBS/tasks/deps/milestones/budget lines/docs/BOQ on the same `event_id`. |

**SELECT design:** location access **and** `events.view`. Assignees without `events.view` do not get RLS visibility (matches app gates). App also redacts `contracted_value` / finance strips unless `events.finance`; `getEventBudget` requires finance.

Automated coverage (Phase 9): `src/lib/events/security-regression.test.ts`, `finance-redaction.test.ts`, `integrity.test.ts`, `documents-path.test.ts`, `governance.test.ts`, `smoke-inventory.test.ts`.

### Staging migration apply order (ALL Event PM — Phases 0–7 + core)

Apply on **staging only**. Never push to production (`lexpbagpnenvgawjljwa`) without explicit approval after staging smoke.

**Pre-checks (Phase 0):** run the SQL comments in `20261029180200_*` (0 orphan rows) and the non-UUID storage path query in `20261029180100_*`.

1. `20260822120000_event_project_management.sql`
2. `20260822180000_event_project_phase2.sql`
3. `20260822200000_event_project_phase3.sql`
4. `20260822220000_event_project_phase4.sql`
5. `20260822230000_event_project_ops_structure.sql`
6. `20260822240000_event_lifecycle_14_workstreams.sql`
7. `20260823140000_event_ops_module_links.sql`
8. `20260823160000_event_documents_boq_permits.sql`
9. `20260823170000_event_department_boq_lines.sql`
10. `20260914200000_corporate_deals_event_venue.sql` *(shared corporate deals — include if not already on staging)*
11. `20261029180000_events_rls_capability_enforcement.sql` — **Phase 0**
12. `20261029180100_event_documents_storage_path_rls.sql` — **Phase 0**
13. `20261029180200_events_cross_event_integrity.sql` — **Phase 0**
14. `20261029190000_evt_plan_templates.sql` — **Phase 1**
15. `20261029200000_evt_task_advanced.sql` — **Phase 2**
16. `20261030150000_evt_kanban_agile.sql` — **Phase 4**
17. `20261030160000_evt_resource_planning.sql` — **Phase 5**
18. `20261030170000_evt_collaboration.sql` — **Phase 6**
19. `20261030180000_evt_governance.sql` — **Phase 7**

Phases **3** and **8** have **no** migrations (compute-in-app). Phase **9** is tests/docs/perf only.

Typical staging command: `npm run db:push` against the staging project (or your pipeline). Confirm migration history before prod.

### Types regeneration

Hand stubs for Phase 4–7 tables live in `src/integrations/supabase/types.ts` (and app DTOs in `src/lib/events/types.ts`). After staging migrations succeed:

```bash
npx supabase gen types typescript --project-id <STAGING_PROJECT_ID> > src/integrations/supabase/types.ts
```

Do **not** point `--project-id` at production for a blind overwrite without review.

### Fetch caps / performance (Phase 9)

Soft caps in `EVENT_FETCH_CAPS` (`src/lib/events/constants.ts`), applied in `events.functions.ts`:

| Surface | Cap |
| --- | --- |
| List / reports events | 400 |
| Calendar task query / returned | 800 / 500 |
| Calendar milestones | 300 |
| My tasks | 200 |
| Dashboard child rows | 5000 |
| Reports child rows | 8000 |

Portfolio queries batch with `Promise.all` + `.in(event_id, …)` (no per-event N+1). Caps protect against unbounded portfolio growth; very large portfolios may under-count until filtered by location.

### Residual risks / production blockers

- Phase 0–7 migrations **not** applied to production until staging verify + explicit approval.
- Soft delete / assignee-without-`events.view` still invisible via RLS (by design).
- Calendar/list soft caps can hide older/out-of-window rows on huge sites — filter by location.
- Change Request (CR) pack still deferred — no CR tables/UI.
- Live DB typegen not run in Phase 9 (hand stubs + regen command above).
- Full E2E against real RLS requires staging credentials (unit pack covers helpers/authZ expectations only).

### Staging smoke checklist

1. Pre-check SQL (orphans / storage paths) → apply migrations in order above.
2. `npx vitest run src/lib/events` — expect green.
3. Roles: `duty_manager` opens overview, no budget amounts; `cfo` loads `/events/[id]/budget` and finance reports; `technician` blocked from `/events`.
4. Upload document → path `{event_id}/{doc_id}/…`; signed URL works.
5. Cross-event WBS/task/dep attempt → app `CrossEventIntegrityError` and/or DB exception.
6. Budget: draft → submit → approve → lock; reject/reopen with reason; locked lines not editable.
7. Kanban drag status; create sprint; resource conflict when over capacity; discussion @mention notify.
8. Reports: all 23 IDs render; finance four empty/redacted without `events.finance`; CSV export redacts money.
9. Dashboard / calendar load under location filter within fetch caps.
10. Only after green staging + explicit approval: plan production migrate (never auto-push).
