# Cleanup Report

**Date:** 2026-06-27  
**Scope:** Full production-readiness cleanup audit  
**Validation:** `npx tsc --noEmit` ✅ · `npm run build` ✅

---

## Summary

| Category | Action |
|----------|--------|
| Dead code removed | 28 files (~120 KB source) |
| Obsolete docs removed | 9 files (~120 KB) |
| Docs created | README + 4 reference docs |
| npm packages removed | 26 dependencies |
| npm packages added | 1 (`server-only` — was imported but missing) |
| DB migrations deleted | 0 (2 pending kept) |
| Build status | Passes |

**Estimated impact:** ~27 fewer npm packages in `node_modules`; removed unused Radix/shadcn UI primitives reduce client bundle surface. Shared First Load JS remains **103 kB** (unchanged baseline). Heaviest routes unchanged: E3 category pages (~426 kB), `/revenue` (~324 kB), `/reports` (~278 kB).

---

## 1. Deleted files

### Dead code / legacy

| File | Reason |
|------|--------|
| `src/hooks/use-auth-profile.ts` | No imports anywhere |
| `src/lib/lovable-error-reporting.ts` | Lovable platform hook; never imported |
| `src/lib/error-capture.ts` | Legacy h3 error handler; never imported |
| `src/lib/error-page.ts` | Legacy HTML error page; never imported |
| `scripts/fix-views.mjs` | One-time Vite→Next codemod; completed |
| `scripts/fix-views-2.mjs` | One-time codemod; completed |
| `scripts/fix-views-3.mjs` | One-time codemod; completed |
| `scripts/migrate-to-next.mjs` | One-time migration script; completed |
| `.lovable/plan.md` | Experimental Lovable scaffold |
| `.lovable/project.json` | Experimental Lovable scaffold |

### Unused shadcn/ui components (never imported outside `ui/`)

| File |
|------|
| `src/components/ui/accordion.tsx` |
| `src/components/ui/aspect-ratio.tsx` |
| `src/components/ui/breadcrumb.tsx` |
| `src/components/ui/calendar.tsx` |
| `src/components/ui/card.tsx` |
| `src/components/ui/carousel.tsx` |
| `src/components/ui/chart.tsx` |
| `src/components/ui/command.tsx` |
| `src/components/ui/context-menu.tsx` |
| `src/components/ui/drawer.tsx` |
| `src/components/ui/form.tsx` |
| `src/components/ui/hover-card.tsx` |
| `src/components/ui/input-otp.tsx` |
| `src/components/ui/menubar.tsx` |
| `src/components/ui/navigation-menu.tsx` |
| `src/components/ui/pagination.tsx` |
| `src/components/ui/radio-group.tsx` |
| `src/components/ui/resizable.tsx` |
| `src/components/ui/scroll-area.tsx` |
| `src/components/ui/separator.tsx` |
| `src/components/ui/sidebar.tsx` |
| `src/components/ui/toggle.tsx` |
| `src/components/ui/toggle-group.tsx` |
| `src/components/ui/tooltip.tsx` |

**Kept UI primitives (actively used):** alert, alert-dialog, avatar, badge, button, checkbox, collapsible, dialog, dropdown-menu, input, label, popover, progress, select, sheet, skeleton, slider, sonner, switch, table, tabs, textarea.

### Obsolete documentation

| File | Reason |
|------|--------|
| `docs/PERFORMANCE_REPORT.md` | Superseded; fixes already applied |
| `docs/PERFORMANCE_PHASE2_REPORT.md` | Obsolete audit |
| `docs/PERFORMANCE_PHASE3_REPORT.md` | Obsolete audit |
| `docs/PERFORMANCE_BUDGET.md` | Obsolete |
| `docs/FEC_PLATFORM_AUDIT_REPORT.md` | One-time platform audit |
| `docs/FEC_SMARTMAINTAIN_AUDIT.md` | One-time module audit |
| `docs/FEC_CONTROL_SYSTEM_SPRINT1.md` | Sprint notes |
| `docs/FEC_CONTROL_SYSTEM_SPRINT2.md` | Sprint notes |
| `docs/FEC_CONTROL_SYSTEM_SPRINT3.md` | Sprint notes |

