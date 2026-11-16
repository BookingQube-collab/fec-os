# Call Center (FEC)

Maqsam-like multi-module contact center: Qatar DID → IVR → queue → agent web softphone → CDR, plus live wallboard, analytics, campaigns, and settings.

Architecture (Telnyx-recommended path — **SIP Trunking + Qatar DID → LiveKit**):

```
Caller → Qatar +974 DID → Telnyx Elastic SIP Trunking (DTMF = RFC 2833)
       → LiveKit SIP inbound trunk + dispatch rule → LiveKit room
       → FEC IVR / queue (webhook + optional LiveKit Agent for prompts)
       → Agent answers in FEC softphone (same room) → CDR
Agent  → Dialer outbound → CDR + LiveKit room → LiveKit SIP outbound trunk → Telnyx → PSTN
```

Alternate path (**Telnyx Call Control** — set Inbound path in Settings):

```
Caller → Telnyx DID → Call Control webhook (FEC answers, IVR / queue / hold music)
       → agent answers → Telnyx transfers caller to LiveKit SIP → agent's LiveKit room → CDR
```

Without Telnyx credentials, agents can still use **Test ring** and **Outbound dial** (simulated CDR + optional LiveKit room) on `/call-center`. When any carrier setting is saved but outbound is incomplete, dialing a real number returns a clear error instead of a fake call.

