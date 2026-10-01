# FEC-OS HRMS 2.0 implementation plan

Phase 0 audit of the existing FEC-OS HR system, plus the Phase 1 scope that was implemented. Later phases are documented only. They are not built.

This is one product. There is no second HR application, no second employee table, no second attendance engine, no second roster engine, and no second ZKTeco integration.

## AI constraint (applies to every phase)

Existing pages keep their current business logic. AI is an assistive layer that reads the same records.

These workflows are not replaced, rewritten, or duplicated:

- Roster and shift planning (`staff` shifts, roster import, monthly roster, shift policy)
- Attendance (punch processing, daily summary, corrections, device logs)
- People / employee master (`public.staff` plus `staff_profile_ext`)
- ZKTeco biometric integration (ADMS / iClock, device sync, user.dat / attlog parsers)
- Documents, leave, per-module approvals, training enrollments, and HR notifications, once they already work

Rules:

1. Punch processing, ZKTeco sync, roster generation and approval, people create/update, attendance calculations, permissions, and data writes stay on the current code paths and database behavior.
2. AI may add insights, flags, explanations, recommendations, and copilot answers that read those records. AI must not silently change punches, rosters, salaries, ZKTeco sync, or employee master data.
3. Managers still approve anything AI suggests. Anomaly flags must not accuse employees of misconduct. Leave patterns say "Pattern requires HR review" and are never auto-labeled fraud. Use "engagement risk" and "workload concern". Do not diagnose mental health. Do not show an unexplained attrition percentage.
4. Recommendation, then evidence, then human review. No autonomous termination, salary change, promotion, demotion, penalty, candidate rejection, or payroll approval. No protected characteristics (race, religion, gender, marital status, age, nationality) used to rank suitability.

Phase 1 attaches no AI writer to roster, attendance, people CRUD, or ZKTeco. The only assistive UI is a missing-data checklist on the existing employee profile. Saving skills is an explicit HR action, not an AI write.

## Current architecture

FEC-OS is a Next.js App Router application (React, TypeScript, Tailwind, shadcn/ui, Radix). Auth and data are Supabase (PostgreSQL, RLS, storage). Server mutations use authenticated server actions. Some reads use App Router API routes. Client data uses TanStack Query. Navigation and role gates use the capability map in `src/lib/rbac.ts`. HR pages use `HrShell`, `HrSection`, and `HrPanel`. Copy is in `src/i18n/locales/en.json` and `ar.json`.

One employee master: `public.staff`. Sensitive extension: `public.staff_profile_ext` (1:1 on `staff_id`). Compensation is `staff_compensation`, not columns on `staff`. Lifecycle history is append-only (`staff_status_history`, `staff_salary_history`, `staff_transfers`, `hr_employee_timeline` events). Audit writes go through `log_audit` into `audit_log`.

Protected routes live under `app/(protected)/people`, `app/(protected)/hr/me`, and `app/api/people`. Views are client components loaded with `lazyView`.

## Existing modules

