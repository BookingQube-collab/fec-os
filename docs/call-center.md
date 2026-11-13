# Call Center (FEC)

Maqsam-like multi-module contact center: Qatar DID → IVR → queue → agent web softphone → CDR, plus live wallboard, analytics, campaigns, and settings.

Architecture:

```
Caller → Telnyx DID → Telnyx Call Control webhook (FEC answers, IVR / queue / hold music)
       → agent answers in softphone → Telnyx transfers caller to LiveKit SIP → agent's LiveKit room → CDR
Agent  → Dialer outbound → CDR + LiveKit room → LiveKit SIP outbound trunk → Telnyx → PSTN
```

Without Telnyx credentials, agents can still use **Test ring** and **Outbound dial** (simulated CDR + optional LiveKit room) on `/call-center`. When any carrier setting is saved but outbound is incomplete, dialing a real number returns a clear error instead of a fake call.

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
| AI Agent | `/call-center/ai` (prompts, model, handoff, test) |
| WhatsApp | `/call-center/whatsapp` (Meta Cloud API + inbox) |
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
| `/call-center/agents` | Agent performance, names, extension + Edit profile |
| `/call-center/contacts` | Shared phonebook / click-to-call |
| `/call-center/blacklist` | Blocked numbers |
| `/call-center/settings` | SIP/Telnyx/LiveKit, welcome/hold/TTS stubs, hours, holidays, webhooks |
| `/call-center/ai` | AI Call Agent setup (prompts EN/AR, model, handoff, test) |
| `/call-center/whatsapp` | WhatsApp settings + conversation inbox |
| `/admin/call-center` | Redirects to `/call-center/settings` |
| `POST /api/public/call-center/telnyx` | Telnyx **Call Control** webhook (answer, IVR gather, hold, hangup → CDR). Flat `{from,to}` / `{digit,callId}` demo bodies still work |
| `POST /api/public/call-center/livekit-sip` | LiveKit server webhook (SIP participant joined/left, room finished → CDR) + manual `{from,to}` dispatch |
| `GET/POST /api/public/call-center/whatsapp` | Meta webhook verify + inbound message log |

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
2. In the Test field enter the **full digit path, one digit per menu, in order** (the first digit answers the Language menu, the second answers the venue menu) and click **Test** (or press Enter). A single digit such as `4` only tests the Language menu, which accepts just `1` or `2`, so Test reports the invalid digit and lists the valid ones. A path that ends on a menu reports "Waiting at …" with the options.
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

Agents / AI / WhatsApp migration:

```bash
#   supabase/migrations/20261112240000_call_center_agents_ai_whatsapp.sql
```

Adds agent edit fields (`display_name_override`, max concurrent, whisper/barge, skills, active), expanded AI prompt/provider columns, WhatsApp Cloud API settings on `call_center_settings`, and `call_center_whatsapp_conversations` / `call_center_whatsapp_messages` (with a demo conversation seed).

## AI Call Agent

Open `/call-center/ai` (admin edit).

1. Enable **AI first answer** and set EN/AR welcome + system prompts.
2. Choose provider (`openai` / `openai_compatible` / `livekit_agents`), model, optional API key (masked; blank keeps saved), languages, LiveKit agent name.
3. Handoff: after N seconds, keyword list, target queue.
4. **Run test** uses the FEC AI gateway (falls back to `OPENAI_API_KEY`).
5. IVR canvas **AI Agent** node links here for global flags; node-local prompt still lives on the flow.

Status badge shows configured vs missing keys (`ai_api_key` or `OPENAI_API_KEY`, or LiveKit agent name when provider is `livekit_agents`).

## WhatsApp (Meta Cloud API)

Open `/call-center/whatsapp`.

1. Set Phone number ID, WABA ID, access token, webhook verify token (or use env below).
2. Point Meta callback to `https://<host>/api/public/call-center/whatsapp`.
3. Inbox lists conversations/messages; assign an agent and reply — sends via Graph API when token + phone number ID are set (graceful failed log otherwise).

Local demo ingest:

```bash
curl -X POST "http://localhost:3000/api/public/call-center/whatsapp?demo=1" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"+97455551234\",\"text\":\"Hello from demo\",\"name\":\"Demo Customer\"}"
```

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
| Agent editor (name, queues, skills, whisper/barge) | `/call-center/agents` → Edit |
| AI Call Agent setup | `/call-center/ai` |
| WhatsApp inbox + Meta webhook | `/call-center/whatsapp` + `/api/public/call-center/whatsapp` |
| Blocklist | `/call-center/blacklist` — inbound reject / outbound block |
| Welcome / hold / TTS settings stubs | Settings → Welcome / hold / TTS fields |

### Later (not full Maqsam clone)

