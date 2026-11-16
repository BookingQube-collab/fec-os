# Meta messaging (WhatsApp Cloud API + Instagram)

Official Meta Business APIs only — no personal-account bots, scrapers, or browser automation.

WhatsApp **inbox** lives at Call Center → WhatsApp (`/call-center/whatsapp`). Meta Cloud API credentials, templates, and first-message auto-reply are under **Call Center → Settings**. Instagram credentials (and verify token) are also on Settings; messaging uses `src/lib/meta/` and `/api/public/meta/instagram` (agent inbox UI still pending).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/public/call-center/whatsapp` | WhatsApp Cloud API webhook (verify + inbound + call-center inbox) |
| GET/POST | `/api/public/meta/instagram` | Instagram Messaging webhook (verify + inbound + env auto-reply) |
| GET | `/api/public/meta/instagram?status=1` | Config status flags (no secrets) |
| GET/POST | `/api/public/meta/send` | Protected outbound send helper (WhatsApp or Instagram) |

## Environment variables

Copy into `.env.local` (see `.env.example`). Never commit real tokens.

| Variable | Channel | Notes |
|----------|---------|--------|
| `META_APP_ID` | Shared | Meta app ID |
| `META_APP_SECRET` | Shared | Used for `X-Hub-Signature-256` verification |
| `META_GRAPH_API_VERSION` | Shared | Optional; default `v21.0` |
| `META_WEBHOOK_VERIFY_TOKEN` | Shared | Hub challenge token (or per-channel overrides) |
| `META_REQUIRE_WEBHOOK_SIGNATURE` | Shared | Set `true` to reject POSTs without valid HMAC |
| `META_AUTO_REPLY_ENABLED` | Shared | `true` / `1` enables env-driven auto-reply (Instagram + `/meta/send` helpers) |
| `META_AUTO_REPLY_TEXT` | Shared | Reply body when auto-reply is enabled |
| `META_SEND_SECRET` | Shared | Bearer secret for `/api/public/meta/send` (falls back to `CRON_SECRET`) |
| `META_ACCESS_TOKEN` | Shared fallback | Used when channel-specific tokens are empty |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | System user / permanent token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | From WhatsApp → API Setup |
| `WHATSAPP_WABA_ID` | WhatsApp | WhatsApp Business Account ID |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp | Webhook verify token (Call Center settings preferred) |
| `INSTAGRAM_PAGE_ACCESS_TOKEN` | Instagram | Page token with messaging permission |
| `META_PAGE_ACCESS_TOKEN` | Instagram | Alias for page token |
| `INSTAGRAM_PAGE_ID` | Instagram | Facebook Page linked to IG Professional |
| `META_PAGE_ID` | Instagram | Alias for page ID |
| `INSTAGRAM_IG_USER_ID` | Instagram | Instagram professional account ID |
| `INSTAGRAM_VERIFY_TOKEN` | Instagram | Optional override for hub verify |

WhatsApp and Instagram settings can be saved in **Call Center → Settings** (DB wins over env for webhooks / send).

## Meta dashboard checklist

### 1. Business + app

1. Create / use a [Meta Business Manager](https://business.facebook.com/) account.
2. Create a Meta app at [developers.facebook.com](https://developers.facebook.com/) (type: Business).
3. Add products: **WhatsApp** and **Messenger** (Instagram Messaging uses Messenger Platform + a Page linked to an Instagram Professional account).
4. Complete **Business Verification** when Meta requires it for production messaging.

### 2. WhatsApp Cloud API

1. WhatsApp → API Setup: copy **Phone number ID**, **WhatsApp Business Account ID**, and a token (prefer a long-lived system user token).
2. Set `WHATSAPP_*` in `.env.local` and/or Call Center → WhatsApp.
3. Webhooks → Callback URL: `https://<your-host>/api/public/call-center/whatsapp`
4. Verify token: same value as `WHATSAPP_VERIFY_TOKEN` / Call Center settings.
5. Subscribe to **messages**.
6. For production traffic beyond test numbers: complete App Review / WhatsApp permissions as Meta prompts.

### 3. Instagram Messaging

1. Convert the brand Instagram account to **Professional** (Business or Creator).
2. Link it to a **Facebook Page**.
3. In the Meta app, connect the Page; request permissions such as:
   - `instagram_basic` / `instagram_manage_messages`
   - `pages_manage_metadata`, `pages_messaging` (as required by Meta’s current Messaging docs)
4. Webhooks callback: `https://<your-host>/api/public/meta/instagram`
5. Verify token: `META_WEBHOOK_VERIFY_TOKEN` or `INSTAGRAM_VERIFY_TOKEN`.
6. Subscribe to Instagram / Page **messages**.
7. Generate a **Page access token** for that Page → `INSTAGRAM_PAGE_ACCESS_TOKEN` + `INSTAGRAM_PAGE_ID`.
8. Note: you can only message users who messaged you first (IGSID from the webhook). Cold DMs to arbitrary usernames are not allowed.

### 4. App Review / Live mode

- Development mode: messages only work with users/roles added to the app.
- Production: App Review + Live mode; Instagram webhooks generally require the app to be **Live**.

## Local testing (ngrok)

1. `npm run dev`
2. Expose HTTPS: `ngrok http 3000` (or Cloudflare Tunnel).
3. Paste the HTTPS URL into Meta webhook callbacks (paths above).
4. Click **Verify and save** in Meta (GET challenge).
5. Send a WhatsApp / Instagram message to the business account and confirm POST hits the server.

### Demo without Meta

WhatsApp (persists into Call Center inbox):

```bash
curl -X POST "http://localhost:3000/api/public/call-center/whatsapp?demo=1" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"+97455551234\",\"text\":\"Hello from demo\",\"name\":\"Demo Customer\"}"
```

Instagram (triggers env auto-reply if configured):

```bash
curl -X POST "http://localhost:3000/api/public/meta/instagram?demo=1" \
  -H "Content-Type: application/json" \
  -d "{\"senderId\":\"demo_igsid\",\"text\":\"Hello from IG demo\"}"
```

Outbound send helper (requires `META_SEND_SECRET` or `CRON_SECRET`):

```bash
curl -X POST "http://localhost:3000/api/public/meta/send" \
  -H "Authorization: Bearer $META_SEND_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"whatsapp\",\"to\":\"+97455551234\",\"text\":\"Hello\"}"
```

## Auto-reply behavior

| Channel | Behavior |
|---------|----------|
| WhatsApp (Call Center) | First-message auto-reply from Call Center settings (`whatsapp_auto_reply_*`) |
| Instagram (`/api/public/meta/instagram`) | Env `META_AUTO_REPLY_*` — replies once per message `mid` (skips echoes) |

## Code map

- `src/lib/meta/` — shared config, HMAC verify, WhatsApp/Instagram send helpers, auto-reply
- `app/api/public/call-center/whatsapp/route.ts` — WhatsApp webhook + inbox persistence
- `app/api/public/meta/instagram/route.ts` — Instagram webhook
- `app/api/public/meta/send/route.ts` — protected outbound test/send

## Blockers outside the repo

You still need Meta-side assets before live automation works:

- Meta Business Manager + verified business (often required)
- WhatsApp-enabled phone number / Cloud API onboarding
- Instagram Professional account linked to a Facebook Page
- Page access token + webhook URL reachable from the public internet
- App Review / Advanced Access for production messaging beyond app testers
