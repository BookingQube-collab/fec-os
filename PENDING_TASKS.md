# FEC-OS — Pending Tasks

Status snapshot of the 8-milestone build plan in `.lovable/plan.md`.
Items marked `[x]` are implemented; `[ ]` are still pending.

## M1 — Foundation & design system
- [x] Tailwind dark theme + design tokens (`src/styles.css`)
- [x] i18n EN/AR with RTL switch (`src/i18n/`)
- [x] Zustand app store (`src/stores/app-store.ts`)
- [x] App shell with branch switcher, language toggle, nav
- [x] Lovable Cloud enabled

## M2 — Auth, roles, RBAC
- [x] `app_role` enum + `user_roles` with `role_level` + `location_ids[]`
- [x] `has_role`, `current_user_role_level`, `user_can_access_location`
- [x] Email/password login (`/auth`)
- [x] `usePermission` hook + `CAPABILITIES` matrix (`src/lib/rbac.ts`)
- [x] `_authenticated` layout gate
- [ ] PIN login server function (employee# + 6-digit PIN via admin client)
- [ ] `/onboard` route (language + notifications preferences)
- [ ] Role-aware home redirect at `/` (currently static)

## M3 — Core schema port
- [x] Locations, attractions, assets, tickets, work_orders, shifts
- [x] Bookings, transactions, complaints, incidents, staff
- [x] Training enrollments, mall_requests, purchase_orders
- [x] Audits, findings, obligations, escalations, leakage_cases
- [x] Financial snapshots, AI artifacts, audit_log
- [x] RLS + GRANTs on every public table
- [x] Value-laddered RPCs (`create_purchase_order`, `update_po_status`, booking lifecycle)
- [x] 5 demo locations seeded
- [ ] 10 demo users (one per role) — currently must be created manually
- [ ] Demo attractions/assets seed data

## M4 — Operations Command Center (OCC)
- [x] `/occ` estate grid with RAG tiles
- [x] `/occ/branch/:locationId` branch pack
- [x] `/occ/exceptions` prioritised feed
- [x] `/occ/handover/:locationId` shift digest
- [x] `/occ/protocols` (lost child, evacuation, power failure)
- [x] Realtime subscriptions on tickets/incidents/work_orders/complaints/escalations

## M5 — Issues, Maintenance, Bookings
- [x] `/issues` list + `/issues/:id` timeline
- [x] `/maintenance` queue, assets, PM, work orders
- [x] `/bookings` with quote → deposit → confirmed → delivered flow
- [ ] `/issues/new` dedicated route with QR scan + voice note
- [ ] `/issues/board` kanban view
- [ ] Parts inventory module

## M6 — Revenue Intelligence, Branches, CEO
- [x] `/revenue` pace, leakage cases, branch P&L
- [x] `/branches` league + heat map
- [x] `/ceo` dashboard with daily AI brief
- [x] `/forecasts` 14/90-day what-if scenarios
- [x] `/decisions` queue with voting + AI summary
- [ ] Asset ROI league screen
- [ ] Promo effectiveness analytics
- [ ] Board pack PDF export (scaffold in `src/lib/pdf/board-pack.ts` — verify completeness)

## M7 — People, Compliance, Customer, Admin
- [x] Shifts/rosters with clock in/out + swap workflow
- [x] Training enrollments
- [x] Complaints with triage + resolution
- [x] Incidents with RCA
- [x] Compliance: audits, findings, obligations
- [x] Mall requests
- [x] Purchase orders with approval ladder
- [x] Customer module
- [x] Basic admin route (`/admin`)
- [x] Leaderboard / gamification
- [ ] Admin: approval-ladder editor UI
- [ ] Admin: RBAC editor UI (assign roles + locations to users)
- [ ] Admin: integrations management
- [ ] Admin: AI config (autonomy A/B/C per agent — table exists, UI missing)

## M8 — Polish, PWA, AI features
- [x] PWA manifest (`public/manifest.webmanifest`)
- [x] Offline queue scaffold (`src/lib/offline-queue.ts`) used by Tasks
- [x] AI daily CEO brief
- [x] AI forecast commentary
- [x] AI decision summary
- [x] RAG over docs (`kb_documents` + `kb_chunks` with pgvector + `match_kb_chunks`)
- [ ] Service worker registration for true offline (manifest exists, SW not registered)
- [ ] Extend offline queue beyond Tasks (issues, complaints from floor)
- [ ] Push notifications (web push subscription + delivery)
- [ ] AI leakage RCA generator
- [ ] AI P&L commentary per branch
- [ ] Bilingual QA pass (full AR translation coverage audit)
- [ ] Accessibility audit (keyboard nav, ARIA, contrast)
- [ ] Mobile-optimised floor-staff screens (issues/new, tasks, complaints intake)

## Cross-cutting
- [ ] pg_cron schedules wired to `/api/public/cron/*` (only `escalation-sweep` exists; PM sweep, leaderboard refresh, daily brief, forecast results need cron entries)
- [ ] Push-notification preferences in profile
- [ ] Audit log viewer UI (table populated, no read screen)
- [ ] Storage bucket policies review for `task-photos` and any new buckets
- [ ] Test data generator script for demos

_Last reviewed: 2026-06-14_