# FEC-OS Architecture Audit — June 2026

**Project:** FEC-OS (`a:\Live Projects\FEC`)  
**Stack:** Next.js 15.5.19 · React 19.2 · TanStack Query 5 · Supabase SSR · TypeScript 5.8  
**Audit date:** 2026-06-27  
**Method:** Fresh source-code verification only. Prior reports ignored. Commands executed: `npm run build`, `npm run lint`, `npx tsc --noEmit`.

---

## 1. Executive Summary

FEC-OS is a large, feature-rich internal operations platform (~100 protected routes, 90 API route handlers, 39 server-action modules) built on modern dependencies with a consistent **view + lazy route + API BFF** pattern. The codebase demonstrates mature domain modeling (centralized query keys, RBAC, Zod-validated server actions, performance timers) and **builds cleanly** with zero lint or type errors.

The dominant architectural choice is **client-rendered SPA inside App Router**: nearly all feature logic lives in `"use client"` view modules that fetch via TanStack Query → REST API → Supabase. This trades away React Server Components, streaming, and edge caching for predictable interactivity. The result is acceptable for an authenticated intranet but creates measurable **auth waterfalls**, **large per-route JS bundles (up to 290 kB First Load)**, and **serverless-incompatible in-memory caches**.

**Highest-ROI gaps:** no CI/CD or automated tests, full-client protected shell, duplicate route trees (`/weekly-reports` vs `/operations/weekly-reports`), and missing production observability. Security fundamentals on API routes are solid; client-side capability gates are UI-only.

| Dimension | Score |
|-----------|------:|
| Architecture | **70** |
| Performance | **60** |
| Maintainability | **68** |
| Scalability | **57** |
| Security | **72** |
| Production Readiness | **55** |

---

## 2. Architecture Score — 70 / 100

**Strengths**
- App Router with thin `app/**/page.tsx` wrappers delegating to `src/views/*` via `lazyView()` (`src/lib/lazy-view.tsx`).
- Clear layering: `hooks/queries` → `api-client` → `app/api/**` → `lib/queries/*.core.ts` → Supabase.
- Server boundary markers (`server-only` in `src/lib/server/auth.ts`, `authorize.ts`).
- Unified API wrapper (`src/lib/server/api-route.ts`) with auth, RBAC, validation, and perf logging.
- 39 `*.functions.ts` server-action modules with Zod schemas (`src/lib/server/create-action.ts`).

**Weaknesses**
- Protected shell is entirely client-side (`app/(protected)/layout.tsx` → `useAuth` → `AppShell`).
- No RSC data fetching at page or layout level; all 97 feature `page.tsx` files are server wrappers around client views.
- Dual mutation paths: REST API routes **and** server actions coexist without a single documented convention.
- Duplicate route namespaces for weekly reports (see Maintainability).

---

## 3. Performance Score — 60 / 100

### Build output (verified `npm run build`)

| Metric | Value |
|--------|------:|
| Shared First Load JS | **103 kB** |
| Middleware | **90.4 kB** |
| Static pages generated | 176 |
| Protected routes marked `ƒ` (dynamic) | **All** |

### Largest route chunks (First Load JS)

| Route | First Load JS |
|-------|-------------:|
| `/compliance/e3-tracker/master-register` | **290 kB** |
| `/compliance/e3-tracker/*` (category pages) | **288 kB** |
| `/daily-ops/roster` | **281 kB** |
| `/operations/weekly-reports/new`, `/[id]` | **269 kB** |
| `/daily-ops/briefings`, `/incidents`, `/maintenance` | **264 kB** |
| `/people` | **277 kB** |
| `/` (home dashboard) | **239 kB** |

### Positive patterns (verified)
- `lazyView()` on all feature routes — route-level code splitting with skeleton variants.
- Chart libraries loaded via `next/dynamic` + `ssr: false` (e.g. `src/views/home-page.tsx`, `revenue-page.tsx`).
- Home dashboard defers secondary fetches until KPI success + scroll visibility + 1.5s delay (`src/views/home-page.tsx`).
- Middleware excludes `/api/*` from `getUser()` (`middleware.ts` comment + matcher).
- TanStack Query stale times tuned per domain (`src/lib/query-client.ts`).
- `fetch` priority `"high"` on dashboard KPIs (`src/hooks/queries/useDashboardKpis.ts`).