| # | Module | Status | Where it lives |
| --- | --- | --- | --- |
| 01 | HR Command Center | PARTIAL | `/people/hr` dashboard, KPIs, links. Not a full command suite. |
| 02 | Employee Management | PARTIAL | `/people`, `/people/staff/[id]`, import, master lists. Profile tabs already cover employment, personal, documents, attendance, payroll, performance, training, warnings, history, notes. |
| 03 | Recruitment & Onboarding | PARTIAL | ATS pipeline, job requests, vacancies, offers, onboarding checklists. |
| 04 | Attendance & Workforce Analytics | PARTIAL | Attendance dashboard, import, listing, mapping, device logs, corrections, ZKTeco devices, field/geo. Calculations stay in `src/lib/attendance-hr`. |
| 05 | Rosters & Shift Planning | PARTIAL | `/people/roster`, `/people/import`, site working hours. Generation and approval stay in the roster actions. |
| 06 | Leave Management | PARTIAL | `/people/leave`, balances, requests, timeline events. |
| 07 | Payroll & Compensation | PARTIAL | Periods, lines, WPS/cheque/bank export, salary history, air tickets. |
| 08 | Performance Management | PARTIAL | Cycles, KRA/KPI, evaluations, achievements. |
| 09 | Learning & Development | PARTIAL | `training_enrollments` on people, shared with ops use. Not a cross-department learning platform yet. |
| 10 | Employee Engagement | MISSING | No survey product. Do not invent scores. |
| 11 | Workforce Planning | PARTIAL | Workforce quota and job requests. No forecast scenarios. |
| 12 | Compliance & HR Risk | PARTIAL | Document expiry and policy settings exist. Labor-law watch is not a separate engine. Operations compliance (`/compliance`) is a different module. |
| 13 | Employee Relations | PARTIAL | Warnings, probation. |
| 14 | Documents & Expiry | PARTIAL | `hr_employee_documents`, bucket `hr-employee-documents`, expiry reminders. |
| 15 | Employee Lifecycle | PARTIAL | Onboarding, probation, resignation, termination, status history. |
| 16 | Employee Self-Service | PARTIAL | `/hr/me` (attendance, roster, leave, documents, payslips, KRA). |
| 17 | HR Reports & Analytics | PARTIAL | `/people/hr/reports` and dashboard breakdowns. Not a report builder. |
| 18 | HR Workflow & Approvals | PARTIAL | Approvals are per module (leave, OT, documents, payroll, termination, job requests). No reusable engine. |
| 19 | AI HR Copilot | MISSING | Not built. |
| 20 | HR Administration | PARTIAL | `/people/hr/settings` policy store, employee app admin, hierarchy. |
| — | AI Action Center | MISSING | Not built. |

Also in use and left unchanged: ZKTeco ADMS (`src/lib/attendance-hr/parse-adms.ts`, device routes), face enrollment on the field page (product attendance, not a second device stack), notifications, cron sweeps for probation and document expiry.

## Missing features

- Engagement surveys (P8).
- Reusable approval engine (P10). Do not hardcode a new approval table per module.
- Labor-law change monitor (P7).
- Cross-department learning platform that HR, Ops, Maintenance, HSE, CS, F&B, IT, and Management can assign (P6). Keep `training_enrollments`.
- AI copilot and action center (P9).
- Command-center KPI suite and command palette (out of Phase 1, not started).
- Structured education rows. Education is already a document type. No second education table.
- Employee-linked certifications. `staff_certifications` is a compliance sheet keyed by name, not `staff_id`. Do not duplicate it. Phase 1 shows training enrollments on the profile instead.

## Duplicate features

Removed in this pass (they were a parallel demo and were not routed):

- `src/lib/hr-intelligence.ts`
- `src/lib/hr-intelligence.test.ts`
- `src/views/hr-intel-screens.tsx`
- `src/components/hr/hr-hrms-comparison.tsx`

Not created: second attendance engine, second roster engine, second people table, second ZKTeco client.

`staff_certifications` stays the compliance tracker it already is. Employee identity stays on `staff`.

## Database changes (Phase 1 only)

Migration `supabase/migrations/20261002140000_staff_profile_ext_masked_read.sql`:

- Adds nullable `staff_profile_ext.skills` (text). Not a score.
- Adds `user_can_view_hr_sensitive()` for the same roles as salary view (`ceo`, `coo`, `cfo`, `hr`, role level at least 55).
- Adds `read_staff_profile_ext(staff_id)` security definer. Roster-scoped users can read non-sensitive extension fields. Passport number, visa number, bank, IBAN, WPS id, ticket amount, private notes, and exit reason are returned only for self or the sensitive/salary roles.

No change to `staff`, attendance tables, shift tables, ZKTeco tables, or punch functions.

## Migration requirements

Apply `20261002140000_staff_profile_ext_masked_read.sql` before relying on masked reads or the skills column. Until that function exists, `GET /api/people/staff/[id]` falls back to the previous `staff_profile_ext` select so current profiles keep loading.

Skills save fails closed until the column exists (the upsert includes `skills`). Profile read does not depend on that column in the fallback path.

## Security risks