---

## 2. Documentation kept / created

| File | Status |
|------|--------|
| `README.md` | **Created** — project overview, scripts, layout |
| `docs/ARCHITECTURE.md` | **Created** — stack, request flow, auth, perf patterns |
| `docs/DEPLOYMENT.md` | **Created** — env vars, build, cron endpoints |
| `docs/DATABASE.md` | **Created** — migrations, pending status, index notes |
| `docs/BOOKINGQUBE.md` | **Kept** — current external API integration |
| `docs/CLEANUP_REPORT.md` | This file |

---

## 3. Removed npm dependencies (26)

| Package | Was only used by |
|---------|------------------|
| `@hookform/resolvers` | Deleted `form.tsx` |
| `@radix-ui/react-accordion` | Deleted accordion |
| `@radix-ui/react-aspect-ratio` | Deleted aspect-ratio |
| `@radix-ui/react-context-menu` | Deleted context-menu |
| `@radix-ui/react-hover-card` | Deleted hover-card |
| `@radix-ui/react-menubar` | Deleted menubar |
| `@radix-ui/react-navigation-menu` | Deleted navigation-menu |
| `@radix-ui/react-radio-group` | Deleted radio-group |
| `@radix-ui/react-scroll-area` | Deleted scroll-area |
| `@radix-ui/react-separator` | Deleted separator |
| `@radix-ui/react-toggle` | Deleted toggle |
| `@radix-ui/react-toggle-group` | Deleted toggle-group |
| `@radix-ui/react-tooltip` | Deleted tooltip |
| `cmdk` | Deleted command |
| `embla-carousel-react` | Deleted carousel |
| `i18next-browser-languagedetector` | Never imported (i18n uses fixed `lng: "en"`) |
| `input-otp` | Deleted input-otp |
| `react-day-picker` | Deleted calendar |
| `react-hook-form` | Deleted form |
| `react-resizable-panels` | Deleted resizable |
| `vaul` | Deleted drawer |

### Added

| Package | Reason |
|---------|--------|
| `server-only` | Required by `src/lib/server/auth.ts`; was missing from `package.json` |

### Kept (still used)

- `recharts` — direct imports in dashboard/compliance charts (not via deleted `chart.tsx`)
- `html2canvas`, `jspdf`, `jspdf-autotable` — PDF/export flows
- `xlsx` — E3 register Excel import/export
- `tw-animate-css` — `@import` in `src/styles.css`
- `date-fns`, `zustand`, `lucide-react`, etc.

---

## 4. Database

- **Applied migrations:** 48 / 50
- **Pending (NOT deleted):**
  - `20260627130000_expiry_horizon_30_days.sql`
  - `20260627140000_daily_ops_roster.sql`
- **Deleted migrations:** none

### Duplicate / overlapping indexes (report only)

| Pair | Note |
|------|------|
| `idx_compliance_events_due` / `idx_compliance_events_due_type_status` | Overlapping coverage; second is more selective |
| `idx_shifts_location_starts` / `idx_shifts_location_starts_staff` | Roster migration extends shift indexing |
| Three files sharing `20260622160000_*` timestamp | Distinct content; all applied |

No changes made to applied migration SQL.

---

## 5. Bundle analysis (post-cleanup build)

### Shared baseline

- First Load JS shared: **103 kB**
- Middleware: **90.4 kB**

### Heaviest routes (First Load JS)

| Route | Size |
|-------|------|
| `/compliance/e3-tracker/*` (category pages) | ~426 kB |
| `/revenue` | 324 kB |
| `/reports` | 278 kB |
| `/vendors/scorecard` | 261 kB |
| `/daily-ops/roster` | 273 kB |
| `/compliance/trend` | 273 kB |

### Largest static chunks (`.next/static/chunks/`)

