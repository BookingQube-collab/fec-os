# BookingQube revenue integration

FEC pulls **daily revenue per store** from BookingQube and stores it in `financial_snapshots` (`period_kind = day`). Monthly targets use existing `month_target` rows in the same table.

## Environment variables

Add these to `.env.local` (never commit secrets):

| Variable | Required | Description |
|----------|----------|-------------|
| `BOOKINGQUBE_API_URL` | For live API | Base URL, e.g. `https://api.bookingqube.example` |
| `BOOKINGQUBE_API_KEY` | For live API | API key / bearer token |
| `BOOKINGQUBE_REVENUE_PATH` | No | Path appended to base URL (default: `/revenue/daily`) |
| `BOOKINGQUBE_AUTH_STYLE` | No | `bearer` (default) or `header` |
| `BOOKINGQUBE_AUTH_HEADER` | No | Header name when `AUTH_STYLE=header` (default: `X-API-Key`) |
| `BOOKINGQUBE_USE_MOCK` | No | `true` forces mock data; `false` requires credentials |
| `BOOKINGQUBE_STORE_*` | No | Override store IDs per FEC branch (see below) |

When `BOOKINGQUBE_API_URL` and `BOOKINGQUBE_API_KEY` are both unset, the app uses **deterministic mock revenue** so the Revenue page and sync flow work without credentials.

## FEC branch mapping

| FEC code | Branch | Default BookingQube store ID env |
|----------|--------|----------------------------------|
| KDS-CC | Kids Driving School, City Center | `BOOKINGQUBE_STORE_KDS_CC` |
| INF-CC | Inflatapark, City Center | `BOOKINGQUBE_STORE_INF_CC` |
| UA-DM | Urban Arena, Doha Mall | `BOOKINGQUBE_STORE_UA_DM` |
| CB-VM | Crayons & Bricks, Vendome | `BOOKINGQUBE_STORE_CB_VM` |
| CB-DSM | Crayons & Bricks, Dar Al Salam | `BOOKINGQUBE_STORE_CB_DSM` |
| CAR-AP | Carousel, Aspire Park | `BOOKINGQUBE_STORE_CAR_AP` |

Mapping logic lives in `src/lib/integrations/bookingqube.ts`. Set each env var to the **store ID returned by BookingQube**.

## Expected API response

Single endpoint (GET) with query params `from`, `to`, `currency=QAR`:

```
GET {BOOKINGQUBE_API_URL}/revenue/daily?from=2026-06-01&to=2026-06-15&currency=QAR
Authorization: Bearer {BOOKINGQUBE_API_KEY}
```

Response shape:

```json
{
  "stores": [
    {
      "store_id": "bq-store-123",
      "store_name": "Kids Driving School",
      "date": "2026-06-15",
      "revenue": 12500.00,
      "currency": "QAR"
    }
  ]
}
```

Aliases supported: `storeId`, `storeName`, `amount`, `period_start`, or a top-level `data` array instead of `stores`.

All dates are **calendar days in Asia/Qatar**.

## Sync methods

### Manual (Revenue page)

Users with `ceo`, `coo`, or `cfo` roles see **Sync from BookingQube**. This runs the `syncBookingQubeRevenue` server action, upserts daily snapshots, and writes an `audit_log` entry (`action = bookingqube.sync`).

### Cron / scheduled job

```http
POST /api/public/bookingqube-sync
apikey: {SUPABASE_PUBLISHABLE_KEY}
Content-Type: application/json

{"from":"2026-06-01","to":"2026-06-15"}
```

Omit the body to sync **current month through today** (Qatar timezone).

Example (daily at 6:00 Qatar time via external cron):

```bash
curl -X POST "https://your-fec-app.example/api/public/bookingqube-sync" \
  -H "apikey: YOUR_SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json"
```

## Monthly target calculation

1. **Target** — `financial_snapshots` where `period_kind = month_target` and `period_start` = first day of current month (Qatar).
2. **Actual (MTD)** — sum of `period_kind = day` revenue from month start through today.
3. **Progress %** — `mtd_revenue / target_revenue × 100` per branch and estate-wide.

Seed demo targets with `node --env-file=.env.local scripts/seed-demo-data.mjs` or set `month_target` rows manually per location.

## Database

- **Writes:** `financial_snapshots` (upsert on `location_id`, `period_kind`, `period_start`)
- **Audit:** `audit_log` after each sync
- **Currency:** QAR (`Asia/Qatar`)

Existing cost fields (`cogs`, `labor`, etc.) are preserved on re-sync; only `revenue` is updated from BookingQube.
