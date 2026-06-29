# FEC-OS

Enterprise operations platform for multi-location Family Entertainment Centers (FEC). Built with **Next.js 15**, **React 19**, **Supabase**, and **TanStack Query**.

## Features

- Estate dashboard, branch P&L, and revenue intelligence (BookingQube sync)
- Maintenance, snags, tasks, and daily operations
- Compliance: E3 tracker, AMC contracts, documents, expiry alerts, location tracker
- OCC (operations control center), people, inventory, vendors, KPI engine
- Role-based access control (RBAC) with Supabase Auth

## Prerequisites

- Node.js 20+
- Supabase project (Auth + Postgres)
- `.env.local` with Supabase keys and optional BookingQube credentials

## Quick start

```bash
npm install
cp .env.example .env.local   # if present; otherwise create from docs/DEPLOYMENT.md
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply pending SQL migrations |
| `npm run db:baseline` | Seed migration baseline for legacy DBs |
| `npm run seed:admin` | Create admin user |
| `npm run seed:locations` | Seed Qatar branch locations |
| `npm run seed:demo` | Seed demo operational data |

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | App structure, data flow, auth |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Environment, build, deploy |
| [docs/DATABASE.md](docs/DATABASE.md) | Migrations, schema overview |
| [docs/BOOKINGQUBE.md](docs/BOOKINGQUBE.md) | BookingQube revenue API integration |
| [docs/CLEANUP_REPORT.md](docs/CLEANUP_REPORT.md) | Latest cleanup audit |

## Project layout

```
app/           Next.js App Router (pages + API routes)
src/views/     Client page components (imported by app/)
src/components/ UI and feature components
src/lib/       Server actions, query cores, RBAC, utilities
src/hooks/     React Query hooks
supabase/migrations/  SQL migrations (never delete applied)
scripts/       Seeds, imports, migration tooling
public/        PWA icons and manifest
```
