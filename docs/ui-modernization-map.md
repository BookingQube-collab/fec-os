# FEC-OS UI modernization map

Audit date: 2026-09-29. Scope is the protected app shell and the operations home dashboard. Business logic, Supabase, RLS, auth, and API contracts stay as they are.

## 1. Current UI architecture assessment

FEC-OS is a Next.js 15 App Router app. Protected routes live under `app/(protected)` and render view components from `src/views`. The shell is `AppShell`: desktop sidebar, desktop top bar, phone header, and phone bottom nav. Role filtering is centralized in `src/lib/nav-config.ts` (`NAV_DEPARTMENTS`, capabilities, primary rail). Phone tabs were a separate list in `src/lib/mobile-nav.ts`.

Visual language is already a Crextio-style system in `src/styles.css` (cream canvas, charcoal, mustard) plus shadcn/Radix primitives in `src/components/ui` and a parallel `src/components/fec` wrapper set. Many screens also pull React Bits treatments (shiny text, spotlight cards, click sparks, a WebGL aurora).

Routes are real and numerous: operations (`/`, `/occ`, `/daily-ops`, `/tasks`, `/branches`), people and attendance (`/people`, `/people/attendance`, `/people/roster`), maintenance, arcade, inventory, procurement, events, bookings, compliance, reports, and admin. There is no JARVIS or voice route. The closest AI surface is `/admin/ai-integrations`, which is settings, not an assistant.

## 2. Components to replace

Replace these as screens are migrated. Do not delete them until callers move.

| Current | Why |
| --- | --- |
| React Bits `Aurora` (WebGL via `ogl`) on the shell | Always-on GPU work on every protected page |
| `ClickSpark` canvas on the shell | Click particles on the whole app |
| `SpotlightCard` / mouse-tracked glare on dashboard cards | Global pointer tracking for decoration |
| `BitsShine` / `ShinyText` on chrome and dashboard titles | Continuous text animation |
| `TintedKpiCard` on the home dashboard | Wrapped the spotlight card; home now uses `MetricCard` |
| Department icon rail as the only desktop IA | Eight department icons hid the product groups operators asked for |
| Phone tabs People / Attendance / Operations | Replaced by Home, Sites, Tasks, More. People and attendance stay in More |

## 3. Components to retain

- `src/lib/nav-config.ts` capability checks, active-route helpers, and department catalog. The shell only regroups links the user can already open.
- `src/components/ui/*` (Radix button, dialog, sheet, popover, tooltip, dropdown).
- `src/components/fec/*` for modules that have not been migrated.
- `HeaderSearch` behavior (nav index, `/` shortcut, keyboard list). It now uses `SearchField` for the input.
- `NotificationBell`, site `SearchableSelect`, language toggle, surge mode, profile menu, and sign-out.
- `EmployeeSectionRail` for the employee home audience.
- Dashboard data hooks (`useDashboardKpis`, charts, compliance renewals). No new metrics were invented.

## 4. React Bits Micro mapping

Patterns only. Do not paste demo components into feature screens.

| Pattern | FEC use | This session |
| --- | --- | --- |
| Hold-to-confirm | Destructive actions: delete employee, cancel approved request, delete asset, remove game, void transaction, reset data | Not built. No shell action needs it |
| Rubber / segment control | Day/Week/Month, status filters, site switch, list/grid | `SegmentControl` on the home period (today, yesterday, week, month — the periods the dashboard already queries). Site switch stays the existing searchable select |
| Voice pill | Reserved for JARVIS | No route exists. No pill, no dead link |
| Process chip | Sync, report, upload, diagnostics: running / completed / failed / retry | Not wired. Use on those jobs in a later phase |
| Short status transition | Online, Offline, Pending, Approved, Rejected, Maintenance, Critical, Warning, Completed | `StatusChip` and `StatusIndicator`. Color changes with a 180ms transition. Pulse only when critical count is above zero |

