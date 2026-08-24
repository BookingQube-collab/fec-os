# AI Provider Integrations

FEC-OS sends all model traffic through a **server-side gateway**. Browser clients never receive full API keys. Admin configures Gemini, Groq, and OpenRouter under **Admin → Settings → AI Integrations** (`/admin/ai-integrations`). CEO/COO only (existing `admin.view` plus role level ≥ 95).

## Architecture

```
Module (events / PR / maintenance drafts)
        ↓
src/lib/ai/gateway.ts  (generateText / generateStructuredOutput / analyzeImage)
        ↓
Primary → secondary → tertiary (enabled + tested only)
        ↓
Official provider HTTP APIs
        ↓
Last-resort env fallback: GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY,
then LOVABLE_API_KEY / OPENAI_API_KEY
```

Keys in Admin are encrypted at rest (AES-256-GCM) with `AI_CREDENTIALS_ENCRYPTION_KEY`. List/get APIs return `key_last_four` / `••••••••••••AB12` only.

## Database

Migration: `supabase/migrations/20260823210000_ai_provider_integrations.sql`

| Table | Purpose |
| --- | --- |
| `ai_provider_configs` | Per-provider encrypted key, model, enable, connection status |
| `ai_routing_settings` | Primary/secondary/tertiary, timeout, retries, auto-fallback, optional monthly caps |
| `ai_usage_daily` | Lightweight success/fail, tokens, estimated cost, latency, module, date |

RLS is on; `authenticated` has no grants. Only `service_role` (server) reads ciphertext. Audit rows go to existing `audit_log` via `log_audit` and never include the key.

## Environment

Generate a 32-byte master key:

```bash
openssl rand -hex 32
```

Add to **server-only** env (never `NEXT_PUBLIC_*`):

```
AI_CREDENTIALS_ENCRYPTION_KEY=
```

Optional last-resort keys if Admin cards are empty: `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`.  
Optional OpenRouter identity: `NEXT_PUBLIC_SITE_URL` or `AI_HTTP_REFERER` (FEC-OS origin), `X-Title` is always `FEC-OS`.

Legacy drafts still accept `LOVABLE_API_KEY` / `OPENAI_API_KEY` after the configured chain and the three provider env keys.

Placeholders only live in `.env.example`. Real values belong in gitignored `.env.local` or the host’s secret store.

## Deploy

1. Set `AI_CREDENTIALS_ENCRYPTION_KEY` on the server.
2. Run `npm run db:push` (applies `20260823210000_ai_provider_integrations.sql`).
3. Open `/admin/ai-integrations` as CEO/COO.
4. Paste each key, **Test Connection**, then **Save**. A provider is not primary-eligible until the test succeeds.
5. Set routing (no duplicate providers). Disable stops new traffic. Remove key drops that provider from routing and keeps audit history.

Local import of env keys into encrypted rows (no keys printed):

```bash
node --env-file=.env.local scripts/seed-ai-provider-keys.mjs
```

Opening the Admin page also hydrates missing rows from server env when the encryption key is present.

## Official provider calls

- **Gemini** — `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `X-goog-api-key`. Default / manual fallback model: `gemini-flash-latest`. List: `GET .../v1beta/models`. Docs: [API key](https://ai.google.dev/gemini-api/docs/api-key), [pricing](https://ai.google.dev/gemini-api/docs/pricing), keys at [AI Studio](https://aistudio.google.com/apikey).
- **Groq** — OpenAI-compatible `https://api.groq.com/openai/v1` (`chat/completions`, `models`). Keys: [console.groq.com/keys](https://console.groq.com/keys).
- **OpenRouter** — `https://openrouter.ai/api/v1` with `Authorization: Bearer`, `HTTP-Referer`, `X-Title: FEC-OS`. `openrouter/free` is a documented option. Keys: [openrouter.ai/keys](https://openrouter.ai/keys).

Free-tier availability and pricing/data terms can change.

## Test Connection

Uses list-models first. If that fails for a non-auth reason, a tiny generate ping is tried. Auth failures are not retried and do not fall back.

## Routing

Only **enabled + connected** providers appear in the chain. Timeouts, 429, 5xx, and unavailable models fall back when auto-fallback is on. Auth failures stop. Replacing a key marks the provider **Untested**.

Usage costs are **estimates** from a maintainable map in `src/lib/ai/pricing.ts`, not invoices.

## How modules call the gateway

```ts
import { completeJsonViaGateway, completeTextViaGateway } from "@/lib/ai/complete-json";
import { embedTexts } from "@/lib/ai/embeddings";

await completeJsonViaGateway(messages, { moduleSource: "events.plan_draft" });
await completeTextViaGateway([{ role: "user", content: prompt }], { moduleSource: "ceo.daily_brief" });
```

All product AI features (event plans, PR drafts, maintenance requests/work orders, incidents, briefings, rosters, weekly reports, CEO briefs, issues/complaints triage, revenue RCA, forecasts, checklists, and knowledge-base RAG) call this gateway. Do not call Gemini, Groq, OpenRouter, Lovable, or OpenAI directly from modules.

## Adding a provider

1. Add a `provider_code` check in the migration (or a follow-up additive migration).
2. Register catalog metadata in `src/lib/ai/catalog.ts`.
3. Implement generate/list in `src/lib/ai/providers.ts` (or an OpenAI-compatible path).
4. Add i18n how-to steps in `en.json` / `ar.json`.
5. Keep keys out of client bundles, logs, and git.

## Security

- Never log secrets or return full keys.
- CSRF/session: same Next + Supabase cookie auth as other admin routes.
- Test/save are rate-limited in memory (10/min/user).
- Sanitize provider errors before UI and audit metadata.
