# Deployment

## Environment variables

Create `.env.local` (never commit):

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role for admin scripts |
| `SESSION_POOLER_DATABASE_URL` | Migrations | IPv4 session pooler URL for `db:push` |
| `BOOKINGQUBE_*` | No | See [BOOKINGQUBE.md](./BOOKINGQUBE.md) |

## Database migrations

```bash
npm run db:push
```

Tracks applied versions in `public.schema_migrations`. For legacy DBs without tracking:

```bash
npm run db:baseline
npm run db:push
```

**Never delete migration files that have been applied to production.**

## Build & run

```bash
npm ci
npm run build
npm run start
```

Deploy to any Node.js host that supports Next.js 15 (Vercel, Docker, etc.).

## Cron / scheduled jobs

Public endpoints (require Supabase `apikey` header):

| Endpoint | Purpose |
|----------|---------|
| `POST /api/public/bookingqube-sync` | Daily revenue sync |
| `POST /api/public/attendance-sync` | Attendance import |
| `POST /api/public/escalation-sweep` | Notification escalations |

Configure external cron (e.g. daily 06:00 Asia/Qatar for BookingQube).

## Seeds (non-production)

```bash
npm run seed:admin
npm run seed:locations
npm run seed:demo
```

## PWA assets

Icons and manifest live in `public/` (`icon-192.png`, `icon-512.png`, `manifest.webmanifest`).
