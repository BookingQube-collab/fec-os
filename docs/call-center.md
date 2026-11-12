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
| `/call-center` | Agent console: 3-zone dialer (status bar, keypad / in-call, queues + speed dial + notes) |
| `/call-center/live` | Agents + active calls wallboard |
| `/call-center/calls` | CDR filters (date, queue, direction) |
| `/call-center/numbers` | DIDs CRUD + queue / IVR / event mapping |
| `/call-center/ivr` | Visual IVR flow canvas (Maqsam-like) |
| `/call-center/voicemail` | Voicemail inbox (after-hours + IVR) |
| `/call-center/queues` | Queues + members CRUD |
| `/call-center/campaigns` | Outbound campaigns + contacts + dial |
| `/call-center/analytics` | Today metrics (volume, answer rate, AHT, agents) |
| `/call-center/agents` | Agent performance + internal extensions |
| `/call-center/contacts` | Shared phonebook / click-to-call |
| `/call-center/blacklist` | Blocked numbers |
| `/call-center/settings` | SIP/Telnyx/LiveKit, welcome/hold/TTS stubs, hours, holidays, webhooks |
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

Agent console migration:

```bash
#   supabase/migrations/20261112190000_call_center_agent_console.sql
```

Adds `agent_notes` on CDR and `call_center_speed_dials` favorites.

IVR flow canvas migration:

```bash
#   supabase/migrations/20261112200000_call_center_ivr_flow.sql
```

Adds `flow_json` on `call_center_ivr_menus` (nodes / edges / viewport) and extends `call_center_ivr_options` with `next_menu_id`, `agent_user_id`, `target_node_id`, plus actions `menu` / `agent`. Saving the canvas syncs flattened digit options so inbound routing still works.

## IVR Builder (visual canvas)

Open `/call-center/ivr` (admin edit; agents can view).

1. Pick or create a menu (seed **Main menu** migrates into the canvas on first open).
2. Click **Apply FEC venues template** once to load the bilingual Maqsam-style flow (creates venue queues if missing):
   - Start → **Language** (1 English / 2 Arabic)
   - Venue menu: 1 InflataPark · 2 Urban Arena · 3 Kids Driving School · 4 Birthday enquiry → matching queues
   - Optional **AI Agent** node (first responder stub) is included on the canvas for wiring
3. Drag steps from the left palette: Start/Greeting, Menu (DTMF), Play message, Route to Queue, Route to Agent, **AI Agent**, Hangup, Business hours, Voicemail, Event route.
4. Connect handles: Start/Play use `out`; Menu digits (1,2,…) each have a source handle; Hours has `open` / `closed`.
5. Click a node → inspector edits bilingual greetings (EN + AR), digits, queue, agent, AI prompt / handoff, etc. Use **Listen** to preview TTS via the browser (`speechSynthesis`).
6. Toolbar: **Save flow**, zoom, fit, auto-layout, **Test** + **Listen** (simulate digit path and hear the spoken script without a live call).
7. Save writes `flow_json` and replaces digit rows on `call_center_ivr_options`. Inbound DTMF walks the graph when present (nested menus via menu→menu edges); otherwise falls back to flattened options.

Assign the menu on `/call-center/numbers` (DID → IVR menu) and keep **IVR enabled** in Settings.

Venue queues migration:

```bash
#   supabase/migrations/20261112230000_call_center_ivr_venues.sql
```

Adds InflataPark / Urban Arena / Kids Driving School / Birthday enquiry queues and allows IVR option action `ai`.

### Test the bilingual venue IVR (no Telnyx)

1. Open `/call-center/ivr`, select **Main menu**, click **Apply FEC venues template**, then **Save flow** if you edited further.
2. In the Test field enter digit paths and click **Test** (or press Enter):
   - `11` → English → InflataPark queue
   - `12` → English → Urban Arena
   - `13` → English → Kids Driving School
   - `14` → English → Birthday enquiry
   - `21` → Arabic → إنفلاتا بارك
   - `22` → Arabic → أوربان أرينا
   - `23` / `24` → Arabic venues 3 / 4
3. Click **Listen** to hear the greetings for that path (browser TTS). Select a Start / Menu / Play node and use inspector **Listen** for EN or AR alone.
4. To exercise agent ringing without PSTN: open `/call-center`, set status **Available**, click **Test ring** (see Local test without Telnyx below).
5. AI path: connect or reach the **AI Agent** node; Test shows `ai_answered`. Real voice AI still needs LiveKit Agents + Telnyx SIP (configure flags on `/call-center/ai`).

