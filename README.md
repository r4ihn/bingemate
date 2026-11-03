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
After the dataset load (`data/etl/load-all.ts`) there is no `consumer@bingemate.dev`; any imported user works instead, for example `user4@seed.bingemate.local`.

### Run the website on real data

The website is always on http://localhost:5173 (the API is on :4000). **Mock data is the default in dev**, so a plain
`npm run dev` shows fake titles and reviews. To use the real API:

```bash
npm run db:up                                   # PostgreSQL + MongoDB
cd apps/api && npm run dev                      # API on :4000
cd apps/web && VITE_USE_MOCKS=false npm run dev # website on :5173, real data
```

With mocks off, browsing, search, reviews, replies, My Lists and creator stats use the API. The creator title
forms (create, edit, delete, image upload) and the admin pages still need their API endpoints and show
"Real API not wired yet".

### Trending refresh

The API checks the `TrendingCard` collection after it starts listening and refreshes it once if it is empty.
`TRENDING_REFRESH_MINUTES` in `apps/api/.env` controls the recurring timer: an integer from 0 to 1440,
default 10 minutes; `0` disables the timer (the empty-collection startup check still runs).
The timer first runs after one full interval, skips ticks while its previous run is pending, logs failures,
and stops on SIGINT/SIGTERM. A refresh upserts cards before deleting stale cards; an empty SQL view
keeps existing cards and logs a warning.

To fill an empty collection manually, or refresh before a demo, run the CLI from the repo root:

```bash
npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts
```

## Scripts

| Command                     | What                              |
| --------------------------- | --------------------------------- |
| `npm run lint`              | ESLint across the monorepo        |
| `npm run typecheck`         | `tsc --noEmit` in every workspace |
| `npm test`                  | run all workspace tests           |
| `npm run format`            | Prettier write                    |
| `npm run db:up` / `db:down` | start / stop local databases      |

## Git workflow

Feature branches (`feat/…`, `fix/…`) → PR into `main`. Direct pushes to `main` are blocked;
CI (lint + typecheck + test) must pass before merge. 0 approvals required.
