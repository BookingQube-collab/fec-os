# HR admin guide (FEC-OS)

Short operator guide for People → HR (`/people/hr`). Additive HRMS phases 1–12.

## Policy settings

Open **People → HR → Settings** (`/people/hr/settings`) and related policy surfaces:

| Area | Where | Notes |
| --- | --- | --- |
| Leave / OT / document / air-ticket / payroll defaults | HR settings + policy sections | Stored in `hr_policy_settings`; defaults in `HR_POLICY_DEFAULTS` |
| Site working hours | `/people/hr/shift-policy` | Per-location hours, break, reporting buffer |
| OT claim rates | HR settings (OT policy) | Claims workflow is separate from attendance OT minutes |

Change policy before running payroll or air-ticket eligibility so entitlement math matches the period. Locked payroll lines and historical employee snapshots are **not** rewritten when policy changes (AT#20).

## Key workflows

1. **Documents** — Upload/verify on `/people/hr/documents` (employee self-serve on `/hr/me`). QID/passport expiry reminders go to in-app category `hr_documents`.
2. **Leave** — Multi-step approvals on `/people/leave`. Notifications use `hr_leave`. Final HR approve syncs to attendance leave records.
3. **OT** — Claims on `/people/hr/ot` (`submitted` → `manager_verified` → `hr_approved` → `payroll_posted`). In-app: `hr_ot`.
4. **Warnings / probation** — `/people/hr/warnings`, `/people/hr/probation`. Escalations use `hr_disciplinary`. **No auto-termination** on third warning or failed probation — HR must open a termination case.
5. **Exit** — Resignations `/people/hr/resignations`, terminations `/people/hr/terminations` with dual approval + clearance.
6. **Air tickets** — Entitlements from hire date + policy on `/people/hr/air-tickets`.
7. **Payroll** — FEC **28–27** cycle on `/people/payroll`. Advance draft → HR → finance → GM → processed → paid; lock separately.
8. **Recruitment / quota** — Job requests, vacancies, ATS pipeline, workforce quota. Approvals notify `hr_recruitment`.
9. **Dashboard & reports** — Overview tiles `/people/hr`; catalog exports `/people/hr/reports` (CSV / Excel / PDF). Salary and QID columns require `people.view_salary` / `hr.profile.view_sensitive`.

## Notification preferences

Users manage channels under **Inbox → Preferences**. HR categories:

- `hr_documents`, `hr_leave`, `hr_ot`, `hr_disciplinary`, `hr_payroll`, `hr_recruitment`
- Attendance field alerts remain under `people`

In-app is always written for HR events. Email is optional:

| Env | Purpose |
| --- | --- |
| `NOTIFICATION_EMAIL_WEBHOOK` | When set, HR category notifies (`notifyUsers` + Inbox preference path) POST JSON `{ toUserId, notificationId, subject, title, body, actionUrl, channel }` to this URL. When unset, email is skipped. |

Do not put PII into group WhatsApp channels. SMS/WhatsApp providers remain skipped placeholders.

## Cron / secret-guarded sweeps

| Sweep | Endpoint | Purpose |
| --- | --- | --- |
| Document expiry | `POST /api/public/hr-document-expiry-sweep` | Mark expired docs; QID/passport reminder milestones |
| Probation reminders | `POST /api/public/hr-probation-reminder-sweep` | Upcoming probation decision reminders (policy days, default 30/15/7) |

Both use `validateCronRequest` — same `CRON_SECRET` Bearer or `x-cron-secret` header as other public sweeps. Listed in API Explorer / `api-catalog`. Safe to re-run; reminder tables dedupe by document/milestone.

### Dry-run health list (ops)

Without mutating data, confirm:

1. `CRON_SECRET` is set in the deploy environment.
2. Routes respond `401` without the secret and `200` with it (empty or quiet days still return `{ ok: true, … }`).
3. `NOTIFICATION_EMAIL_WEBHOOK` optional — leave unset in staging if you only want in-app.
4. Vitest pack: `pnpm exec vitest run src/lib/hr-acceptance.test.ts` (AT#1–20).

## Phase 12 ops checklist

- [ ] Cron secrets configured for document-expiry + probation-reminder sweeps
- [ ] Optional email webhook configured only where outbound email is allowed
- [ ] Floor roles cannot open payroll salary / sensitive docs / terminations (RBAC AT#19)
- [ ] Acceptance pack green: `pnpm exec vitest run src/lib/hr-acceptance.test.ts src/lib/hr-*.test.ts src/lib/attendance-hr/hr-notify.test.ts`
- [ ] Manual UAT: one QID reminder end-to-end; one payroll lock after policy tweak (history unchanged)

## WPS caveat (Phase 8)

Payroll **WPS export** columns are **SIF-like for Finance validation only**. They are **not** bank-certified and must not be treated as a ready-to-submit Qatar WPS file without Finance review and bank tooling.

Cheque and bank-transfer populations are split by payment method / employment category; export each bucket separately when validating.

## Dashboard checklist

`/people/hr` tiles include: active headcount (with category / department / location breakdowns), on leave, serving notice, pending leave/OT, document expiry (incl. QID/passport), missing CVs / unattested education docs, warnings & escalations, probation, air tickets, payroll exceptions, vacancies & quota variance, joining/leaving soon. Each tile links into the owning module.
