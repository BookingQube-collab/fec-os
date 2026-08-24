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
| `CRON_SECRET` | Production (and Preview if testing crons) | Protects `/api/public/*` cron routes including hourly ADMS fetch (`/api/public/attendance-adms-poll`). Generate with `openssl rand -hex 32`. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. |
| `ATTENDANCE_INGEST_API_KEY` | Production (and Preview if testing) | `POST /api/public/attendance-ingest` — see [attendance-ingest.md](./api/attendance-ingest.md). |
| `ADMS_COMM_KEY` | Production (if BioPro SA40 / ZKTeco ADMS push is used) | Shared secret for `/iclock/*`. Pair with a mapped device SN in Time & Attendance → Settings. Optional `ADMS_IP_ALLOWLIST`. |

Other optional keys (`BOOKINGQUBE_*`, etc.) — see `.env.example` if present.

### AI drafts (PR, event plan, reports, checklists)

These features call a hosted LLM. Without a key they fall back to templates / “AI unavailable”.

| Variable | Notes |
|----------|--------|
| `OPENAI_API_KEY` | **Recommended self-serve key.** Buy at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Default model is `gpt-4o-mini` (override with `OPENAI_MODEL`). Set a monthly spend cap under organization billing limits. |
| `LOVABLE_API_KEY` | Optional. Tried first if set. Uses Lovable’s gateway (`ai.gateway.lovable.dev`) with `google/gemini-3-flash-preview` — this is a Lovable credit key, **not** a Google Gemini key. Required for CEO brief, KB embeddings, and a few other Lovable-only paths. |

A Google `GEMINI_API_KEY` or Anthropic key is **not** read by the app. Do not put a real key in git — use `.env.local` only.

## Local development

Copy `.env.example` to `.env.local` and fill in the same variable names. Use `vercel env pull` only if you intentionally maintain Vercel env vars for Development/Preview.