### Negative patterns (verified)
- **Triple auth/data waterfall** on every protected navigation: middleware `getUser` → client `onAuthStateChange` → `/api/auth/session` for profile/roles.
- **No** `unstable_cache`, `revalidateTag`, or `revalidatePath` usage anywhere in `src/`.
- All pages server-rendered on demand (`ƒ`) — no static shell reuse beyond shared 103 kB chunk.
- Heavy libraries (`recharts`, `jspdf`, `html2canvas`, `xlsx`) referenced from view/component code paths.
- Only **11** `loading.tsx` files for ~100 protected routes.
- `people-page.tsx` (~1,400 lines) bundles extensive UI + 5+ parallel query hooks in one chunk.

---

## 4. Maintainability Score — 68 / 100

**Strengths**
- Consistent folder layout: `src/views`, `src/components`, `src/hooks/queries` (42 query hook files), `src/lib/queries/*.core.ts`.
- Centralized `queryKeys` (`src/lib/query-keys.ts`, 253 lines).
- RBAC capabilities in `src/lib/rbac.ts` + `nav-config.ts`.
- TypeScript `strict: true`; `npx tsc --noEmit` passes.
- Zero `: any` / `as any` matches in `src/`.

**Weaknesses**
- **~145** `"use client"` files in `src/` (views, components, hooks) — high coupling to client runtime.
- Mega-components: `src/views/people-page.tsx`, `src/views/daily-ops-roster-page.tsx` (689+ lines), `src/lib/queries/dashboard-kpis.core.ts` (600+ lines).
- Duplicate views: `amc-dashboard-page.tsx` vs `amc-dashboard-route-page.tsx`.
- Duplicate document detail routes share same view (`compliance-documents/[id]` and `compliance/documents/[id]`).
- `noUnusedLocals` / `noUnusedParameters` disabled in `tsconfig.json`.
- No project-level test files; ESLint ignores `scripts/**`.

---

## 5. Scalability Score — 57 / 100

**Concerns**
- **Module-level `Map` caches** in `src/lib/server/auth.ts` (`sessionCache`, 60s TTL) and `src/lib/server/route-cache.ts` — not shared across serverless instances; stale roles possible; memory grows per warm instance.
- 90 API handlers each call `getAuthenticatedContext()` → Supabase; no connection-pool abstraction in app layer.
- All routes dynamic — CDN/edge caching unused for HTML.
- Client refetch intervals (e.g. dashboard KPIs every 60s per open tab) scale linearly with concurrent users.
- No horizontal rate limiting on API or public cron endpoints.

**Mitigations already present**
- `React.cache()` on `getAuthenticatedContext` for request-scoped deduplication.
- Inflight deduplication for roles (`src/lib/server/authorize.ts`) and auth session (`src/lib/auth-session.ts`).
- API middleware skip saves ~200ms per API call (documented in `middleware.ts`).

---

## 6. Security Score — 72 / 100

**Strengths**
- Middleware redirects unauthenticated users (`src/integrations/supabase/middleware.ts`).
- API routes require auth via `createApiRoute` / `withAuthRouteRequest` (`src/lib/server/api-route.ts`).
- Server-side RBAC enforcement (`enforceActionAuth`, `requireCapability`) — not client-only.
- Cron endpoints use `validateCronRequest` with `CRON_SECRET` (`src/lib/server/cron-auth.ts`).
- `.env.example` documents secrets; service role server-only.
- Zod validation on server actions.

**Weaknesses**
- `CapabilityGate` (`src/components/auth/capability-gate.tsx`) is **client-only** — hides UI but does not protect data if API auth misconfigured.
- **Legacy cron fallback**: if `CRON_SECRET` unset, public routes accept Supabase anon key via `apikey` header (`src/lib/server/cron-auth.ts:23-30`) — high risk in production.
- No CSP, security headers, or rate limiting in `next.config.ts`.
- Browser Supabase client exposed (`src/integrations/supabase/client.ts`) — relies entirely on RLS (not audited here).
- No Sentry/Datadog/OpenTelemetry integration in application code.

