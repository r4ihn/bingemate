# BingeMate

INF2003 Group 29 — a media catalogue + reviews app.
Monorepo (npm workspaces): React SPA (`apps/web`) → Express API (`apps/api`) → PostgreSQL (Prisma) + MongoDB (Mongoose).
Shared TypeScript types live in `packages/shared`.

See `ARCHITECTURE.md` for the full layout and `TASKS.md` for the task breakdown.

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL + MongoDB)

## Setup

```bash
# 1. Install all workspace deps from the repo root
npm install

# 2. Start local databases (Postgres + Mongo, bound to localhost)
npm run db:up

# 3. Configure env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local   # optional

# 4. Create the DB schema + generate the Prisma client
npm run prisma:migrate
npm run prisma:generate

# 5. Seed demo data (admin / creator / consumer, sample titles)
npm run seed

# 6. Run both apps
npm run dev          # api + web
# or individually:
npm run dev:api      # http://localhost:4000
npm run dev:web      # http://localhost:5173
```

Demo accounts (password `Password123!`): `admin@bingemate.dev`, `creator@bingemate.dev`, `consumer@bingemate.dev`.

## Scripts

| Command | What |
|---|---|
| `npm run lint` | ESLint across the monorepo |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm test` | run all workspace tests |
| `npm run format` | Prettier write |
| `npm run db:up` / `db:down` | start / stop local databases |

## Git workflow

Feature branches (`feat/…`, `fix/…`) → PR into `main`. Direct pushes to `main` are blocked;
CI (lint + typecheck + test) must pass before merge. 0 approvals required.
