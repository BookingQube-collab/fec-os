# FEC-OS Navigation Performance Report

**Date:** June 27, 2026  
**Scope:** Client-side route transitions within the authenticated app (`app/(protected)/*`)  
**Focus:** Time-to-interactive after clicking sidebar/links, not initial marketing/auth load

---

## Executive Summary

FEC-OS is a **Next.js 15 App Router** application with a well-designed data layer (TanStack Query → `/api/*` → Supabase) and several intentional performance patterns already in place (`lazyView`, deferred widgets, idle prefetch, middleware scoped to pages only). Navigation still feels heavy because **most routes (~74%) load large client views synchronously**, the **entire protected shell is a client layout** that re-mounts auth logic on every transition, and **global assets (fonts, i18n, sidebar) ship on every route**.

The highest-impact improvements for faster navigation are:

1. **Apply `lazyView()` to the remaining ~70 routes** that still statically import `@/views/*`.
2. **Split the protected layout** — server auth gate + thin client `AppShell` instead of a full `"use client"` layout.
3. **Migrate fonts to `next/font`** and stop loading Google Fonts via a blocking `<link>`.
4. **Deduplicate compliance expiry fetches** shared between the topbar and banner.
5. **Add route-level `loading.tsx` skeletons** to high-traffic segments missing them.

