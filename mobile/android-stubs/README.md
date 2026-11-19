# Android stubs (apply after `npx cap add android`)

Capacitor generates `mobile/android/`. These stubs document the extras needed for reliable incoming-call alerts. Merge manually (or copy) — do not commit real signing keys or `google-services.json`.

## 1. `google-services.json`

Place the Firebase download at:

```
mobile/android/app/google-services.json
```

Package name must be `qa.e3.fec.callcenter`.

## 2. Manifest permissions

In `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

On the main `<activity>`, ensure:

```xml
android:showWhenLocked="true"
android:turnScreenOn="true"
```

## 3. Notification channel

Call `IncomingCallChannel.ensure(context)` from `MainActivity.onCreate` (see `IncomingCallChannel.java` in this folder). Channel id must be `incoming_calls` (matches FCM payload from the server).

## 4. Battery / OEM

Document for agents: Settings → Apps → FEC Call Center → Battery → **Unrestricted**.