---

## 7. Production Readiness Score — 55 / 100

| Check | Status |
|-------|--------|
| `npm run build` | ✅ Pass (32.6s compile) |
| `npm run lint` | ✅ Pass |
| `npx tsc --noEmit` | ✅ Pass |
| CI workflow (`.github/workflows`) | ❌ None in project root |
| Automated tests | ❌ None |
| Error boundaries | ✅ `app/error.tsx`, `app/global-error.tsx` |
| `.env.example` | ✅ Present |
| Docker / deployment config | ❌ None |
| APM / error tracking | ❌ None |
| E2E / smoke tests | ❌ None |

---

## 8. Detailed Findings

### 8.1 Architecture & React/Next.js Patterns

---

#### A-01 · Client-only protected layout eliminates RSC benefits

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Evidence** | `app/(protected)/layout.tsx` (`"use client"`, `useAuth`, client redirect); `src/components/providers.tsx` (`"use client"`, wraps entire tree); all `src/views/*.tsx` are client components |
| **Root cause** | Auth and shell state implemented entirely on client; pages are dynamic imports of client views, not server components with serialized data |
| **Business impact** | Slower first meaningful paint, larger hydration cost, no streaming of server-fetched data, harder to optimize TTFB for dashboard-heavy users |
| **Recommended solution** | Convert protected layout to Server Component; fetch session + roles server-side (reuse `getAuthenticatedContext` + `fetchAuthSession`); pass minimal session props to a thin `ClientShell`. Migrate high-traffic pages (home, compliance KPIs) to RSC + Suspense boundaries |
| **Estimated effort** | 2–3 weeks (incremental, start with layout + home) |
| **Expected performance gain** | 200–500ms faster LCP on dashboard; 30–40% reduction in initial client JS for converted routes |

---

#### A-02 · Auth waterfall on every navigation

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Evidence** | `middleware.ts` → `supabase.auth.getUser()`; `app/(protected)/layout.tsx` waits on `useAuth` loading; `src/hooks/use-auth.tsx` calls `fetchAuthSession` → `GET /api/auth/session` (`app/api/auth/session/route.ts`) |
| **Root cause** | Redundant auth resolution at edge, client, and API layers without shared server-rendered session payload |
| **Business impact** | Blank skeleton on every hard navigation; 2–3 round trips before shell renders; multiplied under slow networks |
| **Recommended solution** | Server-render session in layout (single `getUser` + roles query); hydrate TanStack Query cache from RSC payload; keep middleware for redirect-only or use Supabase cookie refresh in middleware without blocking render |
| **Estimated effort** | 1 week |
| **Expected performance gain** | 300–800ms faster time-to-interactive on cold navigations |

---

#### A-03 · Dual data-mutation architecture (API routes + server actions)

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | 90 files in `app/api/**/route.ts`; 39 `src/lib/*.functions.ts` with `"use server"` (e.g. `people.functions.ts`, `daily-ops.functions.ts`) |
| **Root cause** | Organic growth — reads via API, writes often via server actions imported in client views |
| **Business impact** | Inconsistent error handling, caching, and auth patterns; onboarding friction; duplicate validation risk |
| **Recommended solution** | Document and enforce convention: **reads → API + TanStack Query**; **writes → server actions** (or vice versa, but pick one). Deprecate redundant API mutation endpoints over time |
| **Estimated effort** | 1 week (governance) + ongoing migration |
| **Expected performance gain** | Indirect — fewer duplicate code paths, smaller API surface |

---

#### A-04 · No Next.js caching strategy

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | Grep for `unstable_cache`, `revalidateTag`, `revalidatePath` in `src/` — **0 matches**; `src/lib/server/route-cache.ts` uses process memory only |
| **Root cause** | All data considered dynamic; custom TTL maps instead of framework cache |
| **Business impact** | Repeated identical Supabase queries across users; higher DB load as user count grows |
| **Recommended solution** | Use `unstable_cache` for read-heavy, role-agnostic aggregates (sites list, static config); add `revalidateTag` on mutations; replace `route-cache.ts` Map with tagged cache or Redis for multi-instance |
| **Estimated effort** | 1–2 weeks |
| **Expected performance gain** | 20–50% reduction in DB reads for dashboard/KPI endpoints |