Parity migration:

```bash
#   supabase/migrations/20261112210000_call_center_maqsam_parity.sql
```

Adds after-hours greeting/action, CDR disposition + recording flag, queue member skills, and `call_center_voicemails`.

Batch 2 migration:

```bash
#   supabase/migrations/20261112220000_call_center_maqsam_batch2.sql
```

Adds phonebook, tag catalog, blacklist, park orbit columns, agent extensions, welcome/hold/TTS settings stubs.

## Maqsam parity (Done vs Later)

### Done in FEC

| Capability | Where / how to verify |
|------------|------------------------|
| Visual IVR canvas | `/call-center/ivr` — drag nodes, connect digits, Save; reload restores positions |
| FEC bilingual venues template | **Apply FEC venues template** — Language → venues → queues; Test digits `12` etc. |
| Voice preview (Listen) | Inspector + Test path use browser `speechSynthesis` (EN/AR) |
| AI Agent IVR node | Palette + CDR `ai_answered` stub; flags on `/call-center/ai` |
| Nested / hours / voicemail IVR nodes | Canvas + inbound DTMF walker in `routing.ts` |
| Business hours + holidays enforce routing | Settings → enable hours; closed → after-hours action (voicemail/hangup/queue) |
| Voicemail inbox | `/call-center/voicemail` — Add test voicemail; Mark listened |
| ACW wrap-up codes | Hang up a call → disposition chips on dialer → Save disposition |
| Recording flag + playback | In-call **Recording** toggle; Calls detail plays `recording_url` when set |
| Live wallboard metrics + whisper/barge | `/call-center/live` — available / in-call / ASA / abandon / missed / voicemail; Whisper/Barge on active calls (admin) |
| Analytics ASA / abandon / voicemail | `/call-center/analytics` |
| Queue member priority + skills | `/call-center/queues` |
| DID → IVR → Queue visual map | `/call-center/numbers` |
| Campaign dial-next | `/call-center/campaigns` → Dial next contact |
| Missed-call toast | Softphone workspace surfaces recent missed/declined |
| Main FEC sidebar Call Center rail | Headphones icon + label on primary rail / expanded Call Center department |
| Product shell vertical module rail | Dialer / Live / Calls / Contacts / … inside `/call-center` |
| Phonebook + click-to-call | `/call-center/contacts` |
| Call tags on CDR | Calls detail → tag chips → Save tags |
| Call park / retrieve | Dialer **Park**; retrieve from park orbit strip |
| CDR CSV export | `/call-center/calls` → Export CSV |
| Agent performance + extensions | `/call-center/agents` — set ext, dial colleagues by extension |
| Blocklist | `/call-center/blacklist` — inbound reject / outbound block |
| Welcome / hold / TTS settings stubs | Settings → Welcome / hold / TTS fields |

### Later (not full Maqsam clone)

- LiveKit egress auto-upload of recordings / voicemail audio (URLs are stored; play when set)
- Provider-side play of welcome audio / hold music / TTS (settings stored only)
- True multi-party conference (beyond warm-transfer consult intent)
- Click-to-call from People / event staff directory (Call Center phonebook is live)
- Skill-based routing engine (skills are stored; matching not yet scored)
- Full power dialer pacing / AMD
- WhatsApp Meta Cloud API production channel
- Keyword search across recordings, mobile app, concurrent multi-chat
- Warm park transfer notifications to other agents beyond orbit strip

## Agent console UX

- **Top bar:** big status chips (Available / Busy / Away / ACW / Offline), Test ring, mic + speaker mute.
- **Center:** large phone keypad or in-call stage (timer, Mute / Hold / Keypad / Divert / Conference / Record / Hangup).
- **Sides:** queue membership + available agents + speed dial; recent calls with one-tap callback; call notes (saved to CDR).
- **Incoming:** centered full-screen ring modal with Answer / Decline (Esc declines).
- **ACW:** after hangup, countdown from queue `wrap_up_seconds`, then auto Available (or End wrap-up early).
- **Calls:** Today / Missed / Outbound chips; expandable notes + transcript; callback.
- **Live:** large agent tiles and active-call cards with Whisper / Barge.
- **Keyboard:** Enter to dial (when idle), Esc to decline or hang up.

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
