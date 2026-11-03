# BingeMate: Initial Project Structure

Monorepo with npm workspaces: React SPA (`apps/web`) → Express API (`apps/api`) → PostgreSQL (Prisma) + MongoDB (Mongoose).
`packages/shared` holds the types both sides use (roles, media types, DTOs), so frontend and backend cannot drift apart.

```text
bingemate/
├── apps/
│   ├── api/                              # Node.js + Express + TypeScript
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # users, titles (+status, created_by), genres, people, junctions, list_entries, reviews (header)
│   │   │   ├── migrations/
│   │   │   └── seed.ts                   # roles + demo admin/creator/consumer + sample titles
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── env.ts                # Zod-validated env (DATABASE_URL, MONGO_URI, JWT_SECRET…)
│   │   │   ├── db/
│   │   │   │   ├── prisma.ts             # PrismaClient singleton
│   │   │   │   └── mongo.ts              # Mongoose connection
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts       # verify JWT → req.user
│   │   │   │   ├── authorize.ts          # authorize('ADMIN', 'CREATOR')
│   │   │   │   ├── validate.ts           # Zod request validation
│   │   │   │   ├── rateLimit.ts
│   │   │   │   └── errorHandler.ts
│   │   │   ├── modules/                  # feature routers → services; auth/roles/Zod applied here
│   │   │   │   ├── auth/                 # RA: register, login, me, logout (bcrypt + JWT)
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   └── auth.schemas.ts
│   │   │   │   ├── titles/               # JW (CRUD) + SJ (search/filter)
│   │   │   │   ├── genres/
│   │   │   │   ├── lists/                # completed / in-progress / plan-to
│   │   │   │   ├── reviews/              # HS: PG header row + Mongo body, one service writes both
│   │   │   │   ├── replies/              # HS (MongoDB), flat replies under reviews
│   │   │   │   ├── reviewStats/          # review activity + top reviewers
│   │   │   │   ├── posters/              # image GET / PUT / DELETE
│   │   │   │   ├── trending/             # SJ (SQL aggregates) + HS (trending cards)
│   │   │   │   ├── creator/              # JW: own titles, submission status, stats
│   │   │   │   └── admin/                # built: title approval; RA users/roles/moderation endpoints planned
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
│   │   │   └── integration/              # Supertest against test DBs
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
│       │   │   └── admin.ts
│       │   ├── auth/
│       │   │   ├── AuthContext.tsx
│       │   │   ├── ProtectedRoute.tsx
│       │   │   └── RoleGate.tsx          # show/hide UI by role
│       │   ├── components/               # TitleCard, ReviewCard, CommentThread, FilterBar, Pagination…
│       │   ├── layouts/
│       │   ├── pages/
│       │   │   ├── Home.tsx              # trending cards
│       │   │   ├── Browse.tsx            # search + filters
│       │   │   ├── TitleDetail.tsx       # info + reviews + comments
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
│   ├── raw/                              # downloaded Kaggle/Zenodo files (gitignored)
│   ├── processed/                        # cleaned CSV/JSON (gitignored)
│   └── etl/                              # JW + HS
│       ├── clean-movies.ts
│       ├── clean-books.ts
│       ├── clean-tvshows.ts
│       ├── load-postgres.ts
│       ├── load-mongo-reviews.ts
│       └── id-mapping.ts                 # dataset title → titles.id
│
├── benchmarks/                           # SJ: SQL vs NoSQL comparison
│   ├── scenarios/
│   ├── run.ts
│   └── results/
│
├── docs/
│   ├── er-diagram.png
│   ├── architecture.svg
│   └── api.md                            # endpoint list + required role
│
├── .github/workflows/ci.yml              # lint, typecheck, test
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

| Store               | Holds                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL (Prisma) | users (+ role, bcrypt hash), titles (+ status PENDING/APPROVED/REJECTED, created_by, rejection_reason), movie_details, tv_details, book_details (one optional row per title, type enforced by a composite foreign key), genres, people, title_genres, title_people, list_entries, reviews header (id, user_id, title_id, rating, timestamps), rating aggregates |
| MongoDB (Mongoose)  | review bodies (`_id` = PG `Review.id`, `titleId`, `userId`, copied `mediaType`, `body` text, `createdAt`, `updatedAt`; one shape for all media types), replies (one flat list per review), poster images, denormalised trending cards                                                                                                                           |

Cross-database link: PostgreSQL `Review.id` equals MongoDB `ReviewBody._id`; replies store `reviewId` / `userId`. Review creation first commits a PostgreSQL transaction that locks the Title row, inserts the Review header and recomputes `avgRating` / `reviewCount` from `title_rating_stats`. It then writes the Mongo body with the same id. If that fails, a compensating transaction locks the title, removes the header and recomputes the totals; compensation failures are logged. There is no cross-store transaction or foreign key. Deleting a title or review also attempts to remove its Mongo body and replies.

[Architecture diagram](docs/architecture.svg): app-level middleware parses JSON and cookies and enables credentialed CORS; routers are followed by the final 404 and error handlers. `authenticate`, `optionalAuthenticate`, `authorize(role)` and Zod validation are attached to individual routes or feature routers as required, with no global authentication, validation or rate-limit pipeline. Only login/register and poster PUT/DELETE are rate limited. The React client sends the JWT in the httpOnly `token` cookie using `credentials: 'include'`.

The `admin` module implements title listing and status changes. Separate admin user, role and review-moderation endpoints remain planned (RA); the existing review DELETE endpoint already allows an admin to remove a review. The four SQL views are `title_rating_stats`, `genre_filter_options`, `trending_titles` and `creator_title_stats`; the materialized view `title_rank_in_type` uses `RANK` and `PERCENT_RANK` per media type and is read for title-page ranking. ETL scripts, `cleanupOrphans`, `backfill-undated-dates`, benchmark seed/run/explain scripts and the isolated real-database test suite are tooling outside the runtime tiers.

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
