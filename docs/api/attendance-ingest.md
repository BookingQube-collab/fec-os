# Attendance data ingestion API

External developers use this endpoint to push **daily attendance summaries** (check-in/out, hours, status) into FEC-OS. Data appears on **People → Attendance** for the matching branch and staff member.

## Endpoint

```
POST /api/public/attendance-ingest
```

**Base URL:** `https://e3fec.vercel.app` (production). Local development: `http://localhost:3000`.

## Authentication


**What this key is:** A shared secret issued by FEC for external systems to authenticate to this endpoint only. Send it as `Bearer` or `X-API-Key`; it is not a Supabase or user login token.

## Configured API Key

Use this key for production ingest to `https://e3fec.vercel.app` (rotate via FEC ops if compromised):

```
2ad345a0b0a401a84a92e1962bb9f715b6e10e776fad9bbcd005db1cb8ab04ba
```

**Security:** This value is stored in this repo for developer handoff. Anyone with repository access can read it; treat it like a password and do not expose it in client-side code or public channels.

Set `ATTENDANCE_INGEST_API_KEY` in server environment (`.env.local`). Generate with:

```bash
openssl rand -hex 32
```

Send the key using either header:

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <ATTENDANCE_INGEST_API_KEY>` |
| `X-API-Key` | `<ATTENDANCE_INGEST_API_KEY>` |

Requests without a valid key receive **401 Unauthorized**. If the key is not configured on the server, the endpoint returns **503**.

## Request

**Content-Type:** `application/json`

Send a **bulk array** in `records`, or a **single record** object (with or without wrapping in `records`).

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `records` | array | Yes* | List of attendance rows (*omit when sending a single record at the root) |
| `location` | string | Yes** | Friendly branch name, e.g. `Urban Arena - Doha Mall` |
| `location_code` | string | Alt. | FEC branch code, e.g. `UA-DM` (use instead of `location`) |
| `user_name` | string | Yes*** | Staff display or first name, e.g. `Waqar` → matches `Waqar Asghar` |
| `employee_code` | string | Alt. | Staff employee / QID code (preferred when available) |
| `date` | string | Yes | Work date — `DD-MM-YYYY` or `YYYY-MM-DD` |
| `first_check_in` | string \| null | No | Punch-in time, e.g. `2:27:51 PM` or `09:06:00` |
| `last_check_out` | string \| null | No | Punch-out time; `null` if missing |
| `total_hours_worked` | number | No | Informational (not stored separately; derived from punches when present) |
| `overtime` | boolean \| string | No | `true` / `"Yes"` if overtime applies |
| `overtime_hours` | number | No | Overtime hours (stored as `overtime_minutes`) |
| `status` | string | No | External label or internal status (see below) |

### Status values

**External labels** (from HR exports):

| External | FEC mapping |
|----------|-------------|
| `Missing Punch` | `missed_punch` |
| `Incomplete` | `missed_punch` if checkout missing; `overtime` if overtime flag set; else `present` |

**Internal values** (accepted as-is): `present`, `absent`, `late`, `early_leave`, `missed_punch`, `overtime`.

If `status` is omitted, FEC infers from punch times and overtime flag.

### Example — bulk

One row per active FEC branch (8 locations). Staff `user_name` values match venue supervisors or representative active staff from the current roster.

```json
{
  "records": [
    {
      "location": "Urban Arena - Doha Mall",
      "user_name": "Waqar",
      "date": "23-06-2026",
      "first_check_in": "2:27:51 PM",
      "last_check_out": null,
      "total_hours_worked": 0,
      "overtime": false,
      "overtime_hours": 0,
      "status": "Missing Punch"
    },
    {
      "location": "Inflatapark - City Center",
      "user_name": "Mary",
      "date": "25-06-2026",
      "first_check_in": "2:27:43 PM",
      "last_check_out": "6:27:53 PM",
      "total_hours_worked": 6,
      "overtime": false,
      "overtime_hours": 0,
      "status": "Incomplete"
    },
    {
      "location": "Kids Driving School - City Center",
      "user_name": "Ashfaq",
      "date": "28-06-2026",
      "first_check_in": "3:40:32 PM",
      "last_check_out": null,
      "total_hours_worked": 0,
      "overtime": false,
      "overtime_hours": 0,
      "status": "Missing Punch"
    },
    {
      "location": "Kids Driving School Mini - Doha Mall",
      "user_name": "Mazin",
      "date": "28-06-2026",
      "first_check_in": "10:15:00 AM",
      "last_check_out": "6:30:00 PM",
      "total_hours_worked": 8,
      "overtime": false,
      "overtime_hours": 0,
      "status": "Incomplete"
    },
    {
      "location": "Carousel - Aspire Park",
      "user_name": "Zaryab",
      "date": "28-06-2026",
      "first_check_in": "9:06:00 AM",
      "last_check_out": "7:06:11 PM",
      "total_hours_worked": 10,
      "overtime": true,
      "overtime_hours": 1,
      "status": "Incomplete"
    },
    {
      "location": "Crayons & Bricks - Vendome Mall",
      "user_name": "Rosebelt",
      "date": "27-06-2026",
      "first_check_in": "11:00:00 AM",
      "last_check_out": "7:15:00 PM",
      "total_hours_worked": 8,
      "overtime": false,
      "overtime_hours": 0,
      "status": "Incomplete"
    },
    {
      "location": "Crayons & Bricks - Dar Al Salam Mall",
      "user_name": "Romel",
      "date": "26-06-2026",
      "first_check_in": "9:30:00 AM",
      "last_check_out": "5:45:00 PM",
      "total_hours_worked": 8,
      "overtime": false,
      "overtime_hours": 0,
      "status": "Incomplete"
    },
    {
      "location": "Winter Mirage - Vendome Mall",
      "user_name": "Rabah",
      "date": "29-06-2026",
      "first_check_in": "8:00:00 AM",
      "last_check_out": "4:30:00 PM",
      "total_hours_worked": 8,
      "overtime": false,
      "overtime_hours": 0,
      "status": "Incomplete"
    }
  ]
}
```

### Example — single record

```json
{
  "location_code": "CAR-AP",
  "employee_code": "28858608039",
  "date": "2026-06-28",
  "first_check_in": "9:06:00 AM",
  "last_check_out": "7:06:11 PM",
  "overtime": true,
  "overtime_hours": 1,
  "status": "Incomplete"
}
```

## Response

```json
{
  "success": true,
  "imported": 8,
  "failed": 0,
  "errors": []
}
```

| Field | Description |
|-------|-------------|
| `success` | `true` only when every row imported without error |
| `imported` | Rows written successfully |
| `failed` | Row-level failures |
| `errors` | `{ "row": 2, "message": "Staff not found: Unknown at INF-CC" }` |

**HTTP status:**

| Code | Meaning |
|------|---------|
| 200 | At least one row imported |
| 400 | Invalid JSON or body shape |
| 401 | Missing or invalid API key |
| 422 | All rows failed validation |
| 500 | Server error |
| 503 | `ATTENDANCE_INGEST_API_KEY` not configured |

## Example curl

```bash
curl -X POST "https://e3fec.vercel.app/api/public/attendance-ingest" \
  -H "Authorization: Bearer 2ad345a0b0a401a84a92e1962bb9f715b6e10e776fad9bbcd005db1cb8ab04ba" \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "location": "Urban Arena - Doha Mall",
        "user_name": "Waqar",
        "date": "23-06-2026",
        "first_check_in": "2:27:51 PM",
        "last_check_out": null,
        "total_hours_worked": 0,
        "overtime": false,
        "overtime_hours": 0,
        "status": "Missing Punch"
      },
      {
        "location": "Inflatapark - City Center",
        "user_name": "Mary",
        "date": "25-06-2026",
        "first_check_in": "2:27:43 PM",
        "last_check_out": "6:27:53 PM",
        "total_hours_worked": 6,
        "overtime": false,
        "overtime_hours": 0,
        "status": "Incomplete"
      },
      {
        "location": "Kids Driving School - City Center",
        "user_name": "Ashfaq",
        "date": "28-06-2026",
        "first_check_in": "3:40:32 PM",
        "last_check_out": null,
        "total_hours_worked": 0,
        "overtime": false,
        "overtime_hours": 0,
        "status": "Missing Punch"
      },
      {
        "location": "Kids Driving School Mini - Doha Mall",
        "user_name": "Mazin",
        "date": "28-06-2026",
        "first_check_in": "10:15:00 AM",
        "last_check_out": "6:30:00 PM",
        "total_hours_worked": 8,
        "overtime": false,
        "overtime_hours": 0,
        "status": "Incomplete"
      },
      {
        "location": "Carousel - Aspire Park",
        "user_name": "Zaryab",
        "date": "28-06-2026",
        "first_check_in": "9:06:00 AM",
        "last_check_out": "7:06:11 PM",
        "total_hours_worked": 10,
        "overtime": true,
        "overtime_hours": 1,
        "status": "Incomplete"
      },
      {
        "location": "Crayons & Bricks - Vendome Mall",
        "user_name": "Rosebelt",
        "date": "27-06-2026",
        "first_check_in": "11:00:00 AM",
        "last_check_out": "7:15:00 PM",
        "total_hours_worked": 8,
        "overtime": false,
        "overtime_hours": 0,
        "status": "Incomplete"
      },
      {
        "location": "Crayons & Bricks - Dar Al Salam Mall",
        "user_name": "Romel",
        "date": "26-06-2026",
        "first_check_in": "9:30:00 AM",
        "last_check_out": "5:45:00 PM",
        "total_hours_worked": 8,
        "overtime": false,
        "overtime_hours": 0,
        "status": "Incomplete"
      },
      {
        "location": "Winter Mirage - Vendome Mall",
        "user_name": "Rabah",
        "date": "29-06-2026",
        "first_check_in": "8:00:00 AM",
        "last_check_out": "4:30:00 PM",
        "total_hours_worked": 8,
        "overtime": false,
        "overtime_hours": 0,
        "status": "Incomplete"
      }
    ]
  }'
