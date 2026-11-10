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

| Option                        | Does                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `npm run up -- --reload-data` | Wipe local PostgreSQL + MongoDB and load `data/processed` again       |
| `npm run up -- --demo`        | Use the small demo seed (3 titles, no posters) instead of the dataset |
| `npm run up -- --no-dev`      | Prepare everything, don't start the servers                           |

For real data instead of mocks, put `VITE_USE_MOCKS=false` in `apps/web/.env.local` first.

**Database ports are picked per machine.** `npm run up` uses 5432 for PostgreSQL and 27017 for MongoDB when they're
free, and otherwise the next free port (5433, 5434, ...), for example when Postgres is also installed on your machine.
It saves the choice as `POSTGRES_PORT` / `MONGO_PORT` in the root `.env` (gitignored, so it's yours alone) and
rewrites the ports in `DATABASE_URL` and `MONGO_URI` in `apps/api/.env` to match. Docker Compose reads the root `.env`
too, so `npm run db:up` uses the same ports. To force a port, run `POSTGRES_PORT=5440 npm run up` once (on PowerShell:
`$env:POSTGRES_PORT=5440; npm run up`).

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

With mocks off, every page uses the API: browsing, search, title pages (with cast and crew, posters and trailers), people pages and the "How are they connected?" finder, reviews, replies, My Lists, Profile (change username and password), Creator submissions and stats, image uploads, and all three admin screens (approval queue, Users and roles, Moderation).

Posters and trailers come from `data/processed` (fetched from TMDB ahead of time; see `data/etl/README.md`). To copy newer poster and trailer links into a database that is already loaded, without `--reset`, run `npx tsx data/etl/update-media.ts` (a dry run), then the same command with `--apply`, then refresh trending (below).

Visitors browse approved titles. Signup collects Email, Username and Password and signs in a `MEMBER`; every member can use **Creator** to submit titles. Admins never submit titles or write reviews or replies. A member may have at most 10 `PENDING` titles at once. Creating an eleventh returns HTTP 409: **You already have 10 titles waiting for approval. Wait for an admin to decide on some of them.** Edits do not count against this cap.

Usernames are NFKC-normalised, trimmed, and runs of whitespace become one space. They must be 3 to 30 characters after normalisation; use Unicode letters, digits, single spaces, `_`, `-` and `.`; and start and end with a letter or digit. Invisible characters (zero-width, soft hyphen, Hangul fillers) are refused. Letters must come from one of eleven supported alphabets (Latin, Cyrillic, Greek, Han, Hiragana, Katakana, Hangul, Arabic, Hebrew, Devanagari, Thai) and cannot be mixed, except Latin with any of Han, Hiragana and Katakana, or Latin with Han and Hangul. They are unique ignoring case. Reserved names (`admin`, `administrator`, `moderator`, `bingemate`, `support`, `system`) are refused ignoring case, accents and separators (for example `a.d.m.i.n`), and also when written with common Cyrillic, Greek, small-capital or leetspeak lookalikes (for example `ѕуѕтем` or `Supp0rt`). Only whole names are matched, not substrings or tokens. A lookalike of another member's username is not detected. The full rules are in [docs/api.md](docs/api.md#username-rules). Registration conflicts return 409 `Email already in use` or `Username already taken`. See [the manual](docs/user-manual.md) for ownership and moderation rules.

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

### Look at the databases

```bash
cd apps/api && npx prisma studio                                # PostgreSQL in the browser
docker exec -it bingemate-postgres psql -U bingemate -d bingemate  # PostgreSQL shell
docker exec -it bingemate-mongo mongosh bingemate                  # MongoDB shell
```

## Scripts

| Command                     | What                                                 |
| --------------------------- | ---------------------------------------------------- |
| `npm run up`                | set up and start everything                          |
| `npm run dev`               | API, then the website once the API answers `/health` |
| `npm run lint`              | ESLint across the monorepo                           |
| `npm run typecheck`         | `tsc --noEmit` in every workspace                    |
| `npm test`                  | run all workspace tests                              |
| `npm run format`            | Prettier write                                       |
| `npm run db:up` / `db:down` | start / stop local databases                         |

## Real-database tests

Create the isolated PostgreSQL database: `docker exec bingemate-postgres createdb -U bingemate bingemate_test`.
Export `export TEST_DATABASE_URL=postgresql://bingemate:bingemate@localhost:5432/bingemate_test?schema=public` (adjust credentials, and use the `POSTGRES_PORT` from the root `.env` if `npm run up` picked another port).
Export `export TEST_MONGO_URI=mongodb://localhost:27017/bingemate_test` with MongoDB running locally (again, use `MONGO_PORT` if it is set).
Run `npm run test:real --workspace apps/api`; global setup deploys migrations automatically.
This suite truncates every app table and drops every Mongo collection in that `_test` database; `npm test` stays stubbed.

## Git workflow

Feature branches (`feat/…`, `fix/…`) → PR into `main`. Direct pushes to `main` are blocked;
CI (lint + typecheck + test) must pass before merge. 0 approvals required.