---

### 8.2 Performance & Bundles

---

#### P-01 · E3 Tracker category routes ~288 kB First Load JS

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Evidence** | Build output: `/compliance/e3-tracker/cctv` etc. at **288 kB**; shared shell `E3ComplianceRegisterTable`, `FilterRow`, `KpiStrip` in `src/views/e3-tracker-category-page.tsx` |
| **Root cause** | Large shared compliance table + form dialogs + TanStack Query hooks bundled per category route; minimal further splitting beyond `lazyView` |
| **Business impact** | Slow first visit to compliance modules on mobile/tablet; high parse/compile cost on lower-end devices |
| **Recommended solution** | Extract `E3ComplianceRegisterTable` and dialog forms into separate dynamic imports; share a single category route with query param instead of 7 near-identical route chunks; tree-shake unused Radix components per route |
| **Estimated effort** | 3–5 days |
| **Expected performance gain** | 40–80 kB per route; ~1s faster FCP on 3G |

---

#### P-02 · People & roster pages among heaviest client bundles

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Evidence** | Build: `/people` **277 kB**, `/daily-ops/roster` **281 kB**; `src/views/people-page.tsx` (~1,400 lines, 5+ query hooks, CSV import, multiple tabs) |
| **Root cause** | Monolithic view files combining list UIs, dialogs, mutations, and export logic in one dynamically imported chunk |
| **Business impact** | HR and ops users experience long white/skeleton periods; high memory on tabbed interfaces |
| **Recommended solution** | Split tabs into `dynamic()` sub-views (Staff / Shifts / Training / Attendance); lazy-load CSV/import utilities (`xlsx`); defer `html2canvas` paths |
| **Estimated effort** | 1 week |
| **Expected performance gain** | 60–100 kB initial chunk reduction; faster tab switches with prefetch |

---

#### P-03 · Middleware bundle 90.4 kB

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | Build output: `ƒ Middleware 90.4 kB`; `src/integrations/supabase/middleware.ts` imports full Supabase SSR client |
| **Root cause** | Supabase auth client + types in edge middleware |
| **Business impact** | Added latency on every page navigation (not API); cold start penalty on serverless |
| **Recommended solution** | Evaluate lighter session cookie check for redirect-only; defer full `getUser` to layout server component; ensure middleware imports are minimal |
| **Estimated effort** | 2–3 days |
| **Expected performance gain** | 20–50ms per navigation; smaller cold starts |

---

#### P-04 · Sparse `loading.tsx` coverage

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | 11 `loading.tsx` files under `app/(protected)/` vs ~97 `page.tsx` routes; heavy routes like `/revenue`, `/weekly-reports/new` lack route-level loading UI |
| **Root cause** | Reliance on `lazyView` skeleton only (fires after JS loads, not during RSC suspense) |
| **Business impact** | Navigation feels unresponsive before JS chunk downloads; no instant feedback on slow networks |
| **Recommended solution** | Add `loading.tsx` to top 15 routes by bundle size (from build table) |
| **Estimated effort** | 1 day |
| **Expected performance gain** | Perceived latency −200–400ms (UX, not measurable JS) |

---

#### P-05 · Dashboard API waterfall (partially mitigated)

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Evidence** | `src/views/home-page.tsx`: KPIs first → deferred secondary (`useDashboardSecondary`) → charts gated on scroll; separate `/api/dashboard/kpis`, `/charts`, `/secondary` |
| **Root cause** | Intentional staged loading |
| **Business impact** | Multiple round trips still occur; acceptable for home but pattern may not extend to other dashboards |
| **Recommended solution** | Combine KPI + critical chart data into single API for above-the-fold; keep deferred pattern for below-fold only |
| **Estimated effort** | 2 days |
| **Expected performance gain** | 1 fewer RTT (~100–200ms) on home load |

