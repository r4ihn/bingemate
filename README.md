# BingeMate

INF2003 Group 29 — a media catalogue + reviews app.
Monorepo (npm workspaces): React SPA (`apps/web`) → Express API (`apps/api`) → PostgreSQL (Prisma) + MongoDB (Mongoose).
Shared TypeScript types live in `packages/shared`.

See `ARCHITECTURE.md` for the full layout and `TASKS.md` for the task breakdown.

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL + MongoDB)

## Quick start

With Docker running, one command takes a fresh clone (or a checkout that's behind) to a running app:

```bash
npm run up
```

It installs dependencies when the lockfile changed, creates `apps/api/.env` (with a random `JWT_SECRET`) and
`apps/web/.env` if they're missing, starts PostgreSQL and MongoDB and waits until they're healthy, applies pending
migrations, loads the full dataset from `data/processed` (1,500 titles with posters, reviews, users) into an empty
database and rebuilds trending, then starts the API and the website. Open **http://localhost:5173**. Every step is
safe to repeat, so run it again after every `git pull`. It never replaces existing data by itself.

| Option                          | Does                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| `npm run up -- --reload-data`   | Wipe local PostgreSQL + MongoDB and load `data/processed` again            |
| `npm run up -- --demo`          | Use the small demo seed (3 titles, no posters) instead of the dataset      |
| `npm run up -- --no-dev`        | Prepare everything, don't start the servers                                |

For real data instead of mocks, put `VITE_USE_MOCKS=false` in `apps/web/.env.local` first.

PostgreSQL is published on host port **5433**, not 5432, so it never clashes with a Postgres installed on your
machine. Set `POSTGRES_PORT` to pick another port, and keep `DATABASE_URL` in `apps/api/.env` matching it.

## Manual setup

```bash
# 1. Install all workspace deps from the repo root
npm install

# 2. Start local databases (Postgres + Mongo, bound to localhost)
npm run db:up

# 3. Configure env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local   # optional

# 4. Create the DB schema + generate the Prisma client
#    (on a newly created database this also runs the seed in step 5 by itself)
npm run prisma:migrate
npm run prisma:generate

# 5. Seed demo data (admin / two members, sample titles); safe to run again
npm run seed

# 6. Run both apps
npm run dev          # api + web
# or individually:
npm run dev:api      # http://localhost:4000
npm run dev:web      # http://localhost:5173
```

Demo accounts (password `Password123!`): `admin@bingemate.dev`, `creator@bingemate.dev`, `consumer@bingemate.dev`.
The seed usernames are **BingeMate Admin** (admin), **Demo Maker** and **Demo Viewer**. `creator@bingemate.dev` and `consumer@bingemate.dev` are ordinary members; their email names are historical. Loaded dataset accounts keep their usernames: `admin` and `demo_creator`, respectively for `admin@bingemate.dev` and `creator@bingemate.dev`.

The cleaned full dataset is included in `data/processed/`. To use it instead of the demo seed, run `npx tsx data/etl/load-all.ts --reset`, then `npx tsx data/etl/verify-load.ts` (see `data/etl/README.md`). No cleaning step is required. The `--reset` replaces existing database data, including the demo data seeded by step 4.

After the dataset load (`data/etl/load-all.ts`) there is no `consumer@bingemate.dev`; any imported user works instead, for example `user4@seed.bingemate.local`.

### Run the website on real data

The website is always on http://localhost:5173 (the API is on :4000). **Mock data is the default in dev**, so a plain
`npm run dev` shows fake titles and reviews. To use the real API:

```bash
npm run db:up                                   # PostgreSQL + MongoDB
cd apps/api && npm run dev                      # API on :4000
cd apps/web && VITE_USE_MOCKS=false npm run dev # website on :5173, real data
```

With mocks off, browsing, search, reviews, replies, My Lists, Creator submissions and stats, image uploads and the admin approval queue use the API. Admin Users and Moderation remain mock-only.

Visitors browse approved titles. Signup collects Email, Username and Password and signs in a `MEMBER`; every member can use **Creator** to submit titles. Admins never submit titles or write reviews or replies. A member may have at most 10 `PENDING` titles at once. Creating an eleventh returns HTTP 409: **You already have 10 titles waiting for approval. Wait for an admin to decide on some of them.** Edits do not count against this cap.

Usernames are NFKC-normalised, trimmed, and runs of whitespace become one space. They must be 3 to 30 characters after normalisation; use Unicode letters, digits, single spaces, `_`, `-` and `.`; and start and end with a letter or digit. They are unique ignoring case. Latin, Cyrillic and Greek letters cannot be mixed with one another; other scripts are unaffected. Reserved names (`admin`, `administrator`, `moderator`, `bingemate`, `support`, `system`) are refused ignoring case, including when spaces, underscores, hyphens or periods separate their letters (for example `a.d.m.i.n`). This checks exact full or compact names, not substrings or tokens. Lookalikes within a single script, such as all-Cyrillic names, are not detected. Registration conflicts return 409 `Email already in use` or `Username already taken`. See [the manual](docs/user-manual.md) for ownership and moderation rules.

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

## Real-database tests

Create the isolated PostgreSQL database: `docker exec bingemate-postgres createdb -U bingemate bingemate_test`.
Export `export TEST_DATABASE_URL=postgresql://bingemate:bingemate@localhost:5432/bingemate_test?schema=public` (adjust credentials).
Export `export TEST_MONGO_URI=mongodb://localhost:27017/bingemate_test` with MongoDB running locally.
Run `npm run test:real --workspace apps/api`; global setup deploys migrations automatically.
This suite truncates every app table and drops every Mongo collection in that `_test` database; `npm test` stays stubbed.

## Git workflow

Feature branches (`feat/…`, `fix/…`) → PR into `main`. Direct pushes to `main` are blocked;
CI (lint + typecheck + test) must pass before merge. 0 approvals required.
