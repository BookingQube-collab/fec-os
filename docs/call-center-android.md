# Call Center Android (Capacitor + FCM)

Thin Capacitor Android shell that loads the FEC web softphone (`https://e3fec.vercel.app` by default) and receives **high-priority FCM** when a queue offers a call — so agents can answer with the app closed (no Zoiper).

Desktop / browser softphone is unchanged and still polls while open.

## Architecture

```
Queue offer (offerCallToQueue)
  → deliverCallCenterFcmOffer (Firebase Admin)  [no-op if unset]
  → FCM high-priority → Android notification / full-screen intent
  → tap opens /call-center?callId=… → existing Answer / LiveKit flow

Closed-app sequential ring (~15s):
  POST /api/public/call-center/queue-timeouts  (CRON_SECRET)
  Prefer an external cron every 5s; Vercel cron runs once per minute as a safety net.
```

## Prerequisites

1. Firebase project with Cloud Messaging enabled
2. Android app registered with package `qa.e3.fec.callcenter`
3. Service account with Firebase Cloud Messaging Admin (for server)
4. Migration `20261119180000_call_center_fcm_tokens.sql` applied
5. JDK 17 + Android Studio (local APK builds)

## Server env (Vercel / `.env.local`)

```bash
# Option A — discrete fields (private key: use \n for newlines)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Option B — full JSON (single line)
# FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Option C — path on the build machine (not typical on Vercel)
# FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH=./secrets/firebase-admin.json

CRON_SECRET=   # required for /api/public/call-center/queue-timeouts
```

If Firebase env is missing, IVR / queue routing continues; FCM is skipped.

## Agent install & use

1. Install the APK (internal distribution / Play internal track).
2. Open the app → sign in to FEC → go to **Call Center**.
3. Tap **Enable phone notifications** and allow notification permission.
4. Android settings → Apps → FEC Call Center:
   - Notifications: allowed (channel **incoming_calls**)
   - Battery: **Unrestricted** (otherwise OEMs delay FCM)
5. Set status to **Available**. When a call is offered, the notification opens `/call-center?callId=…`; Answer uses the existing LiveKit softphone.

## Build the APK (local)

```bash
cd mobile
cp google-services.json.example android/app/google-services.json
# Replace with the real file from Firebase Console → Project settings → Your apps
# (never commit the real google-services.json)

npm install
npx cap add android          # first time only
# After add: place google-services.json at android/app/google-services.json
# Apply native stubs from android-stubs/ (see below)

# Point at production (default) or staging:
# set CAPACITOR_SERVER_URL=https://e3fec.vercel.app

npx cap sync android
npx cap open android
# In Android Studio: Build → Build Bundle(s) / APK(s) → Build APK(s)
```

### Native stubs (`mobile/android-stubs/`)

After `npx cap add android`, merge:

| Stub | Purpose |
|------|---------|
| `AndroidManifest.xml` snippets | `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`, high-priority service notes |
| `IncomingCallChannel.java` | Creates `incoming_calls` channel (IMPORTANCE_HIGH) |

Copy instructions are comments inside each stub file.

### iOS

Not in scope for v1. Package id / docs only; use the web softphone on iOS Safari until a native shell is added.

## Ops checklist

- [ ] Firebase Admin env on Vercel production
- [ ] Migration applied (`supabase db push` / bundle)
- [ ] External cron every **5 seconds**:  
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://e3fec.vercel.app/api/public/call-center/queue-timeouts`
- [ ] Agents on **Unrestricted** battery + notification permission
- [ ] Test: agent Available with app force-stopped → inbound DID → FCM → Answer

## Verify

```bash
# Unit tests (FCM no-op + payload shape)
npm test -- src/lib/call-center/fcm.test.ts src/lib/call-center/capacitor-push.test.ts

# Cron (must return 401 without secret)
curl -s -o /dev/null -w "%{http_code}" https://e3fec.vercel.app/api/public/call-center/queue-timeouts

# With secret
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://e3fec.vercel.app/api/public/call-center/queue-timeouts
```

## Security notes

- Do **not** commit `google-services.json`, service account JSON, or `FIREBASE_ADMIN_PRIVATE_KEY`.
- Token register/unregister requires authenticated `call_center.view`.
- FCM data includes `callId`, `from`, `queue` only (no SIP credentials).
