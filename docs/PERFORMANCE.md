# FEC-OS loading performance

**Date:** 28 Aug 2026  
**Scope:** First load and route JS without changing UI, auth, permissions, or business logic. Uncommitted location-label and FEC 28–27 month-filter work was left in place.

## Result

`npm run build` now **exits 0**. The previous production compile failed because the Time & Attendance dashboard imported `node:crypto` into the client bundle.

| Metric | Before | After |
|--------|--------|-------|
| Production build | Failed (`node:crypto` via attendance dashboard) | Passed (Next.js 15.5.19) |
| Shared First Load JS | Not measurable | **103 kB** |
| Login `/auth` First Load JS | Not measurable | **215 kB** (page 8.91 kB) |
| Home `/` First Load JS | Not measurable | **261 kB** (page 12.5 kB) |
| People `/people` First Load JS | Not measurable | **297 kB** |
| Attendance dashboard | Would not compile | **163 kB** First Load (charts split) |
| Middleware | — | 90.4 kB (Supabase SSR; unchanged architecture) |

Lighthouse was not run: login-gated routes need credentials that are not used here. Expected field impact: faster login/home parse (Arabic JSON and WebAuthn no longer sit on first paint), lower Time & Attendance INP (Recharts after first paint), no extra SW hop on HTML/API.

## What changed

1. **Unblocked the client graph** — `subjectKey` no longer lives in a Node crypto module; the attendance dashboard formats watchlist labels without importing server dashboard code.
2. **Kept login lean** — WebAuthn library loads on passkey click; field-sync and enroll dialog are not on the auth first paint; Arabic locale is a separate chunk.
3. **Split heavy UI** — Recharts, event Gantt, and event report/budget charts use `next/dynamic` (existing skeleton pattern).
4. **Caching** — hashed Next assets unchanged; PWA icons cached; `sw.js` still `no-store`; HTML/API not cached by the service worker.
5. **Export cold start** — attendance XLSX/PDF loaded only when that API format is requested.

## Remaining bottlenecks

- English `en.json` (~221 kB raw) still ships with the i18n runtime.
- Middleware is ~90 kB because of `@supabase/ssr`.
- `/people` and several E3 tracker routes remain large client views.
- Attendance dashboard/report server queries may read up to 2k–20k rows; display pagination is already 25/page for staff.
- Evidence photos use `loading="lazy"`; `next/image` was not applied to Supabase URLs (would need `remotePatterns` and could change layout).
- Lightningcss warns on `.print:hidden`; ESLint config lacks `"type": "module"` (warning only).

See the canvas report beside chat for the Before → Problem → Optimization → After table.