```

Local development:

```bash
curl -X POST "http://localhost:3000/api/public/attendance-ingest" \
  -H "X-API-Key: 2ad345a0b0a401a84a92e1962bb9f715b6e10e776fad9bbcd005db1cb8ab04ba" \
  -H "Content-Type: application/json" \
  -d @sample-attendance.json
```

## Location name mapping

Friendly names from external systems are resolved to FEC `locations.code`:

| Friendly name (examples) | FEC code |
|--------------------------|----------|
| Urban Arena - Doha Mall | `UA-DM` |
| Inflatapark | `INF-CC` |
| Inflatapark - City Center | `INF-CC` |
| Kids Driving School - City Center | `KDS-CC` |
| Kids Driving School Mini - Doha Mall | `KDS-DM` |
| Carousel - Aspire Park | `CAR-AP` |
| Crayons & Bricks - Vendome Mall | `CB-VM` |
| Crayons & Bricks - Dar Al Salam Mall | `CB-DSM` |
| Winter Mirage - Vendome Mall | `WM-VM` |

You may send `location_code` directly to skip name resolution.

## Staff matching

Per row, FEC resolves staff at the target branch by:

1. `employee_code` (exact, case-insensitive)
2. `user_name` exact match on `staff.full_name`
3. First-name match (e.g. `Waqar` → `Waqar Asghar`) when unique at that branch

## Database tables

| Table | Action |
|-------|--------|
| `attendance_daily_summary` | Upsert by `(location_id, staff_id, work_date)` |
| `attendance_logs` | Insert check-in / check-out punches (`source: api_ingest`) |
| `attendance_exceptions` | Open exception for missed punch, overtime, etc. |

The **People → Attendance** tab reads `attendance_daily_summary` and `attendance_exceptions` — no UI changes required after ingest.

## Rate limits

- Maximum **500 records** per request.
- No per-minute rate limit is enforced in-app; use reasonable batch sizes (e.g. one day per branch per call). Contact FEC ops if you need higher throughput.

## Test sample data

Seed one sample row per active branch (8 locations):

```bash
node --env-file=.env.local scripts/seed-attendance-ingest-sample.mjs
```

Requires `ATTENDANCE_INGEST_API_KEY` in `.env.local`. Targets production (`https://e3fec.vercel.app`) by default; set `FEC_BASE_URL=http://localhost:3000` for local dev.

## Related

- Biometric device sync (raw punches): `POST /api/public/attendance-sync` (uses `CRON_SECRET`)
- CSV punch import (UI): People → Attendance (authenticated, `attendance.import` capability)
