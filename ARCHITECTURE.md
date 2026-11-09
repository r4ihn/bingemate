# BingeMate: Project Structure

Monorepo with npm workspaces: React SPA (`apps/web`) → Express API (`apps/api`) → PostgreSQL (Prisma) + MongoDB (Mongoose).
`packages/shared` holds the types both sides use (roles, media types, DTOs), so frontend and backend cannot drift apart.

```text
bingemate/
├── apps/
│   ├── api/                              # Node.js + Express + TypeScript
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # users, titles (+status, created_by), genres, people, junctions, list_entries, reviews (header)
│   │   │   ├── migrations/
│   │   │   └── seed.ts                   # roles + demo admin/two members + sample titles
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── env.ts                # Zod-validated env (DATABASE_URL, MONGO_URI, JWT_SECRET…)
│   │   │   ├── db/
│   │   │   │   ├── prisma.ts             # PrismaClient singleton
│   │   │   │   └── mongo.ts              # Mongoose connection
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts       # verify JWT → req.user
│   │   │   │   ├── authorize.ts          # authorize('ADMIN', 'MEMBER')
│   │   │   │   ├── validate.ts           # Zod request validation
│   │   │   │   ├── rateLimit.ts
│   │   │   │   └── errorHandler.ts
│   │   │   ├── modules/                  # feature routers → services; auth/roles/Zod applied here
│   │   │   │   ├── auth/                 # RA: register, login, me, logout (bcrypt + JWT)
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   └── auth.schemas.ts
│   │   │   │   ├── users/                # profile: GET/PATCH /users/me, PATCH /users/me/password
│   │   │   │   ├── titles/               # JW (CRUD) + SJ (search/filter)
│   │   │   │   ├── genres/
│   │   │   │   ├── people/               # person search, credits, degrees of separation (recursive CTE)
│   │   │   │   ├── lists/                # completed / in-progress / plan-to
│   │   │   │   ├── reviews/              # HS: PG header row + Mongo body, one service writes both
│   │   │   │   ├── replies/              # HS (MongoDB), flat replies under reviews
│   │   │   │   ├── reviewStats/          # review activity + top reviewers
│   │   │   │   ├── posters/              # image GET / PUT / DELETE
│   │   │   │   ├── trending/             # SJ (SQL aggregates) + HS (trending cards)
│   │   │   │   ├── creator/              # JW: own titles, submission status, stats
│   │   │   │   └── admin/                # title approval queue, users and roles, review moderation list
│   │   │   ├── mongo/
│   │   │   │   └── models/
│   │   │   │       ├── reviewBody.model.ts  # _id = PG reviews.id; one shape: text plus a mediaType copy
│   │   │   │       ├── reply.model.ts
│   │   │   │       ├── trendingCard.model.ts
│   │   │   │       └── titlePoster.model.ts
│   │   │   ├── jobs/
│   │   │   │   ├── refreshTrending.ts    # cards + title ranks, CLI, startup check + configurable timer
│   │   │   │   └── cleanupOrphans.ts     # standalone maintenance, outside runtime
│   │   │   ├── utils/
│   │   │   │   ├── jwt.ts                # sign/verify, 2h expiry
│   │   │   │   ├── authCookie.ts         # set/clear httpOnly SameSite=Lax cookie
│   │   │   │   ├── password.ts           # bcrypt hash/compare
│   │   │   │   └── pagination.ts
│   │   │   ├── routes.ts                 # mounts all module routers under /api
│   │   │   ├── app.ts                    # JSON/cookies/CORS → routes → final 404 + error handler
│   │   │   └── server.ts                 # entry point: connect DBs, listen
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/              # Supertest with Prisma and MongoDB stubbed
│   │   │   └── real/                     # npm run test:real: real PostgreSQL + MongoDB (_test databases)
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                              # React + TypeScript (Vite)
│       ├── public/
│       ├── src/
│       │   ├── api/                      # typed fetch client, one file per resource
│       │   │   ├── client.ts
│       │   │   ├── auth.ts
│       │   │   ├── titles.ts
│       │   │   ├── reviews.ts
│       │   │   ├── lists.ts
│       │   │   ├── people.ts
│       │   │   ├── users.ts
│       │   │   ├── creator.ts, genres.ts, trending.ts
│       │   │   └── admin.ts
│       │   ├── auth/
│       │   │   ├── AuthContext.tsx
│       │   │   ├── ProtectedRoute.tsx
│       │   │   └── RoleGate.tsx          # show/hide UI by role
│       │   ├── components/               # TitleHero, TrailerDialog, TitleCredits, ConnectionFinder, review/reply cards, Pagination…
│       │   ├── layouts/
│       │   ├── pages/
│       │   │   ├── Home.tsx              # trending cards
│       │   │   ├── Browse.tsx            # search + filters
│       │   │   ├── TitleDetail.tsx       # hero (poster, trailer) + cast and crew + reviews + replies
│       │   │   ├── Person.tsx            # credits + "How are they connected?" finder
│       │   │   ├── Profile.tsx           # account details, username and password forms, list counts
│       │   │   ├── Login.tsx
│       │   │   ├── Register.tsx
│       │   │   ├── MyLists.tsx
│       │   │   ├── creator/              # upload / edit / delete own titles, submission status, stats
│       │   │   └── admin/                # users & roles, moderation
│       │   ├── hooks/
│       │   ├── styles/
│       │   ├── App.tsx                   # router
│       │   └── main.tsx
│       ├── index.html
│       ├── .env.example                  # VITE_API_URL
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── packages/
│   └── shared/                           # imported by both apps
│       ├── src/
│       │   ├── enums.ts                  # Role, MediaType, ListStatus, TitleStatus
│       │   ├── dto/                      # request/response types
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── data/
│   ├── raw/                              # dataset files and TMDB lookups (committed)
│   ├── processed/                        # cleaned CSV/JSONL (committed; id-map and logs stay local)
│   └── etl/                              # JW + HS (see data/etl/README.md)
│       ├── clean-all.ts                  # runs every clean-*.ts (movies, books, tvshows, people, posters, trailers…)
│       ├── fetch-posters.ts              # TMDB: replace dead or missing poster links (needs TMDB_API_KEY)
│       ├── fetch-trailers.ts             # TMDB: best YouTube trailer per movie / TV show
│       ├── load-all.ts                   # load-postgres.ts + load-mongo-reviews.ts
│       ├── update-media.ts               # copy new poster/trailer links into a loaded database
│       ├── verify-load.ts
│       └── id-mapping.ts                 # dataset title → titles.id
│
├── benchmarks/                           # SJ: SQL vs NoSQL comparison
│   ├── scenarios/
│   ├── run.ts
│   ├── seed-bench.ts
│   ├── explain.ts
│   ├── people-connection.ts              # EXPLAIN ANALYZE of the degrees-of-separation query
│   └── results/
│
├── scripts/
│   └── up.mjs                            # npm run up: install, env files, databases, migrate, load, dev
│
├── docs/
│   ├── architecture.svg
│   ├── api.md                            # endpoint list + required role
│   ├── user-manual.md
│   ├── benchmarks/                       # explain.md, results.md
│   └── e2e/                              # Playwright click-through scripts
│
├── .github/workflows/ci.yml              # verify (lint, typecheck, test) + verify-real-db
├── docker-compose.yml                    # postgres + mongo (bound to localhost)
├── .gitignore
├── .prettierrc
├── eslint.config.js
├── tsconfig.base.json
├── package.json                          # npm workspaces: apps/*, packages/*
├── TASKS.md
└── README.md
```

