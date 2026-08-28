# FEC Employee app (iPhone + Android)

FEC-OS is a Next.js ops console. Employees run a **mobile-first PWA** at `/hr/me` — not a separate App Store binary.

## Open it today

1. Sign in with the same FEC-OS account. The login must be linked to a `staff` row (`staff.user_id`).
2. Open **https://&lt;host&gt;/hr/me** in Safari (iPhone) or Chrome (Android).
3. Install:
   - **iPhone:** Share → **Add to Home Screen**. The icon is named **FEC Employee**.
   - **Android:** browser menu → **Install app** / **Add to Home screen**.
4. After install, the app opens standalone (`display: standalone`) at `/hr/me`.

Admins can open the same URL from **HR → Employee app**.

## What it does

- Check in / Check out / GPS ping (existing Field APIs, geofence + optional face/liveness)
- Offline queue (IndexedDB `fec-hr-field`) with auto-sync
- My attendance for the current FEC month (28th → 27th)
- Leave submit (HR approves on `/people/leave`)
- In-app notifications (late, missed punch, geofence, leave)

## Capacitor later (optional)

Do **not** add Capacitor to the Next.js Vercel build. When you want store wrappers:

```bash
npx create-capacitor-app apps/employee --name "FEC Employee"
# point the webDir / server url at https://<host>/hr/me
```

Keep native shells in `apps/employee` so `npm run build` for FEC-OS stays unchanged.