| Size | Chunk |
|------|-------|
| 403 KB | `2170a4aa-*.js` (likely xlsx/recharts vendor) |
| 360 KB | `1583-*.js` |
| 323 KB | `164f4fb6-*.js` |
| 194 KB | `ad2866b8-*.js` (likely jspdf/html2canvas) |
| 185 KB | `framework-*.js` |

### Safe future optimizations (not done — need confirmation)

- Lazy-load `xlsx` / `jspdf` only on export actions (reports, E3 register)
- Split E3 category pages — shared ~426 kB suggests heavy shared vendor chunk
- Self-host Google Fonts (Sora, Manrope) instead of runtime `<link>` in layout

---

## 6. Other changes

| Change | Detail |
|--------|--------|
| `tsconfig.json` | Removed stale excludes for deleted Vite/TanStack Router files |

---

## 7. Validation results

```
npx tsc --noEmit     → exit 0
npm run build        → exit 0 (163 routes, 18.9s compile)
npm install          → removed 27 packages, added 1
```

Pre-existing ESLint warning (unchanged): custom fonts in `app/layout.tsx` `@next/next/no-page-custom-font`.

---

## 8. Flagged but NOT deleted (needs confirmation)

| Item | Reason kept |
|------|-------------|
| `src/lib/lazy-view.tsx` | Used by 11 App Router pages for code-splitting (briefly removed, restored) |
| `src/lib/performance/*` | Active auth/API instrumentation |
| `demo-data/` | Used by seed/import scripts |
| `scripts/bundle-pending-migrations.mjs` | Manual SQL bundle utility |
| Duplicate routes `/compliance-documents` vs `/compliance/documents` | Different views (list vs register) — both linked |
| `components.json` | shadcn CLI config for future component adds |
| Pending DB migrations (2) | Active work, not abandoned |
| `console.log` in `src/lib/performance/timer.ts` | Intentional `[perf]` dev instrumentation |

---

## 9. Depcheck false positives (do not remove)

These are used by tooling/config, not application imports:

- `@eslint/js`, `eslint-config-next`, `eslint-config-prettier`, `eslint-plugin-prettier`, `globals`, `typescript-eslint` — ESLint
- `@tailwindcss/postcss`, `postcss`, `tailwindcss` — Tailwind v4 build
- `tw-animate-css` — depcheck missed CSS `@import`

---

*Generated by cleanup audit 2026-06-27*

---

## Cleanup Pass 2 — 2026-06-27

**Scope:** Incremental pass after weekly reports, people CRUD, E3 license docs, roster WhatsApp share, and related features. Prior Pass 1 deletions were **not repeated**. No applied migrations deleted. No business logic changed.

**Validation:** `npm run lint` ✅ (0 errors, 1 pre-existing font warning) · `npx tsc --noEmit` ✅ · `npm run build` ✅ (176 routes, ~65s compile)

### Summary

| Category | Action |
|----------|--------|
| Dead code removed | 3 files |
| Docs consolidated | 1 duplicate report removed |
| npm packages removed | 0 |
| npm packages added | 1 (`@eslint/eslintrc` — was imported by `eslint.config.js`) |
| Build fix | Split `node:crypto` out of client-importable `staff-import.ts` |
| Bundle optimization | Lazy-loaded `jspdf` / `xlsx` on export paths |
| DB migrations deleted | 0 |

---

### 1. Deleted files

| File | Reason |
|------|--------|
| `src/components/layout/top-bar.tsx` | Unused re-export of `app-topbar`; no imports |
| `src/components/layout/module-placeholder.tsx` | Never imported |
| `docs/ARCHITECTURE_REFACTOR_REPORT.md` | Consolidated into `ENTERPRISE_ARCHITECTURE_REPORT.md` + `ARCHITECTURE_AUDIT.md` + `ARCHITECTURE.md` (same-day incremental notes) |

**Flagged but kept (working / intentional):**

| Item | Reason |
|------|--------|
| `app/(protected)/weekly-reports/*` (6 routes) | Legacy aliases mirroring `/operations/weekly-reports/*`; nav uses operations path |
| `src/features/compliance/index.ts` | Pilot re-export barrel; no imports yet — kept for planned migration |
| All 51 migration SQL files | Applied or pending active work |