## Data split (from the report)

| Store               | Holds                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL (Prisma) | users (+ role, bcrypt hash), titles (+ status PENDING/APPROVED/REJECTED, created_by, rejection_reason, poster_url, trailer_key), movie_details, tv_details, book_details (one optional row per title, type enforced by a composite foreign key), genres, people, title_genres, title_people, list_entries, reviews header (id, user_id, title_id, rating, timestamps), rating aggregates |
| MongoDB (Mongoose)  | review bodies (`_id` = PG `Review.id`, `titleId`, `userId`, copied `mediaType`, `body` text, `createdAt`, `updatedAt`; one shape for all media types), replies (one flat list per review), poster images, denormalised trending cards                                                                                                                                                    |

Cross-database link: PostgreSQL `Review.id` equals MongoDB `ReviewBody._id`; replies store `reviewId` / `userId`. Review creation first commits a PostgreSQL transaction that locks the Title row and inserts the Review header. It then writes the Mongo body with the same id. If that fails, a compensating transaction locks the title and removes the header; compensation failures are logged. `Title.avgRating` / `reviewCount` are maintained by the database, not the API: three statement-level triggers on `Review` (`review_rating_insert`, `_update`, `_delete`, using transition tables) recompute the affected titles from `title_rating_stats` in the same transaction, so cascaded deletes, bulk loads and manual SQL keep the totals right too (migration `20261105120000_rating_triggers`). The API still takes the Title row lock first so two concurrent reviews of one title cannot each aggregate without seeing the other. There is no cross-store transaction or foreign key. Deleting a title or review also attempts to remove its Mongo body and replies.

[Architecture diagram](docs/architecture.svg): app-level middleware parses JSON and cookies and enables credentialed CORS; routers are followed by the final 404 and error handlers. `authenticate`, `optionalAuthenticate`, `authorize(role)` and Zod validation are attached to individual routes or feature routers as required, with no global authentication, validation or rate-limit pipeline. Only login/register, poster PUT/DELETE and the password change are rate limited. The React client sends the JWT in the httpOnly `token` cookie using `credentials: 'include'`.

