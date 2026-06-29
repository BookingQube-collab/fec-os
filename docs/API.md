# API Reference

FEC-OS exposes **86 HTTP route handlers** under `app/api/`. Almost all protected routes use the same auth pipeline.

## Request pipeline

```
HTTP Request
  → withAuthRouteRequest / createApiRoute
    → getAuthenticatedContext()     # session + Supabase client (request-scoped cache)
    → enforceActionAuth()           # capability / role checks
    → handler(context, request)     # optional Zod parse → query core
  → NextResponse.json(result)
```

Public and cron endpoints bypass this wrapper and use dedicated secrets/tokens.

## Auth wrappers

| Export | Use when |
|--------|----------|
| `withAuthRouteRequest(handler, request, auth?)` | Handler needs `Request` (query params, body) |
| `withAuthRoute(handler, auth?)` | Static GET with no request parsing |
| `createApiRoute` | Alias of `withAuthRouteRequest` (preferred name for new routes) |
| `createApiRouteStatic` | Alias of `withAuthRoute` |

Defined in `src/lib/server/api-route.ts`.

### Authorization options

```typescript
{
  capability?: Capability;           // single required capability
  anyCapability?: Capability[];        // at least one
  minRoleLevel?: number;               // RPC role level floor
  requireRole?: boolean;               // default true
}
```

Capabilities are defined in `src/lib/rbac.ts`.

## Input validation

**Server Actions** use Zod via `createAuthenticatedAction(schema, handler)` in `src/lib/server/create-action.ts`.

**API routes** — incremental adoption via `src/core/api/validation.ts`:

```typescript
import { parseWithSchema, dashboardKpisQuerySchema, searchParamsToObject } from "@/core/api/validation";
import { searchParams } from "@/lib/server/api-route";

const query = parseWithSchema(dashboardKpisQuerySchema, searchParamsToObject(searchParams(request)));
```

Invalid input throws `ApiValidationError` → **HTTP 400** with `{ error: string }`.

### Validated routes (2026-06-27)

| Route | Schema |
|-------|--------|
| `GET /api/dashboard/kpis` | `dashboardKpisQuerySchema` |
| `GET /api/dashboard/secondary` | `dashboardSecondaryQuerySchema` |
| `GET /api/compliance/kpis` | `complianceKpisQuerySchema` |

## Response codes

| Status | Condition |
|--------|-----------|
| 200 | Success — JSON body |
| 400 | `ApiValidationError` — malformed query/body |
| 401 | Missing/invalid session |
| 403 | `ForbiddenError` — insufficient capability |
| 500 | Unhandled error — logged via `@/core/logger` |

## Caching

Several read routes use in-memory cache (`src/lib/server/route-cache.ts`) plus HTTP headers:

| Route | TTL | Cache-Control |
|-------|-----|---------------|
| `/api/dashboard/kpis` | 30s | `private, max-age=30, stale-while-revalidate=60` |
| `/api/dashboard/secondary` | 60s | `private, max-age=60, stale-while-revalidate=120` |
| `/api/compliance/kpis` | 60s | `private, max-age=60, stale-while-revalidate=120` |

Location-scoped dashboard KPIs skip in-memory cache when `locationId` is set.

## Route inventory by domain

### Auth

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/auth/session` | Session cookie | Profile + roles; 401 returns empty session |

### Dashboard

| GET | `/api/dashboard/kpis` | `dashboard.view` | Period, location, view filters |
| GET | `/api/dashboard/charts` | `dashboard.view` | Chart series |
| GET | `/api/dashboard/secondary` | `dashboard.view` | Batched `include=charts,complianceKpis,renewals` |

### Compliance (22 routes)

Includes `/api/compliance/kpis`, `/api/compliance/register`, `/api/compliance/e3-tracker/*`, expiry alerts, documents, calendar, trend, command, etc.

### Daily operations (7 routes)

`/api/daily-ops/kpis`, `roster`, `incidents`, `complaints`, `briefings`, `maintenance`.

### Revenue (6 routes)

`/api/revenue/pnl`, `pace`, `leakage`, `asset-roi`, `monthly-progress`, `sync-status`.

### AMC / maintenance / operations

AMC dashboard, contracts, renewals, schedules; maintenance PM/downtime; operations dashboard, branches, site-summary.

### Other

People, tasks, snags, issues, inventory, vendors, utilities, OCC, CEO overview, admin users, bookings, risk, notifications, public sync endpoints.

Full file list: `app/api/**/route.ts` (86 files).

## Public / cron endpoints

| Path | Auth mechanism |
|------|----------------|
| `/api/public/bookingqube-sync` | Shared secret header |
| `/api/public/attendance-sync` | Shared secret header |
| `/api/public/attendance-ingest` | `ATTENDANCE_INGEST_API_KEY` (Bearer or `X-API-Key`) — [docs](./api/attendance-ingest.md) |
| `/api/public/escalation-sweep` | Cron secret |
| `/api/compliance/process-expiry-notifications` | Cron secret |

See [DEPLOYMENT.md](./DEPLOYMENT.md) for environment variables.

## Query cores

Handlers delegate DB access to `src/lib/queries/*.core.ts` — no HTTP, no auth (caller must pass `AuthContext`).

## Client consumption

TanStack Query hooks in `src/hooks/queries/` call these endpoints. Query keys in `src/lib/query-keys.ts`.

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — stack and conventions
- [ARCHITECTURE_AUDIT.md](./ARCHITECTURE_AUDIT.md) — validation/caching gaps
- [DATABASE.md](./DATABASE.md) — RPCs and schema