## 5. Reusable component architecture

Tokens live in `src/styles.css` (`--motion-micro` 180ms, `--motion-panel` 280ms, `--motion-section` 360ms, `--ease-standard`, status colors, `--shadow-hover`). Motion is transform, opacity, and scale, and `prefers-reduced-motion` disables it.

Primitives that are actually used are exported from `src/components/ds/index.ts`:

- `AppCard`, `InteractiveCard`, `MetricCard`, `StatusCard`
- `StatusChip`, `StatusIndicator`
- `SegmentControl`
- `PageHeader`, `SectionHeader`, `CommandBar`
- `SearchField`
- `LoadingState`, `EmptyState`
- `MobileActionBar`

Shell grouping is a presentational adapter in `src/lib/shell-groups.ts`. It assigns existing nav hrefs to Overview, Sites, Operations, Employees, Attendance, Roster, Maintenance, Arcade, Inventory, Purchase Requests, Events & Bookings, Safety, Reports, Approvals, and Settings. A group is hidden when the role has no link in it. Unassigned hrefs would surface in More; the catalog test expects none.

Not built, because nothing in this pass calls them: `ActionButton`, `AnimatedButton`, `FilterBar`, `AnimatedTabs`, `SmartTable`, `SuccessState`, `ErrorState`, `ConfirmationAction`, `QuickAction`, `FloatingAction`, process chip.

## 6. Performance risks

- `AuroraBackdrop` used a WebGL loop (`ogl`) on every protected page. Removed from `AppShell`. The cream canvas gradient on `body` remains.
- `ClickSpark` mounted a canvas over the shell. Removed from `AppShell`.
- Home spotlight cards tracked the pointer. Home sections use `AppCard` instead.
- Shiny text on the greeting, sidebar wordmark, and home headings ran continuously. Those surfaces use static text.
- `KpiAnimatedValue` counts for about 1.8s. Home metrics are static text so the entrance stays inside the 360ms section budget.
- Recharts on the home dashboard is still lazy and scroll-gated. Leave that.
- Sidebar still prefetches a short allow-list on idle, and still skips heavy routes (`/people/attendance/reports`, payroll, weekly review, corporate deals).
- Do not add WebGL, particles, canvases, global mouse tracking, or always-on animation when migrating other modules.

## 7. Implementation sequence

### Done

1. This map.
2. Phase 1 tokens and the primitives listed above, plus `ConfirmationAction` and `SiteSwitch`.
3. Phase 2 shell start:
   - Desktop sidebar: real routes only, grouped, expand/collapse, icon + label, tooltip when collapsed, active bar, keyboard focus, no badges (no existing badge counts on the rail).
   - Header: greeting, date, selected site, search, notifications, profile. JARVIS shortcut omitted because there is no route.
   - Phone bottom nav: Home (`/`), Sites (`/branches`), Tasks (`/tasks`), More. JARVIS omitted. Touch targets are at least 48px. People, attendance, and every other module stay in the More sheet.
   - Site switcher in the desktop header and the phone header. It lists active sites already returned by `useSites()`. Known codes use `venueTitle` (KDS City Center, InflataPark City Center, Urban Arena Doha Mall, KDS Mini Doha Mall, Crayons & Bricks Vendome, Crayons & Bricks Dar Al Salam, Carousel Aspire Park, plus any other real active site such as head office).
4. Operations home dashboard restyle using fields the home page already loads: sites open, work orders, overdue maintenance, critical issues (pulse only when critical > 0), staff, revenue when the role can see it, utilities, and compliance health. Late arrivals and games offline are sums of `staff_late` and `machines_down` on the branch summary the home page already requests for estate and branch views. Visitors, approvals, and events are not on that payload, so they are not shown.
5. Hold-to-confirm wired without changing mutation functions:
   - Deactivate staff (`deactivateStaff`) on the people directory archive dialog.
   - Cancel a purchase requisition only where `canCancel` is already true (`actOnPurchaseRequisition` action `cancel`). Approved, cancelled, and PO-created requests stay blocked by `CANCEL_BLOCKED`.
   - Delete asset (`deleteAsset`) on the maintenance assets list.
   - Purge imported attendance HR data (`purgeAttendanceHrImportedData`).
   - Diagnostics purge-and-heal cache and purge local client state.