The `admin` module serves the title approval queue (`/admin/titles`), the user list and role changes (`/admin/users`), and a review list across every title for moderation (`/admin/reviews`); removal uses the shared `DELETE /reviews/:id` and `DELETE /replies/:id`. The `users` module lets a signed-in user read their profile and change their username or password; both changes re-issue the cookie so the JWT carries the new name. The `people` module serves person search, person pages and `GET /people/:id/connection/:otherId`, the shortest chain of shared approved titles between two people, found by a breadth-first recursive CTE (see docs/api.md). The four SQL views are `title_rating_stats`, `genre_filter_options`, `trending_titles` and `creator_title_stats`; the materialized view `title_rank_in_type` uses `RANK` and `PERCENT_RANK` per media type and is read for title-page ranking. `Title.trailerKey` holds an optional YouTube id (a CHECK refuses anything else, migration `20261105130000_title_trailer`); the web app plays it from the title hero in a `youtube-nocookie.com` embed. `scripts/up.mjs`, ETL scripts (including the TMDB poster and trailer fetchers and `update-media`), `cleanupOrphans`, `backfill-undated-dates`, benchmark seed/run/explain/people-connection scripts and the isolated real-database test suite are tooling outside the runtime tiers.

## Authentication and membership

Visitors have no authenticated role; persisted roles are `ADMIN` and `MEMBER`, with `MEMBER` the signup default. All members can use the **Creator** page and own-title routes. Admins do not submit titles or write reviews or replies; a member cannot review their own title, but can reply under its reviews. Ownership controls editing and deletion: members delete only their own titles while no other user has reviewed or listed them. Edits and member image replacements on approved titles return them to `PENDING`; image removal alone does not.

Signup requires email, username and password. Both API and web use `packages/shared/src/username.ts`: Usernames are NFKC-normalised, trimmed, and runs of whitespace become one space. They must be 3 to 30 characters after normalisation; use Unicode letters, digits, single spaces, `_`, `-` and `.`; and start and end with a letter or digit. They are unique ignoring case. Latin, Cyrillic and Greek letters cannot be mixed with one another; other scripts are unaffected. Reserved names (`admin`, `administrator`, `moderator`, `bingemate`, `support`, `system`) are refused ignoring case, including when spaces, underscores, hyphens or periods separate their letters (for example `a.d.m.i.n`). This checks exact full or compact names, not substrings or tokens. Lookalikes within a single script, such as all-Cyrillic names, are not detected. The migration `20261103140000_members_and_usernames` merges the former non-admin roles, repairs case-insensitive collisions with suffixes such as ` (2)` (oldest `createdAt`, then `id`, wins), and creates `User_username_lower_key` on `lower("username")`. Username remains nullable for legacy rows, with the `user-xxxxxx` author fallback. The unique index enforces race-safe conflicts: 409 `Email already in use` or `Username already taken`.

JWTs carry the username as well as id, email and role; verification maps legacy non-admin role values to `MEMBER` until those tokens expire (default two hours). A member may have at most 10 `PENDING` titles at once. Creating an eleventh returns HTTP 409: **You already have 10 titles waiting for approval. Wait for an admin to decide on some of them.** Edits do not count against this cap. The count and insert share a transaction under `pg_advisory_xact_lock(hashtext(userId))`, preventing concurrent creations from exceeding the cap.

## Trending refresh lifecycle

After the API starts listening, `server.ts` calls `refreshIfEmpty()` to populate an empty
`TrendingCard` collection and starts `startTrendingTimer(env.TRENDING_REFRESH_MINUTES)`.
The env value is an integer from 0 to 1440, default 10; 0 disables the timer (the empty-collection startup check still runs).
The first scheduled refresh runs after the first interval. The interval is unrefed, skips
pending runs, logs failures and continues; SIGINT/SIGTERM clear it before process exit.
Startup count/refresh failures are logged without preventing the API from serving.

`refreshTrending()` upserts the top 50 per media type from PostgreSQL's `trending_titles`
view before deleting stale cards, so the collection is never wiped before rebuilding.
It then attempts `REFRESH MATERIALIZED VIEW CONCURRENTLY "title_rank_in_type"`;
rank-refresh failures are logged without failing the card refresh. An empty SQL result
returns early, keeping existing cards and skipping the rank refresh.
Before writing, it calls MongoDB's `recentReviewCounts(1460)` once and stores `recentReviews`
on every card (0 for absent counts). Aggregation failure leaves existing cards untouched.
`GET /api/trending` sorts by score by default, or by `recentReviews`, score and titleId
with `sort=recent`; the 1460-day window is fixed at refresh time, with no `days` query parameter.
If the view returns no rows, it warns and keeps existing cards. To fill an empty collection
manually or refresh on demand, run from the repo root:
`npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts`.
