# Vercel environment variables (FEC-OS)

Names only — set values in the Vercel dashboard or via `vercel env add`. Do not commit secrets.

## Core Supabase (use Vercel integration)

Connect **Supabase** to the Vercel project (`fec-os`) in the Vercel dashboard. The integration (green lightning bolt) should provision Production variables such as:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The integration may also add related names (`POSTGRES_*`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, etc.). **Keep integration-managed variables**; do not duplicate the same values with manual entries.

This app reads the canonical trio above on the client/server. Server code also accepts `SUPABASE_SECRET_KEY` and the browser accepts `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as fallbacks if the integration uses those names instead.

**Do not** manually copy Supabase keys into Development/Preview on Vercel unless you need deployed non-production environments to talk to Supabase. For local work, use `.env.local` (see below).

## Optional (add manually in Vercel if needed)

These are **not** created by the Supabase integration. Add them in the Vercel UI only when you use the feature:

| Variable | Environments | Notes |
|----------|--------------|-------|
| `CRON_SECRET` | Production (and Preview if testing crons) | Protects `/api/public/*` cron routes. Generate with `openssl rand -hex 32`. Without it, scheduled cron routes will not authenticate. |
| `ATTENDANCE_INGEST_API_KEY` | Production (and Preview if testing) | `POST /api/public/attendance-ingest` — see [attendance-ingest.md](./api/attendance-ingest.md). |

Other optional keys (`BOOKINGQUBE_*`, `LOVABLE_API_KEY`, `OPENAI_API_KEY`, etc.) — see `.env.example`.

## Local development

Copy `.env.example` to `.env.local` and fill in the same variable names. Use `vercel env pull` only if you intentionally maintain Vercel env vars for Development/Preview.