- LiveKit egress auto-upload of recordings / voicemail audio (URLs are stored; play when set)
- Provider-side play of welcome audio / hold music / TTS (settings stored only)
- True multi-party conference (beyond warm-transfer consult intent)
- Click-to-call from People / event staff directory (Call Center phonebook is live)
- Skill-based routing engine (skills are stored; matching not yet scored)
- Full power dialer pacing / AMD
- WhatsApp template library / multi-chat pacing beyond first inbox slice
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
| `CALL_CENTER_WEBHOOK_SECRET` | Webhooks | Shared secret (Bearer / `X-Call-Center-Secret` / `?secret=`). Required in production unless using the Telnyx signature |
| `TELNYX_PUBLIC_KEY` | Recommended | Telnyx webhook **public key** (base64). Enables ed25519 signature verification of Call Control events. Can also be pasted into Settings → Telnyx webhook secret |
| `TELNYX_WEBHOOK_SECRET` | Webhooks | Optional shared-secret fallback |
| `TELNYX_API_KEY` | Inbound PSTN | Telnyx v2 API key (answer / speak / gather / transfer / hangup). Settings field wins |
| `CALL_CENTER_SIP_ROOM_PREFIX` | Optional | Fallback LiveKit callee-rule room prefix (default `cc-`) when the dispatch rule cannot be read |
| `OPENAI_API_KEY` | AI test / fallback | Used when Call Center AI API key is empty |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | Fallback if admin token empty |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook | Fallback verify token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | Fallback phone number id |
| `WHATSAPP_WABA_ID` | WhatsApp | Optional WABA id fallback |

Do not put Telnyx/LiveKit/WhatsApp secrets in `NEXT_PUBLIC_*`.

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

## Real PSTN: Telnyx Call Control + LiveKit SIP

**Why Call Control (not TeXML):** the webhook already keys on `call_control_id`, and IVR digits, queue offers and "bridge only when an agent answers" are decisions made by FEC code (`routing.ts`) per call. Call Control gives JSON events + REST commands for exactly that; TeXML would require returning static XML per event. **Why bridge on agent answer:** the caller hears the greeting / IVR / hold music on the Telnyx leg, and only becomes a SIP participant in the agent's `cc-…` LiveKit room when an agent accepts — no idle SIP legs, no one-sided silence.

Code map: `src/lib/call-center/telnyx.ts` (REST client + signature check), `carrier.ts` (event orchestration, bridge, outbound dial, CDR sync), `livekit-sip.ts` (SIP client, URI builder, diagnostics), `routing.ts` (`answerCall` bridges, `placeOutboundCall` dials).

### 1. LiveKit SIP

Use your LiveKit project (Cloud or self-hosted SIP). Settings → SIP URI = your **LiveKit SIP host** (e.g. `abc123.sip.livekit.cloud`, host only).