- `staff.qid` remains on `public.staff`. Roster RLS can read the row. The profile API still redacts the number unless `hr.profile.view_sensitive`. A direct client select of `staff` can still see QID. Moving QID off `staff` would change people CRUD and was not done.
- `audit_log` is readable by location managers for that location. Phase 1 therefore stores `[redacted]` for QID, passport, visa, IBAN, bank, WPS id, and notes in audit payloads. It does not copy raw secrets into the log.
- `staff_profile_ext` table RLS is unchanged (salary role or self for direct selects). The new function is the supported read for the profile API. Direct table selects by salary roles still return full columns, which matches today’s salary/sensitive role overlap.
- Face enrollment and ZKTeco stay on their existing storage buckets (`staff-faces`, device ingest). Phase 1 does not add a capture pipeline.
- Private notes are still editable by the existing `people.edit_roster` / `hr.manage` / `hr.docs.manage` action. Database write RLS is unchanged.

## RBAC changes

No new roles. No change to `src/lib/rbac.ts` capability lists.

Phase 1 uses capabilities already defined:

- Profile shell: `people.view_roster`
- Sensitive identity: `hr.profile.view_sensitive` (API mask) plus `user_can_view_hr_sensitive()` (database function)
- Salary and bank: `people.view_salary` / `user_can_view_staff_salary()`
- Skills edit: `hr.manage` (explicit save only)
- Notes edit: unchanged (`people.edit_roster`, `hr.manage`, `hr.docs.manage`)

Scope today is location-based (`user_can_access_staff` / `user_can_access_location`), plus self for the employee app. A full module × resource × action × scope matrix (own/team/department/site/company/all) is not added. Building that would replace the current capability map. It stays a later security-audit item (P10) unless a specific gap is closed inside the existing map.

## AI opportunities (later phases, read-only on current workflows)

| Existing module | Later phase | AI layer (read only) | Must not change |
| --- | --- | --- | --- |
| People / employee master | P1 checklist only; richer summary stays out of writes | Missing-data list from fields already loaded | People create/update, codes, departments, QID writes |
| Roster / shift planning | P2 | Suggested cover from existing demand, availability, and fatigue rules already stored. Manager approves. | Roster generation, import, approval rules |
| Attendance | P2 | Flags on existing daily summaries ("review this day"). No misconduct label. | Punch processing, calculations, corrections workflow |
| ZKTeco | P2 display only if ever needed | None in Phase 1. Do not put a model in device sync. | ADMS, parsers, command queue, enrollments |
| Leave | P2 | "Pattern requires HR review" on existing requests. Never auto-labeled fraud. | Balances, approval chain |
| Payroll | P3 | Explain a line from existing gross/net/WPS fields before a human processes. | Calculations, lock, exports, salary writes |
| Recruitment | P4 | Rank explanation from skills already on the candidate/job. Human moves the stage. | ATS stages, offers, job-request approvals |
| Performance | P5 | Sentiment label on feedback text that already exists, with the text shown. No promotion decision. | Cycles, scores, approvals |
| Learning | P6 | Course suggestions from training rows and the skills field. Human assigns. | Enrollment completion rules |
| Compliance / documents | P7 | Expiry already calculated stays the source. AI may explain a row. | OCR vault not started. Uploads stay as they are. |
| Workforce planning | P8 | Forecast narrative from quota and headcount already stored. Human opens a job request. | Quota math |
| Engagement / retention | P8 | Explainable signals only: attendance stability, OT trend, leave trend, training, performance, tenure, role changes. Each row has why, view data, and a recommended action a human takes. No bare attrition %. No mental-health diagnosis. | Resignation workflow |
| Copilot / action center | P9 | Answers and a queue of the flags above. No autonomous actions. | — |
| Reports / automation | P10 | Report explanations. | Export and approval engines |

## Earlier capability list mapped to phases

1. AI recruitment (resume match, ranking, predicted success, screening chat) — P4, on the current ATS. Human sets the stage. No automatic rejection.
2. Workforce planning and predictive staffing — P8, on quota and historical headcount. No second planning app.
3. Smart payroll (calculation review, statutory/WPS status, anomaly before processing, life-stage benefits) — P3, on current payroll runs. No silent payroll approval.
4. Core HR, hierarchies, labor-law flags — employee master and hierarchy exist (P1 profile). Labor-law watch is P7.
5. ESS chatbot (PTO, insurance, workflows) — P9, reading `/hr/me` data. It must not file or approve leave by itself.
6. Continuous performance, feedback sentiment, goals, workload prompt — P5. Say workload concern, not a diagnosis.
7. Personalized learning — P6, on the shared training platform, not an HR-only catalog.
8. Predictive retention — P8. Explainable signals, why / view data / recommended action. No unexplained percentage.
9. Smart time and touchless clock-in — P2 reads attendance. ZKTeco and face enrollment stay the clock-in products. No second device integration.

