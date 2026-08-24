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

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Schema, RLS, IDs, config, capabilities | **Shipped** (see `20260822120000_event_project_management.sql`) |
| 2 | Master, 20-stage lifecycle, stage gates, health + override, readiness, audit | **Shipped** (see `20260822180000_event_project_phase2.sql`) |
| 3 | Scope, WBS, tasks, deps, milestones, Gantt, baseline | **Shipped** (see `20260822200000_event_project_phase3.sql`) |
| 4 | Cost categories, budget lines, financial strip, overrun alert | **Shipped** (see `20260822220000_event_project_phase4.sql`) |
| 5 | Full risk register + issues | Thin `event_issues` + risks on overview. Full register still later. |
| 6 | Vendor / PR workspace inside the event | Deep-link to `/procurement/requisitions?eventId=` + pending PRs/POs/payments |
| Ops structure | 15 workstreams (superseded) | Replaced by the 13 coordinating functions |
| Canonical lifecycle | 14 phases + Cancelled / On Hold, reports | **Shipped** (see `20260822240000_event_lifecycle_14_workstreams.sql`) |
| 7–15 | Crew, inventory, event-day, client portal, closeout | Later |

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
- `/events/reports` — 18 working reports (filters: event, date range, PM). Financial reports need `events.finance`.
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