6. Phase 4 site and operations presentation:
   - `src/views/branches-page.tsx` — site switch filters the league already loaded; heatmap/list is `SegmentControl`; results region uses `ds-enter`. Metrics shown are the ones on `BranchScore` (revenue, margin, tickets, incidents, bookings, score).
   - `src/views/occ-index-page.tsx` — site switch navigates to `/occ/branch/[id]`; status filter is `SegmentControl`; loading and empty use `LoadingState` / `EmptyState`.
   - `src/views/occ-branch-page.tsx` — site switch, existing ticket/incident/work-order/attraction metrics as `MetricCard` / `StatusChip`. Surge toggle mutation unchanged.
   - `src/views/daily-ops-dashboard-page.tsx` — site switch writes the existing location store (same KPI query). Cards are the eight KPIs already loaded. Pulse only when critical incidents or urgent maintenance are in the critical level. No period control was added.

### Skipped mutations (do not invent)

- Cancel an approved request: the existing action refuses `approved`. Do not add a new cancel path.
- Remove game: arcade machines have no delete/remove-game control.
- Void transaction: POS has no void mutation in the UI.
- Delete work order and delete PM schedule still use `window.confirm`. Left alone so this pass stays on the requested triggers.
- `archiveStaffMember` has no screen. The staff UI deactivates via `deactivateStaff`.
- Diagnostics resolve-all and the crash-alert test stay single-click.

### Done in Phase 5

Maintenance and arcade presentation only. Stored statuses were not renamed.

- `src/components/ds/status.tsx` maps existing status strings onto chip tones. Pulse only for stored `DOWN` and `CRITICAL`.
- `src/components/arcade/ui.tsx` `StatusBadge` and site health cards use that mapping. Site cards pulse only when that site's loaded `down` count is above zero.
- Arcade dashboard, sites, site board, machine cards, and the fault list: `MetricCard`, `SegmentControl` (status and attention queues), `LoadingState`, `EmptyState`, results region `ds-enter`. Machine cards show name, site, supplier, status, last fix, and next PM only when those fields are present. Technician name and parts are not on the list payload, so they are omitted there.
- `src/views/maintenance-page.tsx`: work-order status filter, asset criticality, PM active/overdue, and downtime open/all use the design system. `deleteWorkOrder` and `deletePmSchedule` now use `ConfirmationAction`. `deleteAsset` stays on `ConfirmationAction`.
- `src/components/maintenance/maintenance-dashboard-panel.tsx` and `src/views/daily-ops-maintenance-page.tsx` use the same cards, chips, and empty/loading states. No pulse on urgent work orders or asset criticality.

### Done in Phase 6

Employees, attendance, and rosters presentation only. Stored statuses were not renamed. `deactivateStaff` stays on `ConfirmationAction`.

- `src/components/people/staff-directory.tsx` — metric filters, search, status chips, loading and empty states, mobile cards kept, first 12 rows stagger. Critical and expired HR alerts pulse; normal rows do not.
- `src/views/people-page.tsx` — shift roster and training lists.
- `src/views/attendance-hr-dashboard-page.tsx` — existing KPIs as metric cards. Pulse only when absent is above zero.
- `src/views/attendance-hr-reports-page.tsx` — status and grid/list switches, empty and loading states. Import action kept. Purge stays on `ConfirmationAction`.
- `src/components/people/attendance-records-table.tsx` — status chips, horizontal scroll, sticky header.
- `src/views/attendance-hr-roster-page.tsx` and `src/views/daily-ops-roster-page.tsx` — roster match and staff status chips, staff empty/loading.