- **Inbound trunk** (Telnyx → LiveKit): allow Telnyx signalling IPs (or leave open + restrict by auth), no number restriction needed for bridged calls.
- **Dispatch rule — type `callee`** with `roomPrefix: "cc-"`. FEC's rooms are `cc-<24 hex>`, and the bridge dials `sip:<24 hex>@<sip host>`, so the rule lands the caller in the room agents already joined. Save the rule id in Settings → *LiveKit SIP dispatch rule id* (FEC reads its prefix from LiveKit). After your first test call, confirm in the LiveKit dashboard that the room name is exactly the CDR's `livekit_room`; if your LiveKit version inserts a separator, adjust the rule prefix.
- **Outbound trunk** (LiveKit → Telnyx): address `sip.telnyx.com`, transport TCP/TLS per Telnyx, credentials = a Telnyx **Credential Connection** username/password, numbers = your Telnyx DIDs. Save its id in Settings → *LiveKit SIP trunk id*. Example (LiveKit CLI — flags vary by `lk` version; the JSON form in LiveKit's SIP docs is equivalent):

  ```bash
  lk sip outbound create --name telnyx-out --address sip.telnyx.com --numbers +974XXXXXXXX --auth-user <telnyx user> --auth-pass <telnyx pass>
  lk sip dispatch create --name fec-callee --callee --room-prefix cc-   # use the rule id it prints
  ```
- **LiveKit webhook** (Project → Settings → Webhooks): `https://<host>/api/public/call-center/livekit-sip`. Signed with your API key/secret; FEC verifies it. Events used: `participant_joined`, `participant_left`, `room_finished` (keeps CDR in sync when the caller / callee hangs up).
- LiveKit server credentials: Admin → Chat calls, or `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

### 2. Telnyx

1. Create a **Call Control Application**; set its webhook URL to `https://<host>/api/public/call-center/telnyx?secret=<CALL_CENTER_WEBHOOK_SECRET>` (or rely on signature verification: set `TELNYX_PUBLIC_KEY`).
2. Assign your DID(s) to that application; put the application's id in Settings → *Telnyx connection id* (events from other connections are ignored).
3. Create an API key (v2) → Settings → *Telnyx API key* (or `TELNYX_API_KEY`).
4. Telnyx → LiveKit leg: in Telnyx outbound voice profile / call control app allow the destination SIP host. Telnyx `transfer` dials `sip:<id>@<LiveKit SIP host>`.
5. Outbound PSTN uses the Credential Connection from step "Outbound trunk" above; no Telnyx API call is needed for outbound.

### 3. FEC settings (CEO/COO → `/call-center/settings`)

| Field | Value |
|-------|-------|
| Telnyx / SIP URI | LiveKit SIP host (`xxxx.sip.livekit.cloud`) |
| Telnyx connection id | Call Control Application id (optional but recommended) |
| Telnyx API key | Telnyx v2 key |
| Webhook shared secret / Telnyx webhook secret | Shared secret, or paste the Telnyx **public key** to verify signatures |
| LiveKit SIP trunk id | **Outbound** trunk id |
| LiveKit SIP dispatch rule id | Callee dispatch rule id |
| Outbound caller ID | A Telnyx-owned E.164 number |
| Welcome / hold music / TTS | Used while callers wait in a queue (audio URLs must be public MP3/WAV) |

Then: enable **Call Center**, map each DID on `/call-center/numbers` to a queue / IVR menu, add agents to queues. Press **Check carrier setup** in Settings — it verifies LiveKit credentials, the SIP host, the Telnyx key, and that the trunk / dispatch rule ids exist in LiveKit.

### What happens on a call

**Inbound:** `call.initiated` → CDR + routing (blocklist, hours, IVR/queue) → FEC answers (or rejects blocked / unconfigured). IVR: greeting via Telnyx TTS (Arabic text auto-selects `arb`) + one-digit gather → `applyIvrDigit`; timeouts retry up to the menu's retries, then go to the fallback queue. Queue: welcome (audio URL, or TTS if enabled) then looping hold music. Agent clicks **Answer** → Telnyx `transfer` to LiveKit SIP → caller lands in the agent's room (if the caller already hung up, the answer fails with "no longer on the line" and nothing is marked answered). `call.hangup` / LiveKit `participant_left` end the CDR (`ended` after answer, `missed` before). Agent hangup / decline hangs up the Telnyx leg. In a simultaneous queue, one agent declining only hides the call for that agent.

**Outbound:** dial pad → `placeOutboundCall` creates the CDR, the agent joins the room (hears a dial tone), and a background task calls LiveKit `createSipParticipant` (waits up to ~60s for answer). On answer, `answered_at` is reset to the real pickup time; on busy / no answer / rejection the CDR becomes `failed` with the carrier reason and the softphone shows it. On Vercel make sure the function `maxDuration` is at least 60s.

**Local / demo (no carrier):** `?demo=1` flat bodies and real-looking Telnyx events (without an API key) only create CDRs and offer to agents; no carrier commands are sent.

### How to test

1. Click **Check carrier setup** in Settings (all ✓).
2. Local webhook shape: `curl -X POST "http://localhost:3000/api/public/call-center/telnyx?demo=1" -H "Content-Type: application/json" -d '{"data":{"event_type":"call.initiated","payload":{"call_control_id":"demo-1","direction":"incoming","from":"+97455550000","to":"+97440000000"}}}'` → CDR created, agents offered (no Telnyx calls without a key).
3. Real inbound: call the Telnyx DID from a mobile; hear the IVR/hold; answer in `/call-center` (status Available); speak both ways; hang up from either side and confirm the CDR in `/call-center/calls`.
4. Real outbound: dial a mobile from the keypad; hear dial tone, then the phone rings; answer; confirm CDR `provider = livekit_sip` and talk time.
5. Failure paths: dial a bad number (CDR `failed` + toast), call while the number is blocklisted (rejected), hang up before an agent answers (CDR `missed`).
6. Unit tests: `npx vitest run src/lib/call-center`.

### Known gaps (next phases)

- No queue-timeout worker: a caller waits on hold music until an agent answers or they hang up (`max_wait_seconds` is not enforced); a direct-offer decline hangs up the caller instead of re-offering.
- Voicemail: after-hours / IVR voicemail speaks the prompt and creates the voicemail row, but does not record the caller's message yet.
- PSTN transfers (SIP REFER / Telnyx transfer from the softphone), DTMF from the softphone to the far end, and recording egress are not wired (`transferPendingSip` is still only a flag).
- Whisper/barge on SIP legs needs LiveKit TrackPermissions; AI first-answer only bridges the caller into the room for a LiveKit Agents worker (no worker included).
- Outbound "answered" is only known after the dial resolves; CDR is created already `answered` (with a `dialing` state in metadata) for UI compatibility.
- Power dialer pacing / AMD, Telnyx number provisioning, and Telnyx → LiveKit failure recovery (caller stays on hold if the SIP leg fails after the transfer is accepted) remain manual.
- Transcripts: pluggable `transcript_text` / Generate stub on `/call-center/calls`; wire STT later.