A production build was attempted for bundle analysis but **failed** during page-data collection (see [Build analysis](#build-analysis)). Fix that before relying on First Load JS numbers.

---

## Current Stack & Architecture

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15.5 (App Router) |
| UI | React 19, Tailwind CSS 4, Radix UI, Lucide icons |
| Data fetching | TanStack Query 5 → `/api/*` → Supabase Postgres |
| Auth | Supabase Auth + `@supabase/ssr` cookies |
| Client state | Zustand (`app-store`: location, language, surge mode) |
| i18n | i18next / react-i18next (en + ar bundled client-side) |

### Navigation flow (today)

```
Click Link / sidebar
  → Middleware: supabase.auth.getUser()          (~network round-trip per navigation)
  → Client RSC payload + JS chunk for target page
  → Protected layout (client): useAuth() gate      (may show skeleton)
  → AppShell (always mounted): sidebar, topbar, compliance banner
  → View chunk loads (sync import OR lazyView dynamic import)
  → TanStack Query hooks fire → /api/* requests
  → Paint
```

### What already works well

- **`lazyView()` helper** (`src/lib/lazy-view.tsx`) — route-level code splitting with skeleton fallbacks.
- **TanStack Query defaults** — 60s stale time, 5min gc, `refetchOnWindowFocus: false` (`src/lib/query-client.ts`).
- **Per-domain stale windows** — dashboard KPIs at 30s, sites at 10min, etc.
- **Deferred loading hooks** — `useDeferredQuery`, `useDeferredVisible`, `useScrollGatedVisible`, `DeferredSection`.
- **Home dashboard** — charts split via `next/dynamic` + `retryImport`; secondary data batched via `/api/dashboard/secondary`.
- **Sidebar prefetch** — `router.prefetch()` on hover + idle prefetch of primary nav items (`src/components/layout/app-sidebar.tsx`).
- **Sites idle prefetch** — `SitesPrefetch` in `AppShell` (`src/components/providers/data-providers.tsx`).
- **Middleware scoped to pages** — API routes skip middleware auth (~200ms saved per API call, per comment in `middleware.ts`).
- **Perf instrumentation** — `createTimer` in middleware + `useNavigationPerf` hook; enable with `PERF_LOG=1`.

---

## Findings

### Critical

#### 1. Most routes lack code splitting (~74% of app pages)

Only **26 routes** use `lazyView()`. **~74 routes** statically import views:

```tsx
// Slow pattern (bundles entire view into page chunk immediately)
import Page from "@/views/people-page";
export default Page;
```

```tsx
// Fast pattern (already used on home, revenue, reports, etc.)
import { lazyView } from "@/lib/lazy-view";
export default lazyView(() => import("@/views/home-page"), "dashboard");
```

**Impact:** Navigating to `/people`, `/snags`, `/compliance/*`, `/tasks`, etc. downloads and parses large JS bundles before showing content. Several views exceed 600–1,400 lines (`people-page.tsx`, `snags-page.tsx`, `daily-ops-roster-page.tsx`, `leaderboard-page.tsx`).

**Files:** All `app/(protected)/**/page.tsx` without `lazyView` — e.g. `app/(protected)/people/page.tsx`, `app/(protected)/snags/page.tsx`, `app/(protected)/compliance/expiry-alerts/page.tsx`.

**Action:** Wrap every view import in `lazyView()`, choosing the appropriate `RouteLoadingVariant`. Prioritize the largest views and most-clicked nav items first.

---

#### 2. Protected layout is entirely client-side

`app/(protected)/layout.tsx` is `"use client"` and gates on `useAuth()` before rendering `AppShell`.

**Impact:**

- Every protected route shares a **client layout boundary** — no server-side streaming of page content past auth.
- **Double auth work:** middleware already calls `getUser()` (`src/integrations/supabase/middleware.ts`), then the client waits for Supabase `onAuthStateChange` + `/api/auth/session` for profile/roles (`src/hooks/use-auth.tsx`).
- Users may see **AuthShellSkeleton** on navigations if auth state briefly re-evaluates.

**Action:**

- Move auth redirect to middleware only (already redirects unauthenticated users).
- Convert layout to a **Server Component** that reads session server-side (or trusts middleware) and renders `<AppShell>{children}</AppShell>`.
- Keep `AppShell` as the sole client boundary for sidebar/topbar.

---

#### 3. Production build fails — no bundle baseline

`npm run build` compiled successfully but failed during **Collecting page data**:

```
[Error [PageNotFoundError]: Cannot find module for page: /compliance/amc-contracts/new]
```

**Impact:** Cannot produce First Load JS / route size table from `@next/bundle-analyzer` or build output. This also risks deployment failures.

**Suspected file:** `app/(protected)/compliance/amc-contracts/new/page.tsx` imports `AmcContractFormPage` from `@/views/amc-contract-page` — verify the export/build graph resolves correctly after a clean `.next` delete.

**Action:** Fix the build error, then re-run `npm run build` and optionally add `@next/bundle-analyzer` to establish baselines.

---

### High

#### 4. Google Fonts loaded via blocking external `<link>`

`app/layout.tsx` loads Sora + Manrope from `fonts.googleapis.com` in `<head>`. ESLint flagged `@next/next/no-page-custom-font`.

**Impact:** Extra DNS + TLS + CSS fetch on every navigation; fonts are not self-hosted or subset; blocks optimal `font-display` integration.

**Action:** Migrate to `next/font/google`:

```tsx
import { Sora, Manrope } from "next/font/google";
// Apply via className on <body>, remove external <link> tags
```

---

#### 5. Duplicate compliance expiry API calls on many routes

Two shell components fetch expiry notifications independently:

| Component | File | Query filters |
|-----------|------|---------------|
| Topbar badge | `src/components/layout/app-topbar.tsx` | `{ locationId, summaryOnly: true }` — **always enabled** for eligible roles |
| Global banner | `src/components/compliance/compliance-expiry-banner.tsx` | `{ locationId, limit: 5, summaryOnly: true }` — on `/` and `/compliance/*` |

Because `queryKeys.compliance.expiryNotifications(filters)` includes the full filters object, **these are separate cache entries** → duplicate `/api/compliance/expiry-notifications` requests on dashboard and compliance pages.

**Action:** Standardize on one summary query key (e.g. `{ summaryOnly: true, locationId }` only). Have the banner consume topbar/shell-level cached data, or lift fetch to a single provider.

---

#### 6. Heavy chart libraries not consistently lazy-loaded

`recharts` is dynamically imported on the home dashboard (`src/views/home-page.tsx` → `home-dashboard-charts.tsx`), but **statically imported** in:

- `src/views/revenue-page.tsx`
- `src/views/compliance-trend-page.tsx`
- `src/views/compliance-command-page.tsx`
- `src/views/vendor-scorecard-page.tsx`
- `src/components/compliance-tracker/E3TrackerDashboardCharts.tsx`

**Impact:** ~200KB+ gzip added to route chunks for chart pages; slows parse/compile on navigation.

**Action:** Mirror the home page pattern — `dynamic(() => import(...), { ssr: false })` with skeleton fallbacks. Combine with `lazyView()` on those routes.

---

#### 7. Sparse `loading.tsx` coverage

Only **7** `loading.tsx` files exist:

- `app/(protected)/loading.tsx`
- `app/(protected)/daily-ops/loading.tsx`
- `app/(protected)/maintenance/loading.tsx`
- `app/(protected)/occ/loading.tsx`
- `app/(protected)/issues/loading.tsx`
- `app/(protected)/compliance/amc-dashboard/loading.tsx`
- `app/(protected)/compliance/e3-tracker/loading.tsx`

**~90+ routes** have no segment loading UI. Next.js can show instant skeletons during RSC fetch + chunk download if `loading.tsx` exists at the segment.

**Action:** Add `loading.tsx` to high-traffic groups: `/compliance`, `/people`, `/tasks`, `/snags`, `/daily-ops/*`, `/operations/weekly-reports`.

---

### Medium

#### 8. Global i18n bundles both locales on every route

`src/i18n/index.ts` imports **both** `en.json` and `ar.json` at module init; `Providers` imports `@/i18n` globally.

**Impact:** All translation strings ship in the main client bundle even for English-only users.

**Action:** Use i18next lazy backends (`i18next-http-backend` or dynamic `import()`) to load locale files on demand when language changes.

---

#### 9. App sidebar imports 30+ Lucide icons statically

`src/components/layout/app-sidebar.tsx` imports a large icon set for the overflow menu (`MORE_NAV`). The sidebar is mounted on **every** protected navigation.

**Impact:** Increases the shared shell bundle size; icons cannot tree-shake as aggressively when referenced in large static arrays.

**Action:** Map icon names to dynamic imports, or colocate icons with nav config using per-item imports already used in `PRIMARY_NAV`.

---

#### 10. Mega-views combine many features in one file

Examples:

| View | Lines | Route |
|------|-------|-------|
| `people-page.tsx` | ~1,400 | `/people` |
| `snags-page.tsx` | ~710 | `/snags` |
| `daily-ops-roster-page.tsx` | ~690 | `/daily-ops/roster` |
| `leaderboard-page.tsx` | ~590 | `/leaderboard` |

**Impact:** Even with `lazyView`, a single chunk must download entirely before any tab/section renders.

**Action:** Split into tab-level sub-components with nested `dynamic()` imports (roster vs training vs staff management on people page).

---

#### 11. Aggressive idle route prefetch may compete with active page

`app-sidebar.tsx` idle-prefetches **all primary nav routes** after 2–4s. On slow connections this can steal bandwidth from the user's current page data fetches.

**Action:** Prefetch only hovered routes (already implemented) and remove or gate bulk idle prefetch behind `navigator.connection.saveData` / `effectiveType` checks.

---

#### 12. No `next/image` usage

No application code uses `next/image`. Icons use PNGs from `/public`; no responsive image pipeline.

**Impact:** Low today (few content images), but any future photo-heavy pages will miss automatic optimization.

**Action:** Adopt `next/image` when adding branch photos, avatars from uploads, etc.

---

### Low

#### 13. Client auth session uses `setTimeout(0)` deferral

`use-auth.tsx` defers `INITIAL_SESSION` handling to avoid Supabase callback deadlock. Adds one macrotask before `loading` flips false.

**Action:** Acceptable trade-off; revisit when upgrading `@supabase/ssr` if deadlock is fixed upstream.

---

#### 14. Zustand persist hydration

`app-store` uses `persist` with localStorage. Minor hydration mismatch risk; not a major navigation cost.

---

#### 15. Duplicate weekly-reports route trees

Both `/weekly-reports/*` and `/operations/weekly-reports/*` exist with parallel pages. Doubles route table size and maintenance surface (not a runtime perf issue unless both are linked).

---

## Build Analysis

```
npm run build
✓ Compiled successfully in 44s
✗ Failed collecting page data for /compliance/amc-contracts/new
```

**Could not extract:**

- Per-route First Load JS sizes
- Shared chunk breakdown
- Static vs dynamic route classification from build output

**Warnings observed:**

- `@next/next/no-page-custom-font` on `app/layout.tsx`
- ESLint config module type overhead (add `"type": "module"` to `package.json` or rename config)

**Recommended follow-up after build fix:**

```bash
npm install -D @next/bundle-analyzer
# next.config.ts: wrap with withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })
ANALYZE=true npm run build
```

---

## Actionable Recommendations (Prioritized)

### Quick wins (hours – 1 day)

| # | Action | Expected effect |
|---|--------|-----------------|
| 1 | Add `lazyView()` to top 10 largest/most-used routes (`people`, `snags`, `tasks`, `compliance/expiry-alerts`, `leaderboard`, `daily-ops/roster`, etc.) | Smaller initial chunk per navigation; skeleton shows immediately |
| 2 | Unify compliance expiry query key between topbar and banner | −1 API call on dashboard/compliance routes |
| 3 | Migrate to `next/font/google` | Faster text render; removes render-blocking external CSS |
| 4 | Add `loading.tsx` to `/compliance`, `/people`, `/tasks` segment layouts | Instant visual feedback during transition |
| 5 | Dynamic-import `recharts` on `revenue-page.tsx` and compliance chart pages | −100–200KB gzip from those route chunks |
| 6 | Fix `/compliance/amc-contracts/new` build error | Unblocks bundle analysis and deploy |

### Medium-term (1–2 weeks)

| # | Action | Expected effect |
|---|--------|-----------------|
| 7 | Refactor `app/(protected)/layout.tsx` to server component + client `AppShell` only | Removes client auth waterfall; enables RSC streaming |
| 8 | Extend `lazyView()` to **all** remaining `app/(protected)/**/page.tsx` files | Consistent code-splitting architecture-wide |
| 9 | Split mega-views (`people-page`, `snags-page`) into lazy sub-modules | Faster time-to-first-content within heavy pages |
| 10 | Lazy-load i18n locale JSON | Smaller global bundle |
| 11 | Gate bulk sidebar prefetch on network conditions | Less bandwidth contention on slow links |

### Longer-term

| # | Action | Expected effect |
|---|--------|-----------------|
| 12 | Server Components for read-only list pages (where interactivity is minimal) | Less client JS; data fetched on server |
| 13 | Partial Prerendering (PPR) / `loading.js` + Suspense boundaries per widget | Stream shell while data loads |
| 14 | Route-based data prefetch map (prefetch TanStack queries on `router.prefetch`) | Data ready when chunk arrives |
| 15 | Add `@next/bundle-analyzer` to CI with size budgets | Regression prevention |

---

## Suggested Metrics to Track

### Core Web Vitals (field data — real users)

| Metric | Target | Why it matters for navigation |
|--------|--------|-------------------------------|
| **INP** (Interaction to Next Paint) | < 200ms | Sidebar clicks, filter toggles after route change |
| **LCP** | < 2.5s | Largest dashboard widget/chart visible |
| **CLS** | < 0.1 | Skeleton → content swaps in AppShell |

### Custom navigation metrics (already partially instrumented)

Enable `PERF_LOG=1` in staging and track:

| Timer name | Source | What to watch |
|------------|--------|---------------|
| `middleware` | `middleware.ts` | Supabase `getUser()` latency per pathname |
| `route-navigation` | `use-navigation-perf.ts` | Client-side pathname change → double rAF paint |

**Suggested additions:**

- Log TanStack Query `queryFn` duration per route (wrap `apiGet` in `createTimer`)
- Measure **JS chunk download + parse** via Performance API (`resource` entries for `_next/static/chunks`)
- Track **API waterfall count** on first paint after navigation (aim for parallel ≤ 4)

### Bundle budgets (after build fix)

| Budget | Suggestion |
|--------|------------|
| Shared shell chunk (layout + AppShell + sidebar) | < 150KB gzip |
| Per-route lazy chunk (median) | < 80KB gzip |
| Per-route lazy chunk (p95, chart pages) | < 180KB gzip |

---

## Reference: Routes Already Using `lazyView()`

These 26 routes follow the target pattern:

- `/` (home)
- `/revenue`, `/reports`, `/issues`, `/maintenance`, `/inventory`
- `/admin`, `/branches`, `/vendors`, `/occ`
- `/daily-ops`, `/compliance/amc-dashboard`, `/compliance/amc-renewals`, `/compliance/e3-tracker`
- `/weekly-reports/*` and `/operations/weekly-reports/*` (12 routes)

All other protected routes should be migrated to match.

---

## Reference: Key Files

| Concern | Path |
|---------|------|
| Route code splitting | `src/lib/lazy-view.tsx` |
| Protected layout (client) | `app/(protected)/layout.tsx` |
| App shell | `src/components/layout/app-shell.tsx` |
| Sidebar prefetch | `src/components/layout/app-sidebar.tsx` |
| Auth middleware | `middleware.ts`, `src/integrations/supabase/middleware.ts` |
| Client auth | `src/hooks/use-auth.tsx` |
| Query defaults | `src/lib/query-client.ts` |
| Perf timers | `src/lib/performance/timer.ts`, `src/hooks/use-navigation-perf.ts` |
| Root fonts | `app/layout.tsx` |
| Architecture notes | `docs/ARCHITECTURE.md` (Performance patterns section) |

---

*Report generated from static codebase analysis and a partial production build attempt.*