### Done in Phase 7

Purchase-request list and detail presentation only. `actOnPurchaseRequisition` is unchanged. Approved requests stay non-cancellable (`canCancel` is still false when status is approved).

- `src/components/ds/approval-timeline.tsx` shows only stages already on the requisition: the requester from `header.requester_name`, then each `pr_approval_steps` row (`step_role`, `status`, `step_order`). Stored roles are `dept_head`, `gm`, `ceo`, and `finance`. Labels stay the existing translations (department head is "Management Approval", not a new Site Manager stage). Shorter DOA routes stay shorter. No synthetic final stage.
- Stage words Completed, Current, Waiting, Rejected, and Returned are text. Returned comes from header `returned` or `changes_requested` on the pending step. A stage animates once only when that step's state changes between renders.
- Requisition list: `PageHeader`, status `SegmentControl` (all / pending / approved / rejected), list/cards `SegmentControl`, `SearchField`, `StatusChip`, `LoadingState`, `EmptyState`. Results region uses `ds-enter`. First 12 rows stagger.
- Approve, reject, return, and reissue buttons that already showed a pending state show "Saving…" and then a short check before the existing toast and dialog close. The server call is not delayed.

### Done in Phase 9

Phone and tablet layout only. No new install flow. The app is already a PWA: `app/manifest.ts` (name, icons, `theme_color`, `display: standalone`) and root `viewport` (`device-width`, `viewportFit: cover`, `themeColor`). Left that as-is.

- Shell content padding clears the phone bottom nav plus the safe-area inset. Nav itself was not redesigned.
- Dialogs stay inside the viewport and the close control is a 44px target.
- Wide tables on restyled screens scroll sideways with a sticky first column instead of squashing: home site readiness, branch list, maintenance work orders/assets/PM/downtime, shift and training lists, daily ops venue table, both roster tables, attendance records, requisition list and line items.
- OCC status filter uses the scrolling segment control. Venue metrics stack two-by-two on a phone.
- People directory KPI filters stay reachable in a horizontal row, phone cards keep the visible columns and the row actions, and the filter bar no longer sticks over the phone header.
- Approval timeline labels wrap.

### Done in Phase 10

Decorative always-on motion that was still mounted was removed. Functional UI stayed.

- Stopped mounting the WebGL aurora and the noise canvas on the sign-in page. Deleted `src/components/react-bits/aurora.tsx`, `src/components/layout/aurora-backdrop.tsx`, and `src/components/react-bits/noise.tsx`.
- Stopped mounting click-spark on sign-in and document open. Deleted `src/components/react-bits/click-spark.tsx`.
- Stopped mounting pointer spotlight cards on sign-in, KPI tiles, and HR document rows. Deleted `src/components/react-bits/spotlight-card.tsx` and the unused `spotlight-panel.tsx`.
- Stopped continuous shiny text on page headers and the sign-in kicker. Deleted `src/components/layout/bits-shine.tsx` and `src/components/react-bits/shiny-text.tsx`.
- Removed unused `.ds-results`.
- Site switch thumb still moves with transform only. Remeasure runs when the selected site or the site id list changes, and skips a state update when the thumb box is unchanged.

Left in place because they are not those always-on canvases: login gradient title, glare hover, border glow, blur-in heading, fade-in, star-border button chrome, count-up KPI values, pill tab scrolling, critical-status pulse, `ds-enter`, segment thumb, hold-to-confirm, and the approval timeline's one-shot stage change.

### Remaining (out of scope)

- JARVIS has no route. Do not invent one. `/admin/ai-integrations` is settings.
- Cancel-approved, remove-game, and void-transaction do not exist in the UI.
- A signed-in browser pass was not run. No dev server was started in these phases.
- Process chip, `SmartTable`, `FilterBar`, and `AnimatedTabs` are still future. Leave `src/components/fec` until each module imports `src/components/ds`.