---

### 8.3 Scalability & Caching

---

#### S-01 · In-memory session cache not serverless-safe

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Evidence** | `src/lib/server/auth.ts` lines 26–48: `const sessionCache = new Map<string, SessionCacheEntry>()` with 60s TTL |
| **Root cause** | Process-local cache on multi-instance deployments |
| **Business impact** | Role changes delayed up to 60s; unbounded map growth on long-lived instances; cache misses on every cold lambda |
| **Recommended solution** | Remove Map cache or back with Redis/KV; rely on `React.cache()` per request + short JWT claims for roles |
| **Estimated effort** | 3–5 days |
| **Expected performance gain** | Correctness improvement; marginal perf on warm instances |

---

#### S-02 · All HTML routes fully dynamic

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | Build: every protected route marked `ƒ` (dynamic) |
| **Root cause** | Cookie-based auth without `export const dynamic = 'force-static'` segments |
| **Business impact** | No edge caching of shells; origin hit on every document request |
| **Recommended solution** | Static shell with client auth island, or ISR for public/marketing pages (auth/reset-password are partially static `○`) |
| **Estimated effort** | 1–2 weeks |
| **Expected performance gain** | 50–150ms TTFB reduction at edge for shell |

---

### 8.4 Security

---

#### SEC-01 · Cron auth falls back to Supabase anon key

| Field | Detail |
|-------|--------|
| **Severity** | Critical (when `CRON_SECRET` unset in production) |
| **Evidence** | `src/lib/server/cron-auth.ts:23-30`; used by `app/api/public/escalation-sweep/route.ts`, `attendance-sync/route.ts`, `bookingqube-sync/route.ts` |
| **Root cause** | Backward-compatible fallback when `CRON_SECRET` missing |
| **Business impact** | Anyone with public anon key can invoke service-role operations (escalation sweep, attendance sync, revenue sync) |
| **Recommended solution** | **Require** `CRON_SECRET` in production; remove anon-key fallback; fail closed on boot if missing |
| **Estimated effort** | 2 hours |
| **Expected performance gain** | N/A — security critical |

---

#### SEC-02 · Client-only capability gates

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | `src/components/auth/capability-gate.tsx` — `canUserDo` on client roles only |
| **Root cause** | UI convenience without server enforcement at component level |
| **Business impact** | Low if all APIs enforce RBAC (they do via `createApiRoute`); risk if new endpoints skip auth options |
| **Recommended solution** | Add ESLint rule or codegen check that every `app/api/**/route.ts` passes `auth` option; add server-side `notFound()` in RSC layouts per capability |
| **Estimated effort** | 3 days |
| **Expected performance gain** | N/A |

---

#### SEC-03 · No security headers in Next config

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | `next.config.ts` — only `reactStrictMode` and `serverActions.bodySizeLimit` |
| **Root cause** | Not configured |
| **Business impact** | Missing CSP, HSTS, X-Frame-Options — increased XSS/clickjacking surface for internal app |
| **Recommended solution** | Add `headers()` in `next.config.ts` with strict CSP (allow Supabase origins), `frame-ancestors 'none'`, HSTS |
| **Estimated effort** | 1 day |
| **Expected performance gain** | N/A |

---

### 8.5 Maintainability & Technical Debt

---

#### M-01 · Duplicate weekly-reports route tree

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Evidence** | `app/(protected)/weekly-reports/**` (6 pages) mirrors `app/(protected)/operations/weekly-reports/**` (6 pages); identical `lazyView` imports (e.g. both `page.tsx` import `weekly-reports-list-page`); `nav-config.ts` uses `/operations/weekly-reports` only |
| **Root cause** | URL migration incomplete — legacy `/weekly-reports` paths retained |
| **Business impact** | 2× route compilation; confused bookmarks/links; SEO duplication (low concern for internal app) |
| **Recommended solution** | 301 redirect `/weekly-reports/*` → `/operations/weekly-reports/*` in `next.config.ts`; delete duplicate pages |
| **Estimated effort** | 4 hours |
| **Expected performance gain** | Smaller route manifest; reduced build time |

