# Call Center (FEC)

Maqsam-like multi-module contact center: Qatar DID → IVR → queue → agent web softphone → CDR, plus live wallboard, analytics, campaigns, and settings.

Architecture:

```
Caller → Telnyx DID → LiveKit SIP → FEC IVR/queue → Agent softphone → CDR
Agent  → Dialer outbound → CDR + LiveKit room → (Telnyx PSTN when keys arrive)
```

Without Telnyx credentials, agents can still use **Test ring** and **Outbound dial** (CDR + optional LiveKit room) on `/call-center`.

## Feature map (Maqsam → FEC)

| Maqsam | FEC route / capability |
|--------|-------------------------|
| Dialer (keypad, mute, hold, transfer, history) | `/call-center` |
| Live agents wallboard | `/call-center/live` |
| Call logs / CDR / recordings | `/call-center/calls` |
| Numbers / DIDs | `/call-center/numbers` |
| IVR Builder | `/call-center/ivr` |
| Queues + routing | `/call-center/queues` |
| Power dialer / campaigns | `/call-center/campaigns` (manual + list scaffold) |
| Live / historical dashboards | `/call-center/analytics` |
| Account settings, hours, BYOC | `/call-center/settings` |
| AI Agent | `/call-center/ai` (config stub + LiveKit Agents comment) |
| WhatsApp | `/call-center/whatsapp` (coming / Meta later) |
| Event-linked routing | DID / IVR option / queue `event_id` |

## Routes

| Path | Purpose |
|------|---------|
| `/call-center` | Softphone / Dialer (status, keypad outbound, ring, in-call, transfer) |
| `/call-center/live` | Agents + active calls wallboard |
| `/call-center/calls` | CDR filters (date, queue, direction) |
| `/call-center/numbers` | DIDs CRUD + queue / IVR / event mapping |
| `/call-center/ivr` | IVR menus + digit options CRUD |
| `/call-center/queues` | Queues + members CRUD |
| `/call-center/campaigns` | Outbound campaigns + contacts + dial |
| `/call-center/analytics` | Today metrics (volume, answer rate, AHT, agents) |
| `/call-center/settings` | SIP/Telnyx/LiveKit, business hours, holidays, webhooks |
| `/call-center/ai` | AI first-answer + handoff flags |
| `/call-center/whatsapp` | WhatsApp stub |
| `/admin/call-center` | Redirects to `/call-center/settings` |
| `POST /api/public/call-center/telnyx` | Telnyx inbound webhook stub |
| `POST /api/public/call-center/livekit-sip` | LiveKit SIP dispatch stub |

## Migrations

```bash
supabase db push
# or apply:
#   supabase/migrations/20261112140000_call_center.sql
#   supabase/migrations/20261112160000_call_center_expand.sql
```

Expand migration adds: AI flags, recording/transfer columns, holidays, campaigns + contacts, webhook endpoints, outbound caller id.

Softphone migration:

```bash
#   supabase/migrations/20261112180000_call_center_softphone.sql
```

Adds transcript + whisper/barge columns on `call_center_calls`.

## Env vars

| Variable | Required | Notes |
|----------|----------|--------|
| `LIVEKIT_URL` | For media | `wss://…` — also configurable in Admin → Chat calls |
| `LIVEKIT_API_KEY` | For media | Fallback if DB LiveKit row incomplete |
| `LIVEKIT_API_SECRET` | For media | Server-only |
| `CALL_CENTER_WEBHOOK_SECRET` | Webhooks | Optional; Settings UI secret preferred |
| `TELNYX_WEBHOOK_SECRET` | Webhooks | Optional Telnyx signing secret |
| `TELNYX_API_KEY` | Later | Prefer Call Center → Settings field |

Do not put Telnyx/LiveKit secrets in `NEXT_PUBLIC_*`.

## Local test without Telnyx

1. Apply both call_center migrations.
2. Ensure LiveKit is configured (Admin → Chat calls) **or** skip media and still exercise ring / outbound CDR UI.
3. Open `/call-center/queues`, add yourself as a queue member (your auth user id). CEO/COO admin required for edits.
4. Open `/call-center`, set status to **Available**, click **Test ring** (this also unlocks browser audio).
5. You should hear a **looping ringtone** while the incoming popup is visible. Answer / Decline stops it.
6. Answer / decline / hangup; check `/call-center/calls` and `/call-center/live`.
7. Use the outbound keypad to place a manual outbound CDR (LiveKit remote audio when Chat calls is configured).
8. Edit IVR / Numbers / Settings as admin; open Analytics for today’s cards.

### Softphone audio notes

- Ringtone is Web Audio (dual-tone), unlocked on first pointer/key gesture under `/call-center` and on Test ring / status / Answer.
- If the browser blocked autoplay, the popup shows **Tap to enable ringtone**.
- Answered call voice requires LiveKit (`Admin → Chat calls`). Without it, ringtone still works; in-call UI shows media-not-configured.

Webhook demo without a secret (non-production or `?demo=1`):

```bash
curl -X POST "http://localhost:3000/api/public/call-center/telnyx?demo=1" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"+97455550000\",\"to\":\"+97440000000\"}"
```

## When Telnyx + LiveKit SIP keys arrive

1. Call Center → Settings: set SIP URI, connection id, API key, webhook secret, LiveKit SIP trunk / dispatch rule ids, outbound caller ID.
2. Point Telnyx inbound webhook to `/api/public/call-center/telnyx`.
3. Point LiveKit SIP dispatch (or a small worker) to `/api/public/call-center/livekit-sip`.
4. Map each DID (E.164) to a queue and optional IVR menu / event.
5. Outbound PSTN: complete Telnyx call create from `placeOutboundCall` metadata (`sipOutboundPending`).
6. Transfers: complete SIP REFER from `transfer_type` / `transfer_target` on the CDR (in-app cold divert to agent UUID already re-offers).
7. Whisper/barge: LiveKit web path is live on `/call-center/live` (admin). Full SIP isolation needs LiveKit TrackPermissions / SFU rules for trunk participants.
8. AI: enable first-answer and wire LiveKit Agents using the stub in `/call-center/ai`.
9. Transcripts: pluggable `transcript_text` / Generate stub on `/call-center/calls`; wire STT later.