**Qatar DID:** purchase or port a +974 national number in the Telnyx portal (KYC required). Rates start around $150/month for Qatar numbers — confirm in the portal. Porting needs NumberOps eligibility. Links: [Qatar DID requirements](https://support.telnyx.com/en/articles/8520014-qatar-did-requirements), [SIP pricing](https://telnyx.com/pricing/elastic-sip), [DTMF / RFC 2833](https://support.telnyx.com/en/articles/1130710-what-is-dtmf-and-how-to-configure-it-on-telnyx).

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
| `/call-center/live` | Agents + active calls wallboard + remote status (admin) |
| `/call-center/calls` | CDR filters (date, queue, direction, phone/notes/tags) |
| `/call-center/numbers` | DIDs CRUD + queue / IVR / event mapping |
| `/call-center/ivr` | Visual IVR flow canvas (Maqsam-like) |
| `/call-center/voicemail` | Voicemail inbox (after-hours + IVR) |
| `/call-center/queues` | Queues + members CRUD |
| `/call-center/campaigns` | Outbound campaigns + contacts + dial |
| `/call-center/analytics` | Today metrics (volume, answer rate, AHT, agents) |
| `/call-center/quality` | QA templates and call scorecards |
| `/call-center/reports` | Scheduled reports, keyword alerts, transcript search |
| `/call-center/agents` | Agent performance, names, extension + Edit profile |
| `/call-center/contacts` | Shared phonebook / click-to-call / VIP priority |
| `/call-center/blacklist` | Blocked numbers |
| `/call-center/settings` | SIP/Telnyx/LiveKit, welcome/hold/TTS stubs, hours, holidays, webhooks |
| `/call-center/ai` | AI Call Agent setup (prompts EN/AR, model, handoff, test) |
| `/call-center/whatsapp` | WhatsApp settings + conversation inbox |
| `/admin/call-center` | Redirects to `/call-center/settings` |
| `POST /api/public/call-center/telnyx` | Telnyx **Call Control** webhook (answer, IVR gather, hold, hangup → CDR). Flat `{from,to}` / `{digit,callId}` demo bodies still work |
| `POST /api/public/call-center/livekit-sip` | LiveKit server webhook (SIP participant joined/left, room finished → CDR) + manual `{from,to}` dispatch |
| `GET/POST /api/public/call-center/whatsapp` | Meta webhook verify + inbound message log |
| `GET/POST /api/public/call-center/sendpulse` | SendPulse chatbot handoff bridge → contacts + tickets (chatbot UI stays in SendPulse) |

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

## Who can use Call Center (roles)

| Role | Access |
|------|--------|
| `call_center_agent` | **Call-center-only seat.** `call_center.view` + `call_center.agent`. Signs in and lands on `/call-center`; the sidebar / mobile menu show only the Call Center module (no dashboard, People, HR, admin). Level 25. |
| Supervisors: `duty_manager`, `tech_supervisor`, `branch_gm` | `call_center.view` + `call_center.agent`: softphone, queues, live wallboard, calls, contacts, analytics. Whisper / barge stay per-agent flags (`/call-center/agents` → Edit). No config edits. |
| `hr`, `customer_service` | Same view + agent access (existing). |
| `ceo`, `coo`, `cfo`, `regional_ops` | View + agent. **Edits** (numbers, IVR, queues, settings, agent profiles) need `admin.view` and role level ≥ 95, i.e. CEO / COO. |

Staff who hold a supervisor *job title* (e.g. Site Supervisor) but sign in with the `cashier_host` role do not get Call Center from the title. Give them a supervisor login role if they need it.

### Add a call-center-only agent

1. Apply the migration `supabase/migrations/20261113100000_call_center_agent_role.sql` (adds the `call_center_agent` enum value).
2. As CEO or COO open `/call-center/agents` and click **Add agent**. Enter name, sign-in email, a temporary password (8+ characters), and optionally an employee code and extension, then **Create agent**.
   - This calls `provisionUser` with role `call_center_agent` and creates the agent's Call Center profile (active, offline).
3. Click **Edit** on the new row: set extension, default queues, skills, and (optional) whisper / barge. Agents only get queue offers once they are queue members.
4. Give the agent the email + temporary password. After sign-in they land on `/call-center`, set status **Available**, and take calls.

To make an existing FEC login a call-center agent instead, a CEO can grant the role in **Admin → Roles** (role dropdown includes `call_center_agent`). If that login also keeps another role, it keeps that role's normal navigation (call-center-only mode applies only when `call_center_agent` is the sole role).

## IVR Builder (visual canvas)

Open `/call-center/ivr` (admin edit; agents can view).

1. Pick or create a menu (seed **Main menu** migrates into the canvas on first open).
2. Click **Apply E3 IVR template** once to load the bilingual E3 Smart IVR (creates venue queues if missing):
   - Start → **Language** (1 English / 2 Arabic / **0 Connect with agent** → E3 General Support queue). The digit **0** handle must have an edge to the Connect with agent node (Apply template draws it; a floating agent node alone will not ring).
   - **Center**: 1 Inflata Park · 2 Kids Driving School · 3 Urban Arena · 0 General E3 support
   - **Service menu**: 1 bookings AI · 2 birthday queue · 3 school/group → birthday queue · 4–5 prices/visit AI · 6 support queue · 0 human queue
   - Per-center **AI Agent** nodes use the E3 bilingual system prompt (bookings, parties, groups, prices, hours, complaints, handoff rules)
3. Drag steps from the left palette: Start/Greeting, Menu (DTMF), Play message, Route to Queue, Route to Agent, **AI Agent**, Hangup, Business hours, Voicemail, Event route.
4. Connect handles: Start/Play use `out`; Menu digits (0–9,*,#) each have a source handle; Hours has `open` / `closed`. For Language **0**, draw (or re-Apply) the edge to **Connect with agent**.
5. Agents who should take press-0 / general support must **join E3 General Support** on Dialer → Queues (or run `scripts/apply-e3-ivr-lang-agent.ts`, which also joins the preferred ops agent). Available alone is not enough — no queue membership means inbound stays **queued**. With Auto-answer **OFF**, press-0 should show the softphone **Accept / Decline** overlay (not just Recent → IVR/missed). While a caller is still on **IVR** (or queued/ringing), Dialer → **Recent calls** highlights the row and offers **Connect directly** (same Telnyx → LiveKit agent bridge as Accept). **Call back** remains for ended/missed.
6. Click a node → inspector edits bilingual greetings (EN + AR), digits, queue, agent, AI prompt / handoff, etc. Use **Listen** to preview TTS via the browser (`speechSynthesis`). Call Control speak/gather uses **en-US** for mixed EN+AR Language prompts so DTMF barge-in (including digit **0**) stays reliable; Arabic-majority prompts still use `arb`. Live Telnyx voice comes from **Settings → Welcome / hold / TTS → IVR TTS voice** (default `Polly.Joanna-Neural`; Arabic-majority prompts auto-switch to `Polly.Hala-Neural`).
7. Toolbar: **Save flow**, zoom, fit, auto-layout, **Test** + **Listen** (simulate digit path and hear the spoken script without a live call).
8. Save writes `flow_json` and replaces digit rows on `call_center_ivr_options`. Inbound DTMF walks the graph when present (nested menus via menu→menu edges); otherwise falls back to flattened options. Missing Language→agent edge for **0** is recovered to the Connect with agent node at runtime so the menu cannot soft-loop forever.

Assign the menu on `/call-center/numbers` (DID → IVR menu) and keep **IVR enabled** in Settings.

Venue queues migration:

```bash
#   supabase/migrations/20261112230000_call_center_ivr_venues.sql
```

Adds InflataPark / Urban Arena / Kids Driving School / Birthday enquiry queues and allows IVR option action `ai`. Applying the E3 template also ensures **E3 General Support** exists.

### Test the bilingual E3 IVR (no Telnyx)

1. Open `/call-center/ivr`, select **Main menu**, click **Apply E3 IVR template**, then **Save flow** if you edited further.
2. In the Test field enter the **full digit path, one digit per menu, in order** (Language → Center → Service) and click **Test** (or press Enter). A single digit such as `4` only tests the Language menu, which accepts `1`, `2`, or `0` (agent). A path that ends on a menu reports "Waiting at …" with the options.
   - `0` → Connect with agent (E3 General Support) — press on the Language menu, no further digits
   - `111` → English → Inflata Park → Bookings AI
   - `112` → English → Inflata Park → Birthday & Events queue
   - `110` → English → Inflata Park → human agents
   - `121` → English → Kids Driving School → Bookings AI
   - `131` → English → Urban Arena → Bookings AI
   - `101` → English → General E3 → Bookings AI
   - `211` → Arabic → Inflata → Bookings AI
   - `210` → Arabic → Inflata → agents
3. Click **Listen** to hear the greetings for that path (browser TTS). Select a Start / Menu / Play node and use inspector **Listen** for EN or AR alone.
4. To exercise agent ringing without PSTN: open `/call-center`, set status **Available**, click **Test ring** (see Local test without Telnyx below).
5. AI path: Test shows `ai_answered` on service digits `1` / `4` / `5`. Real voice AI still needs LiveKit Agents + Telnyx SIP (configure flags on `/call-center/ai`).

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
2. Choose provider — prefer **`admin_gateway`** (Admin → AI Integrations: Gemini → OpenRouter). Alternatives: `livekit_agents`, `openai`, `openai_compatible`. Model default `gemini-flash-latest`; dedicated API key fields only matter for OpenAI-compatible / OpenAI providers.
3. Handoff: after N seconds, keyword list, target queue. On Telnyx Call Control, callers can press **0** for a human.
4. **Run test** and **live admin_gateway turns** both use Admin → AI Integrations (`generateText`). Legacy OpenAI model ids like `gpt-4o-mini` are ignored so Gemini/OpenRouter selected models apply.
5. IVR canvas **AI Agent** node starts an AI session (CDR `ai_answered`). LiveKit Agents is optional for realtime STT/TTS; workers should POST transcripts to `/api/public/call-center/ai-turn` instead of calling OpenAI.

Status badge: **Configured** for `admin_gateway` (uses Admin keys). Otherwise needs `ai_api_key` / `OPENAI_API_KEY`, or a LiveKit agent name when provider is `livekit_agents`.

## WhatsApp (Meta Cloud API)

Inbox: `/call-center/whatsapp`. API keys, templates, and auto-reply: **Call Center → Settings**. Instagram Messaging + shared Meta env setup: [meta-messaging.md](./meta-messaging.md).

1. In Settings, set Phone number ID, WABA ID, access token, webhook verify token (or use env below).
2. Point Meta callback to `https://<host>/api/public/call-center/whatsapp` and subscribe to **messages** (includes delivery/read statuses).
3. Inbox lists conversations/messages; assign an agent and reply — sends via Graph API when token + phone number ID are set (graceful failed log otherwise).
4. Optional **first-message auto-reply** (Settings → Automation): enable WhatsApp + auto-reply, set the text (≤4096 chars). Sent once when a *new* conversation is created; inbound webhooks also update `delivered` / `read` / `failed` on outbound rows by `wa_message_id`.
5. Optional HMAC: set `META_APP_SECRET` and `META_REQUIRE_WEBHOOK_SIGNATURE=true` to enforce `X-Hub-Signature-256` on webhook POSTs.
6. **Recording storage base URL** (Settings, near Record all calls): public CDN/S3 base so CDR `recording_url` is `{base}/call-center/{callId}.mp4` after LiveKit egress.

Local demo ingest:

```bash
curl -X POST "http://localhost:3000/api/public/call-center/whatsapp?demo=1" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"+97455551234\",\"text\":\"Hello from demo\",\"name\":\"Demo Customer\"}"
```

### Not in product yet (needs Meta Business Manager + later engineering)

- Visual chatbot flow builder (Message / List / CTA canvas like third-party BSPs)
- Catalog / commerce product sync
- Native WhatsApp Payments (not available in Qatar / GCC — use payment links from a local gateway instead)
- Meta template approval sync, interactive/list/button messages, media download, webhook HMAC

## Maqsam parity (Done vs Later)

### Done in FEC

| Capability | Where / how to verify |
|------------|------------------------|
| Visual IVR canvas | `/call-center/ivr` — drag nodes, connect digits, Save; reload restores positions |
| E3 bilingual Smart IVR template | **Apply E3 IVR template** — Language → center → service → AI/queues; Test digits `111` etc. |
| Voice preview (Listen) | Inspector + Test path use browser `speechSynthesis` (EN/AR) |
| AI Agent IVR node | Palette + CDR `ai_answered`; Admin gateway replies via `/api/public/call-center/ai-turn` |
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
| Agent editor (name, queues, skills, whisper/barge, auto-answer) | `/call-center/agents` → Edit |
| AI Call Agent setup | `/call-center/ai` |
| WhatsApp inbox + Meta webhook | `/call-center/whatsapp` + `/api/public/call-center/whatsapp` |
| Blocklist | `/call-center/blacklist` — inbound reject / outbound block |
| Welcome / hold / TTS (IVR speak voice) | Settings → Welcome / hold / TTS — upload MP3/WAV/M4A or paste public URLs; **Listen** previews the selected Polly/Azure voice via Telnyx TTS |
| VIP / priority contacts | `/call-center/contacts` — VIP flag skips IVR when configured |
| Skill-based queue offer | Queues → required skills; agents/members skills; routing prefers intersection |
| Service level % | Queues → SL seconds; Analytics → Service level |
| Outbound webhooks | Settings → Outbound webhook URL (+ webhook endpoints table) |
| Auto-answer | Dialer toggle + agent profile; softphone answers offered calls |
| Away reasons | Dialer away chip → On Break / Training / Admin Work |
| Outbound caller-ID picker | Dialer → Caller ID (DIDs + default outbound ID) |
| Remote agent status | `/call-center/live` supervisor select (admin L95+) |
| CDR phone / notes / tags filter | `/call-center/calls` → Phone / notes |
| IVR audio clip URL | IVR inspector → Audio clip URL (Call Control `gather_using_audio`) |
| Arabic Call Center strings | `ar.json` → `callCenter` (core UI + new Maqsam keys) |
| QA scorecards + templates | `/call-center/quality` |
| Scheduled report emails + keyword search | `/call-center/reports` |
| WhatsApp template library | `/call-center/whatsapp` → Templates |
| Campaign pacing / AMD / auto-start | `/call-center/campaigns` → New campaign fields |
| Multi-party conference (agent invite) | Dialer **Conference** → `startCallCenterConference` |
| People click-to-call deep link | People directory → **Call** → `/call-center?dial=` |

### Later (vendor-deep / not full Maqsam clone)

- LiveKit egress file storage destination (S3/R2) so recording URLs are permanent CDN links (egress start is wired)
- Full provider-side hold music / TTS for SIP-only trunks without Call Control
- Voice cloning / dialect-tuned Maqsam AI (FEC uses configured LLM + LiveKit agent)
- Meta WhatsApp template approval sync (local template library + send is wired)
- WhatsApp visual flow builder / interactive list+CTA / catalog commerce
- Native WhatsApp Payments (unavailable in Qatar; prefer payment-link templates)

## Agent console UX

- **Top bar:** big status chips (Available / Busy / Away / ACW / Offline), Test ring, mic + speaker mute.
- **Center:** large phone keypad or in-call stage (timer, Mute / Hold / Keypad / Divert / Conference / Record / Hangup).
- **Sides:** queue membership + available agents + speed dial; recent calls with one-tap callback; call notes (saved to CDR).
- **Incoming:** centered full-screen ring modal with Answer / Decline (Esc declines). Suppressed during ACW/busy and when Recent already shows the CDR as missed/declined (no ghost re-offer after PSTN hangup).
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
| `OPENAI_API_KEY` | AI env fallback only | Prefer Admin Gemini/OpenRouter; used only if admin gateway has no eligible provider |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | Fallback if admin token empty |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook | Fallback verify token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | Fallback phone number id |
| `WHATSAPP_WABA_ID` | WhatsApp | Optional WABA id fallback |
| `SENDPULSE_WEBHOOK_SECRET` | SendPulse bridge | Fallback shared secret for `POST /api/public/call-center/sendpulse` when admin Settings → SendPulse secret is empty (`Bearer`, `X-SendPulse-Secret`, or `?secret=`). Prefer admin (encrypted at rest) |
| `SENDPULSE_WHATSAPP_NUMBER` | SendPulse bridge | Fallback E.164 of the **SendPulse chatbot** WhatsApp number when admin field is empty (must differ from FEC inbox) |
| `CALL_CENTER_WHATSAPP_NUMBER` | SendPulse bridge | E.164 of the **FEC call-center** WhatsApp inbox number (alias `WHATSAPP_E164`) |
| `SENDPULSE_MIRROR_WHATSAPP_INBOX` | SendPulse bridge | Default off. Set `true` only for intentional same-number mirror into `/call-center/whatsapp` |

Do not put Telnyx/LiveKit/WhatsApp secrets in `NEXT_PUBLIC_*`.

## SendPulse chatbot bridge (handoff only)

**Operator note:** Keep chatbot automation in **SendPulse**. Do not rebuild SendPulse flows/UI inside FEC. Use **two WhatsApp numbers**:

| Number | Owner | Job |
|--------|--------|-----|
| SendPulse bot WA (`SENDPULSE_WHATSAPP_NUMBER`) | SendPulse | Chatbot first response / flows |
| FEC inbox WA (`CALL_CENTER_WHATSAPP_NUMBER`) | FEC Meta Cloud | Agent desktop / call-center WhatsApp |

Default bridge behavior (separate numbers): webhook → **contacts + tickets only**. It does **not** mirror into `/call-center/whatsapp` (avoids two systems fighting over the same Meta number / auto-reply).

```
SendPulse chatbot WA (own number)
        │  webhook (open_chat / incoming_message / custom Action)
        ▼
POST /api/public/call-center/sendpulse?secret=<SENDPULSE_WEBHOOK_SECRET>
        │
        ├─ upsert call_center_contacts (tag: sendpulse)
        ├─ upsert call_center_sendpulse_tickets (source: sendpulse, idempotent dedupe_key)
        └─ WhatsApp inbox mirror: OFF by default
           (opt-in SENDPULSE_MIRROR_WHATSAPP_INBOX=true only if sharing one number)
```

### Configure in SendPulse

1. Prefer **Call Center → Settings → SendPulse**: save the webhook secret (encrypted at rest) and chatbot WhatsApp number. Env `SENDPULSE_*` remains a fallback.
2. Ensure SendPulse WhatsApp and FEC inbox WhatsApp are **different** E.164 values.
3. In SendPulse → **Bot Settings → Webhooks**, paste:
   `https://<your-fec-host>/api/public/call-center/sendpulse?secret=<your-secret>`
   (Settings copy URL uses a placeholder — replace with the saved secret.)
4. Enable at least **Opened live chat** (`open_chat`). Optionally **Incoming messages**.
5. For flow-specific handoff, add Action → **Send webhook** to the same URL (custom title creates a ticket).
6. Keep FEC WhatsApp auto-reply on the **FEC** number only; let SendPulse own first response on the chatbot number.

Auth also accepts `Authorization: Bearer <secret>` or `X-SendPulse-Secret` when the sender can set headers.

Local demo:

```bash
curl -X POST "http://localhost:3000/api/public/call-center/sendpulse?demo=1" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"open_chat\",\"phone\":\"+97455550000\",\"name\":\"Guest\",\"summary\":\"Billing help\",\"channel\":\"whatsapp\"}"
```

Apply migration `supabase/migrations/20261116170000_call_center_sendpulse_bridge.sql` before production use.

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

## Real PSTN: Telnyx SIP Trunking + LiveKit SIP (recommended)

Telnyx guidance for this stage: self-service **Elastic SIP Trunking** + Qatar DID, originate inbound to your **LiveKit SIP endpoint**, DTMF **RFC 2833**. IVR, queues, and browser agents live in FEC / LiveKit.

Code map: `carrier.ts` (event orchestration, bridge, outbound dial, CDR sync), `livekit-sip.ts` (SIP client, URI builder, agent dispatch, diagnostics), `routing.ts` (`answerCall` atomic claim + bridge, queue timeouts, `placeOutboundCall`), `telnyx.ts` (Call Control REST when using alternate mode).

Migration for SIP/Qatar settings fields:

```bash
# supabase/migrations/20261115140000_call_center_sip_trunk_qatar.sql
supabase db push
```

### 1. LiveKit SIP

Use your LiveKit project (Cloud or self-hosted SIP). Settings → SIP URI = your **LiveKit SIP host** (e.g. `abc123.sip.livekit.cloud`, host only).

- **Inbound trunk** (Telnyx → LiveKit): allow Telnyx signalling IPs / auth as required. Save id in Settings → *LiveKit SIP inbound trunk id*.
- **Dispatch rule:**  
  - SIP-trunk inbound: an **individual** (or DID-based) rule that creates a room per call — FEC stores the LiveKit room on the CDR.  
  - Call Control bridge: **callee** rule with `roomPrefix: "cc-"` so Telnyx `transfer` lands in the agent's room. The **inbound trunk must be wildcard** (`numbers: []`) — transfers dial `sip:<roomUser>@host`, not the DID; a DID-only trunk rejects the INVITE and the softphone shows Connected with dead air.
- **Outbound trunk** (LiveKit → Telnyx): address `sip.telnyx.com`, transport TCP/TLS per Telnyx, credentials = a Telnyx **Credential Connection** username/password, numbers = your Telnyx DIDs. Save its id in Settings → *LiveKit SIP outbound trunk id*. Example:

  ```bash
  lk sip outbound create --name telnyx-out --address sip.telnyx.com --numbers +974XXXXXXXX --auth-user <telnyx user> --auth-pass <telnyx pass>
  lk sip dispatch create --name fec-callee --callee --room-prefix cc-   # Call Control bridge
  ```
- **LiveKit webhook** (Project → Settings → Webhooks): `https://<host>/api/public/call-center/livekit-sip`. Signed with your API key/secret; FEC verifies it. Events used: `participant_joined`, `participant_left`, `room_finished`. Optional IVR digits from an Agent: `POST` `{ "digit": "1", "callId": "<uuid>" }` with the shared secret.
- LiveKit server credentials: Admin → Chat calls, or `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.
- **IVR prompts on SIP-trunk path:** set *AI LiveKit agent name* (Settings → AI) to a registered LiveKit Agent that plays TTS and forwards SipDTMF to FEC; without an agent, digits can still be applied via the digit webhook once the caller presses keys (audio prompts need the agent or Call Control mode).

### 2. Telnyx (SIP Trunking)

1. Create **Elastic SIP Trunking**; set **DTMF = RFC 2833**.
2. Origination: route your Qatar DID to the LiveKit SIP host / URI from Settings.
3. Complete Qatar KYC; buy or port `+974…`; record it in Settings → Qatar DID and map it under `/call-center/numbers`.
4. Create a Credential Connection for **outbound** (used by the LiveKit outbound trunk).
5. Optional alternate: **Call Control Application** webhook → `/api/public/call-center/telnyx` — switch Settings → Inbound path to Call Control when you want Telnyx-side TTS/gather/hold before the LiveKit bridge.

### 3. FEC settings (CEO/COO → `/call-center/settings`)

| Field | Value |
|-------|-------|
| Telnyx / SIP URI | LiveKit SIP host (`xxxx.sip.livekit.cloud`) |
| Telnyx connection id | Call Control Application id (optional but recommended) |
| Telnyx API key | Telnyx v2 key |
| Webhook shared secret / Telnyx webhook secret | Shared secret, or paste the Telnyx **public key** to verify signatures |
| LiveKit SIP outbound trunk id | **Outbound** trunk id (`ST_…`, LiveKit Cloud → Telephony → SIP trunks → Outbound). Error "requested sip trunk does not exist" = wrong/inbound/deleted id or a different LiveKit project than the API key; fix it and press **Check carrier setup** |
| LiveKit SIP dispatch rule id | Callee dispatch rule id |
| Outbound caller ID | A Telnyx-owned E.164 number |
| Welcome / hold music / TTS | Used while callers wait in a queue (audio URLs must be public MP3/WAV) |

Then: enable **Call Center**, map each DID on `/call-center/numbers` to a queue / IVR menu, add agents to queues. Press **Check carrier setup** in Settings — it verifies LiveKit credentials, the SIP host, the Telnyx key, and that the trunk / dispatch rule ids exist in LiveKit.

### What happens on a call

**Inbound:** `call.initiated` → CDR + routing (blocklist, hours, IVR/queue) → FEC answers (or rejects blocked / unconfigured). IVR: greeting via Telnyx TTS (`Polly.Joanna` by default; Arabic-majority text → `Polly.Hala` + `arb`) + one-digit gather → `applyIvrDigit`; timeouts retry up to the menu's retries, then go to the fallback queue. Change voice under Settings → IVR TTS voice (`Polly.*`, `Azure.*`, or basic `female`/`male`). Queue: welcome (audio URL, or TTS if enabled) then looping hold music. Agent clicks **Answer** → mark `bridgeInProgress` (so welcome `playback.ended` cannot restart hold mid-transfer) → FEC heals LiveKit dispatch (wildcard inbound trunk + **callee** rule only; removes conflicting **individual** rules that steal INVITEs into `cc-_+DID_random` rooms) → Telnyx `transfer` to `sip:<roomUser>@<LiveKit SIP host>` → soft-verify SIP join (one background retry) → agent softphone token. Call Control mode does **not** create a second CDR from the bridge SIP join (avoids DID-as-caller Recent rows). `call.hangup` / gather `call_hangup` / LiveKit `participant_left` end the CDR (`ended` after answer, `missed` before) so Incoming does not ghost-reoffer. Agent hangup / decline hangs up the Telnyx leg. In a simultaneous queue, one agent declining only hides the call for that agent. Fix script: `node --env-file=.env.local scripts/fix-call-control-bridge-trunk.mjs`.

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

- Queue `max_wait_seconds` is enforced on softphone poll / workspace load (missed + hangup carrier leg); a dedicated cron is still optional for quieter periods.
- Voicemail: after-hours / IVR voicemail speaks the prompt (Call Control) and creates the voicemail row, but does not record the caller's message yet.
- PSTN transfers (SIP REFER / Telnyx transfer from the softphone) and recording egress are not fully wired (`transferPendingSip` is still only a flag). Softphone DTMF now uses LiveKit `publishDtmf` (RFC 2833 toward SIP).
- Whisper/barge on SIP legs needs LiveKit TrackPermissions; SIP-trunk IVR prompts need a LiveKit Agents worker (dispatch is wired when agent name is set; worker not shipped in-repo).
- Outbound "answered" is only known after the dial resolves; CDR is created already `answered` (with a `dialing` state in metadata) for UI compatibility.
- Power dialer pacing / AMD, Telnyx number provisioning in-app, and Telnyx → LiveKit failure recovery after transfer remain manual.
- Transcripts: pluggable `transcript_text` / Generate stub on `/call-center/calls`; wire STT later.