---

#### M-02 · Mega view files

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | `src/views/people-page.tsx` (~1,400 lines); `src/views/daily-ops-roster-page.tsx` (~689 lines); `src/lib/queries/dashboard-kpis.core.ts` (600+ lines) |
| **Root cause** | Feature velocity without decomposition |
| **Business impact** | Harder code review, test, and bundle-split; higher bug regression risk |
| **Recommended solution** | Extract tab panels, dialogs, and table columns into colocated components; split core query files by domain |
| **Estimated effort** | 1–2 weeks (incremental) |
| **Expected performance gain** | Indirect via bundle splits (see P-02) |

---

#### M-03 · No automated test suite

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Evidence** | `package.json` — no `test` script; no `*.test.ts` in project source |
| **Root cause** | Not introduced |
| **Business impact** | Regressions in 90 API routes and RBAC undetected until manual QA; blocks safe refactoring |
| **Recommended solution** | Vitest for `lib/queries/*.core.ts` and RBAC; Playwright smoke for auth + 5 critical flows |
| **Estimated effort** | 2 weeks initial harness |
| **Expected performance gain** | N/A — quality/safety |

---

#### M-04 · Duplicate AMC dashboard views

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Evidence** | `src/views/amc-dashboard-page.tsx` and `src/views/amc-dashboard-route-page.tsx` |
| **Root cause** | Route refactor leftover |
| **Business impact** | Dead code risk; developer confusion |
| **Recommended solution** | Consolidate to single view; delete unused file |
| **Estimated effort** | 2 hours |
| **Expected performance gain** | Negligible |

---

### 8.6 Production & CI/CD

---

#### PR-01 · No CI/CD pipeline

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Evidence** | No `.github/workflows/*.yml` in project root (only `node_modules`); no `Dockerfile` |
| **Root cause** | Not set up |
| **Business impact** | Broken builds/lint can reach production; no migration validation gate |
| **Recommended solution** | GitHub Actions: `npm ci` → `lint` → `tsc` → `build` on PR; optional Supabase migration dry-run |
| **Estimated effort** | 4 hours |
| **Expected performance gain** | N/A — deployment safety |

---

#### PR-02 · No observability integration

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | No Sentry/Datadog/OpenTelemetry in app source; `src/lib/performance/timer.ts` logs locally only |
| **Root cause** | Console-only perf tooling |
| **Business impact** | Production incidents diagnosed via user reports; no API latency SLAs |
| **Recommended solution** | Wire `timer` output to OpenTelemetry; add Sentry for client + server errors |
| **Estimated effort** | 3–5 days |
| **Expected performance gain** | N/A — operability |

---

### 8.7 Accessibility & SEO

---

#### UX-01 · Minimal ARIA usage

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Evidence** | Only **6 files** in `src/` contain `aria-` attributes (e.g. `ComplianceTable.tsx`, `auth-page.tsx`) |
| **Root cause** | Reliance on Radix primitives without explicit labels on custom widgets |
| **Business impact** | Screen reader users may struggle with data tables, roster calendar, compliance filters |
| **Recommended solution** | Audit top 10 pages with axe; add `aria-label` to icon-only sidebar (`app-sidebar.tsx`); table captions |
| **Estimated effort** | 1 week |
| **Expected performance gain** | N/A |

---

#### UX-02 · SEO appropriately minimal

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **Evidence** | `app/layout.tsx` — solid `metadata`, OpenGraph, manifest, icons; app is auth-gated |
| **Root cause** | Internal tool |
| **Business impact** | None for intended use case |
| **Recommended solution** | No action required |
| **Estimated effort** | — |
| **Expected performance gain** | — |

---

## 9. Comparison vs Industry Best Practices

