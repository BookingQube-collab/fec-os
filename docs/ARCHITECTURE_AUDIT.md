# Architecture Audit

**Date:** 2026-06-27  
**Scope:** Full FEC Operations Platform (Next.js 15, React 19, Supabase)  
**Method:** Static analysis, dependency tracing, route/handler review  
**Prior work:** [CLEANUP_REPORT.md](./CLEANUP_REPORT.md) (28 files, 26 packages removed — not repeated here)

---

## Executive summary

FEC-OS is a **mature monolith** with a clear intended layering (thin routes → views → TanStack Query → API → query cores → Supabase). The codebase is **production-ready** (build passes ~163 routes) but organized as a **flat `src/lib` + `src/views`** layout rather than feature-sliced modules. The highest-impact gaps are **missing API input validation**, **100% client views**, **no automated tests**, and **duplicate date/period helpers** across query cores.

No circular `lib ↔ views` dependencies were found. Layer violations are minor (e.g. `lazy-view.tsx` in `lib` importing a layout component).

---

## 1. Layer violations

| Issue | Severity | Location | Notes |
|-------|----------|----------|-------|
| `lib` imports `components` | Low | `src/lib/lazy-view.tsx` → `@/components/layout/route-loading` | Acceptable for route splitting; could move to `src/shared/` |
| Views contain data-fetch orchestration | Medium | All 80 views (`"use client"`) | By design today; limits RSC benefits |
| Server Actions still used for some reads | Medium | `src/lib/*.functions.ts` (38 files) | Documented transitional pattern |
| Query cores with inline `console.*` | Low | `dashboard-kpis.core.ts`, `compliance-kpis.core.ts`, etc. | Should use `@/core/logger` incrementally |
| RBAC checked in route AND view | Low | e.g. `dashboard/secondary` + client `canUserDo` | Defense in depth, not a bug |

**No violations found:** `src/lib` → `src/views` imports, SQL in route handlers, auth bypass in protected routes.

---

## 2. Duplicate business logic

| Logic | Duplicated in | Recommendation |
|-------|---------------|----------------|
| `periodBounds(period)` | `dashboard.functions.ts`, `dashboard-kpis.core.ts`, `operations-dashboard.core.ts` | Extract to `src/core/database/period-bounds.ts` when next touched |
| Compliance status derivation | `compliance-derive.ts`, `location-compliance-derive.ts`, `compliance-tracker/status.ts` | Document ownership; consolidate only if behavior diverges |
| E3 location code mapping | `compliance-expiry-access.ts`, E3 tracker constants | Single source already mostly in `LOCATION_CODE_TO_E3` |
| Route cache key construction | Repeated per-route | Acceptable; keys are route-specific |
| Auth + RBAC enforcement | `createApiRoute` + `createAuthenticatedAction` | Shared via `enforceActionAuth` — good |

---

## 3. Feature coupling

| Coupling | Example | Risk |
|----------|---------|------|
| Dashboard ↔ Compliance | `/api/dashboard/secondary` batches charts + compliance KPIs + renewals | Intentional perf optimization; couples modules at API layer |
| Compliance ↔ AMC | Renewals, expiry alerts, service history share AMC tables/RPCs | Domain overlap; acceptable with shared query cores |
| Daily Ops ↔ People | Roster imports staff/shifts | Shared `people` + `daily-ops` cores |
| E3 Tracker ↔ Vendors | Vendor register cross-links | Feature navigation coupling only |
| Global app store | Zustand `app-store` for site/branch selection | Used across most views — expected |

**Mitigation (deferred):** Feature folders under `src/features/*` with explicit public exports.

---

## 4. Circular dependencies

| Check | Result |
|-------|--------|
| `src/lib` → `@/views` | **None** |
| `src/lib` → `@/components` | **1 file** (`lazy-view.tsx`) |
| `src/views` → `@/views` | **4 files** (composition, not cycles) |
| Query cores → Server Actions | **None** (correct direction) |
| Hooks → Views | **None** |

