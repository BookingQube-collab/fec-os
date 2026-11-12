# Call Center (FEC)

Maqsam-like softphone module: Qatar DID → IVR → queue → agent web softphone → CDR.

Architecture:

```
Caller → Telnyx DID → LiveKit SIP → FEC IVR/queue → Agent softphone → CDR
```

Without Telnyx credentials, agents can still use **Test ring** on `/call-center`.

## Routes

| Path | Purpose |
|------|---------|
| `/call-center` | Agent softphone (status, ring, in-call, CDR) |
| `/admin/call-center` | DIDs, queues, IVR, SIP/Telnyx placeholders |
| `POST /api/public/call-center/telnyx` | Telnyx inbound webhook stub |
| `POST /api/public/call-center/livekit-sip` | LiveKit SIP dispatch stub |

## Migration

```bash
supabase db push
# or apply: supabase/migrations/20261112140000_call_center.sql
```

## Env vars

| Variable | Required | Notes |
|----------|----------|--------|
| `LIVEKIT_URL` | For media | `wss://…` — also configurable in Admin → Chat calls |
| `LIVEKIT_API_KEY` | For media | Fallback if DB LiveKit row incomplete |
| `LIVEKIT_API_SECRET` | For media | Server-only |
| `CALL_CENTER_WEBHOOK_SECRET` | Webhooks | Optional; Admin UI secret preferred |
| `TELNYX_WEBHOOK_SECRET` | Webhooks | Optional Telnyx signing secret |
| `TELNYX_API_KEY` | Later | Prefer Admin → Call Center field |

Do not put Telnyx/LiveKit secrets in `NEXT_PUBLIC_*`.

## Local test without Telnyx

1. Apply the migration.
2. Ensure LiveKit is configured (Admin → Chat calls) **or** skip media and still exercise ring UI.
3. Open `/admin/call-center`, enable Call Center, add yourself as a queue member (your auth user id).
4. Open `/call-center`, set status to **Available**, click **Test ring**.
5. Answer / decline / hangup; check recent CDR list.

Webhook demo without a secret (non-production or `?demo=1`):

```bash
curl -X POST "http://localhost:3000/api/public/call-center/telnyx?demo=1" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"+97455550000\",\"to\":\"+97440000000\"}"
```

## When Telnyx + LiveKit SIP keys arrive

1. Admin → Call Center: set SIP URI, connection id, API key, webhook secret, LiveKit SIP trunk / dispatch rule ids.
2. Point Telnyx inbound webhook to `/api/public/call-center/telnyx`.
3. Point LiveKit SIP dispatch (or a small worker) to `/api/public/call-center/livekit-sip`.
4. Map each DID (E.164) to a queue and optional IVR menu / event.
