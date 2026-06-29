# Architecture

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| UI | React 19, Tailwind CSS 4, Radix UI (subset), Lucide icons |
| Data fetching | TanStack Query 5 (client reads), Supabase JS (server) |
| Auth | Supabase Auth + cookie sessions via `@supabase/ssr` |
| Database | Supabase Postgres with RLS |
| i18n | i18next / react-i18next (en, ar) |
| State | Zustand (`app-store` for site/branch selection only) |

## Request flow

```
Browser → app/(protected)/page.tsx (thin) → src/views/*-page.tsx
                ↓
         use*Query hooks → GET /api/* routes
                ↓
         createApiRoute() → Auth → Authorization → Validation (Zod) → *.core.ts
                ↓
         Supabase client (server) → Postgres / RPCs
```

Mutations use Server Actions in `src/lib/*.functions.ts` (create/update/delete/upload). Reads prefer `/api/*` + TanStack Query; legacy Server Action reads are being migrated incrementally.

**Target flow (incremental):** Browser → View → TanStack Query → API → Auth → Authz → Validation (Zod) → Service (when duplicated) → Query Core → Supabase → DB

## Directory conventions

| Path | Role |
|------|------|
| `app/` | Thin route files — compose layouts, lazy-load views, pass route params only |
| `src/views/` | Page-level UI (`"use client"` when interactivity required) |
| `src/components/` | Reusable feature and layout components |
| `src/core/` | Cross-cutting infra (API validation, logger) — migrate auth/cache here over time |
| `src/features/` | Feature modules (pilot: `compliance/`) — re-exports then physical moves |
| `src/lib/queries/*.core.ts` | Shared DB/query logic for API routes (no HTTP) |
| `src/lib/server/` | Auth, authorization, `createApiRoute`, upload/cron helpers |
| `src/lib/*.functions.ts` | Server Actions for mutations (+ transitional reads) |
| `src/hooks/queries/` | TanStack Query hooks wrapping `/api/*` |
| `src/lib/rbac.ts` | Capabilities and role checks |
| `src/lib/nav-config.ts` | Primary sidebar navigation |
| `src/lib/lazy-view.tsx` | Route-level code splitting with skeleton fallbacks |

## API route pattern

Route handlers delegate to `createApiRoute()` (alias of `withAuthRouteRequest`) or `createApiRouteStatic()` for parameterless GETs:

1. `getAuthenticatedContext()` — request-scoped cache + 60s session fingerprint cache
2. `enforceActionAuth()` — capability / role checks via `authorize.ts`
3. Input parsing — Zod schemas via `@/core/api/validation` (incremental rollout on high-traffic routes)
4. Query core module — Supabase/RPC only, no HTTP concerns

Public/cron routes (`app/api/public/*`, cron mutations) use dedicated auth helpers instead.

## Auth & RBAC

1. Middleware (`src/integrations/supabase/middleware.ts`) refreshes session and protects routes.
2. `getAuthenticatedContext()` in `src/lib/server/auth.ts` resolves user + Supabase client (cached per request).
3. `/api/auth/session` loads profile + roles via `auth-session.core.ts`.
4. Client uses `useAuth()` and `canUserDo()` for UI gating.

## Data fetching rules

- **Reads:** TanStack Query → `/api/*` → query core
- **Mutations:** Server Actions from views/forms
- **Avoid:** Server Actions for read-heavy pages (migrate to API + hooks when touched)

## Performance patterns

- `lazyView()` on heavy routes (home, revenue, E3 dashboard, maintenance, reports, etc.)
- Route-level `loading.tsx` skeletons and sidebar prefetch on hover
- Combined `/api/dashboard/secondary` batch for charts + compliance KPIs
- Auth session cache (60s) and inflight role deduplication
- Deferred secondary widgets via `useDeferredQuery` / `useDeferredVisible`
- Compliance KPIs via `get_compliance_kpis` RPC (not view counts)
- Summary endpoints vs full-table fetches where paginated

## UI system

Custom neumorphic dashboard components (`NeumorphicCard`, `KPIWidget`, etc.) plus a trimmed shadcn/ui set under `src/components/ui/`. Unused shadcn primitives were removed during cleanup — add back only when a feature needs them.

## Related docs

- `docs/ARCHITECTURE_AUDIT.md` — layer violations, gaps, priority matrix
- `docs/ENTERPRISE_ARCHITECTURE_REPORT.md` — refactor log and migration plan
- `docs/API.md` — route inventory and auth pipeline
- `docs/CLEANUP_REPORT.md` — dead code / dependency cleanup (2026-06-27)
- `docs/DATABASE.md` — schema and RPC reference