**Risk: Low.** No runtime circular import issues detected.

---

## 5. Overuse of Client Components

| Metric | Value |
|--------|-------|
| `src/views/*.tsx` with `"use client"` | **80 / 80 (100%)** |
| `src/components/*.tsx` with `"use client"` | **35 / 60 (58%)** |
| Server Components in views | **0** |

**Impact:** All page JS ships to client; RSC streaming and server-side data prefetch limited to API routes.

**Mitigation already in place:** `lazyView()` on 14 heavy routes, `loading.tsx` skeletons (7), deferred queries (`useDeferredQuery`).

**Deferred:** Split large views into server wrapper + client island (high effort, no behavior change required now).

---

## 6. Large page components

| Lines | File |
|------:|------|
| 709 | `src/views/snags-page.tsx` |
| 654 | `src/views/daily-ops-roster-page.tsx` |
| 639 | `src/views/maintenance-page.tsx` |
| 625 | `src/views/leaderboard-page.tsx` |
| 617 | `src/views/location-compliance-tracker-page.tsx` |
| 613 | `src/views/snag-detail-page.tsx` |
| 500 | `src/views/home-page.tsx` |
| 494 | `src/views/compliance-document-detail-page.tsx` |
| 474 | `src/views/issues-page.tsx` |
| 463 | `src/views/revenue-page.tsx` |

**10 views exceed 450 lines.** Extraction targets: table columns, filters, modals, export handlers into `src/components/<feature>/`.

---

## 7. Heavy shared modules

| Module | Concern |
|--------|---------|
| `src/lib/queries/dashboard-kpis.core.ts` | ~530 lines; multiple RPC fallbacks |
| `src/lib/queries/e3-compliance-tracker.core.ts` | Large; many E3 endpoints |
| `src/lib/rbac.ts` + `nav-config.ts` | Central; changes affect entire app |
| `src/integrations/supabase/types.ts` | Generated; large but expected |
| `recharts`, `xlsx`, `jspdf` | Heavy vendors on E3/reports/revenue routes |

**Bundle hotspots (from CLEANUP_REPORT):** E3 category ~426 kB, `/revenue` 324 kB, `/reports` 278 kB first-load JS.

---

## 8. Poor folder organization

**Current layout:**

```
app/                    # 85 protected pages + 86 API routes
src/views/              # 80 page components (flat)
src/components/         # Feature + layout + ui (mixed)
src/lib/                # Everything else (38 actions, 25 query cores, domain helpers)
src/hooks/queries/      # 42 TanStack Query hooks
src/integrations/       # Supabase
```

**Gaps vs target structure:**

| Target | Status |
|--------|--------|
| `src/core/{api,auth,cache,database,logger,config}` | **Partial** — `src/core/api`, `src/core/logger` added; auth/cache remain in `src/lib/server/` |
| `src/shared/{components,ui,hooks,utils,lib,types}` | **Not started** — aliases via `@/` paths only |
| `src/features/{dashboard,compliance,...}` | **Pilot** — `src/features/compliance/index.ts` re-exports only |
| Thin `app/` routes | **Mostly yes** — 14 use `lazyView`, rest re-export views directly |

---

## 9. Unused architecture

| Item | Status |
|------|--------|
| `createApiRoute` name | Documented primary wrapper; **~79 routes import `withAuthRouteRequest` directly** (same fn) |
| `logE3TrackerPerf` raw `console.log` | **Refactored** — uses `@/core/logger` (8 E3 routes) |
| `src/core/*` (pre-refactor) | Did not exist; now started |
| Legacy Vite/TanStack Router | Removed in prior cleanup |
| Duplicate compliance doc routes | **Intentional** — `/compliance-documents` vs `/compliance/documents` serve different views |

---

## 10. Missing validation (Zod on API inputs)

