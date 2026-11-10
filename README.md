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

### Operations manual (MkDocs Material)

The **FEC-OS user / ops manual** is published from the `manual/` folder (`mkdocs.yml` at repo root). In the app: **Help → Open operations manual** or **Training → Ops manual** (`/help/manual`).

```powershell
python -m venv .venv-docs
.\.venv-docs\Scripts\Activate.ps1
pip install -r requirements-docs.txt
mkdocs serve
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

**Published manual:** [https://bookingqube-collab.github.io/fec-os/](https://bookingqube-collab.github.io/fec-os/) (GitHub Pages; deploys on push to `master` when `manual/`, `mkdocs.yml`, or `.github/workflows/docs.yml` change). Set `NEXT_PUBLIC_OPS_MANUAL_URL` in `.env.local` (see `.env.example`) so in-app **Help → Open operations manual** points at the live site.

Local build: `mkdocs build` → `site/` (gitignored).

| Doc | Description |
|-----|-------------|
| [manual/index.md](manual/index.md) | Operator manual (MkDocs source) |
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
