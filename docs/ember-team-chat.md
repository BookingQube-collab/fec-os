# Team Chat — Ember parity on Vercel

Team Chat (`/ember`) runs **only on FEC Vercel + Supabase**. No Cloudflare Worker.

## UI shell

`/ember` uses an Ember-like three-pane shell (`EmberWorkspaceShell`):

- Icon rail: Home, DMs, Activity, Search, Admin, Profile
- Sidebar: Channels (`#name`) + Direct messages
- Main: conversation timeline (thread replies collapsed)
- Right: thread panel when **Reply in thread** is used

Scoped slate chrome lives in `src/styles/ember-shell.css` (`.ember-shell`). Communication Hub (`/chat`) is unchanged.

## Implemented (native)

| Ember feature | FEC implementation |
| --- | --- |
| Rooms / private rooms / DMs | Chat Hub conversations in Ember shell |
| Threads | Side thread panel + `thread_root_message_id` |
| Search / files | Search dialog + Files panel |
| Activity | Unread-only list filter |
| Reactions, mentions, push, calls | Existing Chat Hub / LiveKit |
| Slack incoming webhooks | `POST /api/public/chat-slack/:botId/:token?channel=:conversationId` (+ attachments → bot cards) |
| Bots admin | Team Chat → Bots (rail Admin) |
| AI agents (`@mention`) | Team Chat → Agents |
| Settings / profile / push | FEC chat notification + profile |

## Apply migration

```bash
# apply supabase/migrations/20261111210000_chat_ember_parity.sql
```

Creates `chat_bots`, `chat_bot_rooms`, `chat_agents`.

## Slack webhook example

```bash
curl -H 'Content-Type: application/json' \
  -d '{"text":"Deploy finished"}' \
  "https://YOUR_VERCEL_HOST/api/public/chat-slack/BOT_ID/TOKEN?channel=CONVERSATION_UUID"
```

Returns plain `ok` (Slack-compatible).

## Still thinner than Ember GitHub

- Block Kit / Slack attachments rendering (text only today)
- Full side-panel thread UI (replies post into thread; main timeline hides them)
- Agents use instruction preview replies until Admin AI model routing is wired end-to-end
- Custom CSS Worker (uses FEC design system)

## Auth

- `ember.view` — open Team Chat tabs  
- `ember.manage` — bots, agents, settings tabs  
- Messaging still requires `chat.view` / `chat.send`