| Layer | Zod coverage |
|-------|--------------|
| Server Actions (`createAuthenticatedAction`) | **~35 / 38** handlers with schemas |
| API routes (`app/api/**`) | **3 / 86** after this audit (dashboard KPIs, dashboard secondary, compliance KPIs) |
| Public/cron routes | Custom auth; manual parsing |

**High-traffic routes still without Zod (priority backlog):**

- `/api/auth/session` (GET, no body — lower priority)
- `/api/dashboard/charts`
- `/api/compliance/e3-tracker/*` (8 routes)
- `/api/daily-ops/*` (7 routes)
- `/api/revenue/*` (6 routes)
- `/api/snags`, `/api/issues`, `/api/tasks`

**Infrastructure added:** `src/core/api/validation.ts` + `ApiValidationError` → HTTP 400 in `createApiRoute`.

---

## 11. Missing caching

| Layer | Status |
|-------|--------|
| In-memory route cache | **Present** — `src/lib/server/route-cache.ts`; used on KPI/compliance list routes |
| HTTP Cache-Control headers | **Present** on dashboard/compliance KPI routes |
| TanStack Query stale times | **Present** in hooks (varies by domain) |
| Auth session cache | **60s** fingerprint cache in `getAuthenticatedContext` |
| Next.js `unstable_cache` / RSC cache | **Not used** |
| Supabase query dedup | Via TanStack Query on client |

**Gap:** Route cache is process-local (lost on cold start / multi-instance). Acceptable for current scale; document for horizontal scaling.

---

## 12. Missing error boundaries

| Boundary | Status |
|----------|--------|
| `app/error.tsx` | **Present** — client boundary with reset |
| `app/global-error.tsx` | **Added** in this refactor |
| Route-level `error.tsx` | **None** — deferred (protected layout could add one) |
| API error shape | `{ error: string }` JSON; 401/403/400/500 mapped |
| React Query error UI | Per-view (inconsistent) |

---

## 13. Missing logging

| Category | Status |
|----------|--------|
| Performance | `createTimer` + `[perf]` in dev / `PERF_LOG=1` |
| API errors | `@/core/logger` in `api-route.ts` (standardized) |
| RPC fallbacks | Ad hoc `console.warn` in query cores |
| Audit trail | **None** — no structured audit log for mutations |
| Security events | **None** — failed auth logged as generic API error |

**Added:** `src/core/logger/index.ts` with categories (`api`, `auth`, `audit`, `security`, `perf`, `db`, `app`).

---

## 14. Missing testing structure

| Item | Status |
|------|--------|
| Unit tests | **0** |
| Integration tests | **0** |
| E2E tests | **0** |
| Test runner in `package.json` | **None** |
| CI test step | **None** |

**Recommendation:** Add Vitest + MSW for query cores and API validation schemas first (highest ROI, no UI).

---

## 15. Thin routes audit

| Pattern | Count | Examples |
|---------|-------|----------|
| `lazyView(...)` | 14 | `/`, `/revenue`, `/maintenance`, E3 dashboard |
| Direct view re-export | ~71 | `import Page from "@/views/snags-page"` |
| Inline logic in `page.tsx` | **0** | Good |

All `app/(protected)/**/page.tsx` files are ≤5 lines — **routes are thin**.

---

## Priority matrix

| Priority | Item | Effort | Risk |
|----------|------|--------|------|
| P0 | Zod on remaining high-traffic APIs | Medium | Low |
| P1 | Extract `periodBounds` shared helper | Low | Low |
| P1 | Vitest for query cores + validation | Medium | None |
| P2 | Compliance feature folder migration | High | Medium |
| P2 | Lazy-load xlsx/jspdf on export only | Medium | Low |
| P3 | Server component islands in top 5 views | High | Medium |
| P3 | Route-level error boundaries | Low | Low |

---

*See [ENTERPRISE_ARCHITECTURE_REPORT.md](./ENTERPRISE_ARCHITECTURE_REPORT.md) for changes applied in this session and migration plan.*