Traditional vs AI contrast (resourcing, support, training, retention) belongs on the HR dashboard as copy in a later phase. It was not added in Phase 1, so the dashboard workflow stays the same aside from the module index.

## API changes (Phase 1)

`GET /api/people/staff/[id]`

- Overview still requires `people.view_roster` and `user_can_access_staff`.
- Profile extension is loaded with `read_staff_profile_ext` when that function exists, otherwise the previous select.
- The API still strips passport number and bank fields when `hr.profile.view_sensitive` is absent.
- Training enrollments are included on overview so the profile can list them. This is a read. It does not write enrollments.
- Attendance, punches, compensation, transfers, and documents queries are unchanged.

`updateStaff` still writes the same `staff` patch. The audit payload redacts QID. `updateStaffProfileNotes` still writes notes the same way and audits a redacted marker. `updateStaffSkills` is new and only writes `staff_profile_ext.skills` when HR chooses Save.

## UI changes (Phase 1)

- `/people/hr` overview shows an HR workspace table. Live modules link to existing routes. Later modules have no route.
- `/people/staff/[id]` overview shows a record check (missing fields only), links into existing tabs and leave/OT pages, education documents already stored, training enrollments, and an HR-only skills field.
- Loading, error, and empty states on that profile were already present; the error state is now explicit.
- English and Arabic strings were added for the workspace and the record check.
- No navigation config change, so existing sidebar tests stay valid.
- No visual redesign.

## Implementation dependencies

- Phase 2 depends on current attendance summaries, shift rows, and leave requests. It must not fork those tables.
- Phase 3 depends on payroll periods and lines.
- Phase 4 depends on ATS candidates and applications.
- Phase 6 depends on `training_enrollments` and the skills text on the employee.
- Phase 8 retention signals depend on attendance, OT, leave, training, performance, tenure, and status history already stored.
- P9 depends on those read models being stable.
- The masked profile read depends on migration `20261002140000`.

## Phase breakdown

### P1 — HR foundation + Employee 360 + RBAC (this release)

Workspace index, employee 360 on the current profile, masked profile read, redacted audit for sensitive people writes, skills field. No copilot. No second engines.

### P2 — Attendance + Roster + Leave

Assistive flags and shift suggestions on the current attendance, roster, and leave screens. ZKTeco sync unchanged. Managers approve. Not started.

### P3 — Payroll + Compensation

Explain and flag current payroll lines before a human processes them. Not started.

### P4 — Recruitment + Onboarding

Matching and screening assist on the current ATS and onboarding checklists. Not started.

### P5 — Performance

Feedback sentiment and workload prompts on current evaluations. Not started.

### P6 — Learning & Development (shared platform)

Recommendations and assignments from HR, Ops, Maintenance, HSE, CS, F&B, IT, and Management on the existing training records. Not started.

### P7 — Compliance + Documents + Employee Relations

Labor-law flags and document expiry explanation on current documents and warnings. Not started.

### P8 — Workforce Planning + Engagement

Quota-based forecast and explainable retention signals. Not started.

### P9 — AI HR Copilot + Insight Engine + Action Center

Read-only copilot and a human queue. Not started.

### P10 — Reporting + Automation + Security Audit

Report explanations, reusable approvals only if designed once, and a review of the QID-on-staff residual risk. Not started.

## Phase 1 preservation note

Files left on existing logic (not rewritten):

- Roster: `src/lib/staff-roster.functions.ts`, `src/lib/staff-import.ts`, roster views
- Attendance: `src/lib/attendance-hr.functions.ts`, `src/lib/attendance-hr/*` processors and parsers
- ZKTeco: `src/lib/attendance-hr/parse-adms.ts`, device routes, attendance device settings
- People writes: `updateStaff` still updates `staff` with the same fields; notes upsert is unchanged apart from an extra redacted audit row

Phase 1 AI attached: missing-data checklist on `/people/staff/[id]` only. It does not score people and does not write punches, rosters, salaries, or device data.

Deferred: every AI item in the table above from P2 onward.