| Practice | Vercel / Next.js 15 ideal | Stripe / Linear bar | FEC-OS current |
|----------|---------------------------|---------------------|----------------|
| Server Components for data | RSC-first, client islands | Hybrid, server data boundaries | **Client-first** — all views CSR |
| Streaming / Suspense | Route + component Suspense | Progressive page render | `lazyView` skeletons only; no RSC streaming |
| Caching | `fetch` cache + `unstable_cache` + tags | Multi-layer CDN + app cache | TanStack Query + in-memory Map only |
| Auth | Middleware refresh + server session | Centralized identity, no client gate | Middleware + **client layout gate** + API session |
| Bundle budget | < 100 kB per route typical target | Aggressive code splitting | **7 routes > 260 kB** First Load |
| CI/CD | Required on every PR | Comprehensive pipelines | **None** |
| Testing | Unit + E2E standard | High coverage on critical paths | **None** |
| Observability | Vercel Analytics / OTel | Full APM + error tracking | Console timers only |
| API design | Colocated server actions or tRPC | Versioned, rate-limited APIs | 90 REST routes — consistent wrapper ✅ |
| Security headers | Platform + app config | Strict CSP, HSTS | **Not configured** |

**Summary:** FEC-OS matches mid-tier B2B internal tools on API auth and domain structure but lags **Vercel/Linear** on RSC adoption, bundle discipline, CI/testing, and observability. It is **above average** on TanStack Query hygiene and RBAC server enforcement.

---

## 10. ROI-Focused Recommendations (Prioritized)

Only items with meaningful business return. Negligible tweaks omitted.

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| **P0** | Require `CRON_SECRET` in prod; remove anon-key fallback | 2h | Closes critical exploit path on public cron routes |
| **P0** | Add GitHub Actions: lint + tsc + build | 4h | Prevents broken deploys |
| **P1** | Server-render auth session in protected layout; eliminate client auth waterfall | 1w | 300–800ms faster navigations for all users |
| **P1** | Redirect & remove duplicate `/weekly-reports/*` routes | 4h | Less build surface, clearer URLs |
| **P1** | Split `people-page` + `daily-ops-roster-page` into dynamic tab chunks | 1w | 60–100 kB bundle reduction on 2 critical flows |
| **P1** | Vitest on `*.core.ts` query modules + RBAC (20–30 tests) | 2w | Safe refactoring of 90 API routes |
| **P2** | Replace in-memory `sessionCache` / `route-cache` with tagged `unstable_cache` or Redis | 1w | Correct role invalidation; lower DB load at scale |
| **P2** | Dynamic-import E3 compliance table/dialogs; consolidate category routes | 3–5d | ~40–80 kB × 7 routes |
| **P2** | Add `loading.tsx` to top 15 routes by bundle size | 1d | Better perceived performance |
| **P2** | Sentry + OpenTelemetry wiring to existing `timer` | 3–5d | Production incident MTTR −50% |
| **P3** | Security headers (CSP, HSTS) in `next.config.ts` | 1d | Hardening for internal browser attack surface |
| **P3** | RSC migration for home dashboard (pilot) | 2w | Template for gradual architecture upgrade |

**Explicitly deprioritized (low ROI):**
- Migrating all 90 API routes to server actions — high churn, minimal user-visible gain.
- Converting all charts to server-rendered — charts already dynamically imported with `ssr: false`.
- Full static generation of protected pages — incompatible with per-user RBAC without partial prerender (PPR) investment.

---

## Appendix A — Measurement Summary

| Measurement | Result |
|-------------|--------|
| `"use client"` files (`src/`) | ~145 |
| `"use client"` files (`app/`) | 3 (`layout`, `error`, `global-error`) |
| API route handlers | 90 |
| Server action modules (`*.functions.ts`) | 39 |
| TanStack Query hook files | 42 |
| `lazyView` route pages | 97 |
| `loading.tsx` files | 11 |
| `dynamic()` chart imports | 6 view files |
| Shared First Load JS | 103 kB |
| Largest First Load route | 290 kB (`/compliance/e3-tracker/master-register`) |
| Middleware size | 90.4 kB |
| Build status | ✅ Success |
| Lint status | ✅ Pass |
| TypeScript status | ✅ Pass |

---

## Appendix B — Blockers Encountered During Audit

- None. All commands completed successfully.
- `rg` glob over full repo timed out in some IDE searches; counts verified via scoped greps and build output.
- PowerShell does not support `&&`; commands run with `working_directory` set instead.

---

*End of report.*