---

### 2. Removed dependencies

None. Depcheck false positives unchanged (`tw-animate-css`, ESLint/Tailwind toolchain).

### Added

| Package | Reason |
|---------|--------|
| `@eslint/eslintrc` | Required by `eslint.config.js` (`FlatCompat`); depcheck reported missing |

---

### 3. Optimizations

| Change | Detail |
|--------|--------|
| Lazy `jspdf` / `jspdf-autotable` | `src/views/reports-page.tsx`, `src/lib/pdf/board-pack.ts`, `src/lib/pdf/executive-weekly-report.ts` — load on export click only |
| Lazy `xlsx` | `src/components/compliance-tracker/E3MasterRegisterActions.tsx` — load on `.xlsx` import only |
| Server-only UUID helpers | New `src/lib/staff-import-ids.ts` (`server-only` + `node:crypto`); client-safe parsers remain in `staff-import.ts` — fixes webpack `node:crypto` build error on `/people` |
| ESLint ignores | Removed stale Vite/TanStack Router paths from `eslint.config.js` |

**Already lazy (unchanged):** `use-report-export.ts` (pdf/xlsx), `share-roster-image.ts` (html2canvas).

---

### 4. Bundle notes (post–Pass 2 build)

**Shared baseline:** First Load JS **103 kB** · Middleware **90.4 kB**

**Notable route changes vs Pass 1:**

| Route | Pass 1 | Pass 2 | Notes |
|-------|--------|--------|-------|
| `/reports` | 278 kB | **139 kB** | jspdf removed from initial chunk |
| `/people` | — | 276 kB | New people CRUD route |
| `/operations/weekly-reports/*` | — | 244–269 kB | New weekly reporting module |
| `/daily-ops/roster` | 273 kB | 281 kB | Roster + WhatsApp share |
| E3 category pages | ~426 kB | ~287–289 kB | Improved vs Pass 1 (shared chunk shift) |

**Heaviest routes (Pass 2):** `/revenue` (324 kB), E3 master register (~289 kB), `/vendors/scorecard` (261 kB), `/compliance/trend` (272 kB).

**Deferred bundle work:**

- Further split E3 category shared vendor chunk (~287 kB per category route)
- Lazy-load `recharts` on chart-heavy dashboards where not already deferred
- Self-host Google Fonts (Sora, Manrope) — pre-existing ESLint warning
- Add redirects from `/weekly-reports` → `/operations/weekly-reports` once bookmarks confirmed

---

### 5. Database (report only)

- **Applied migrations:** not re-verified against remote this pass; **48** last known (Pass 1)
- **Pending (NOT deleted):** 3 files — see [DATABASE.md](./DATABASE.md)
- **Duplicate indexes/RPCs:** Same pairs as Pass 1 (compliance due indexes, shifts indexes, three `20260622160000_*` timestamp files) — no SQL changes

---

### 6. Build / lint / tsc results

```
npm run lint         → exit 0 (1 warning: custom fonts in app/layout.tsx)
npx tsc --noEmit     → exit 0
npm run build        → exit 0 (176 routes)
```

Pre-existing CSS optimizer warning: `.print\:hidden` pseudo-class in generated CSS (Tailwind print utility).

---

### 7. Remaining technical debt

| Item | Severity | Notes |
|------|----------|-------|
| No automated tests | High | Unchanged |
| API Zod validation coverage | High | Partial (`src/core/api/validation.ts`) |
| 100% client views | Medium | By design; limits RSC benefits |
| Duplicate weekly-report route trees | Low | 12 routes, 2 URL prefixes |
| `npm audit` (4 vulns) | Low | Not addressed this pass |
| `periodBounds` duplicated in 3 files | Medium | See ARCHITECTURE_AUDIT.md |
| Pilot `src/features/compliance/` | Low | Unused barrel export |

---

*Cleanup Pass 2 completed 2026-06-27*
