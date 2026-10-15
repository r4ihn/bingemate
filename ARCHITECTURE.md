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
│   │   │   ├── modules/                  # one folder per feature: routes → controller → service
│   │   │   │   ├── auth/                 # RA: register, login, me, logout (bcrypt + JWT)
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   └── auth.schema.ts
│   │   │   │   ├── users/                # JW
│   │   │   │   ├── titles/               # JW (CRUD) + SJ (search/filter)
│   │   │   │   ├── genres/
│   │   │   │   ├── people/
│   │   │   │   ├── lists/                # completed / in-progress / plan-to
│   │   │   │   ├── reviews/              # HS: PG header row + Mongo body, one service writes both
│   │   │   │   ├── comments/             # HS (MongoDB), consumers + creators, one reply level
│   │   │   │   ├── trending/             # SJ (SQL aggregates) + HS (trending cards)
│   │   │   │   ├── creator/              # JW: own titles, submission status, stats
│   │   │   │   └── admin/                # RA: role management, title approval queue, moderation
│   │   │   ├── mongo/
│   │   │   │   └── models/
│   │   │   │       ├── reviewBody.model.ts  # _id = PG reviews.id; discriminators: movie / book / tvShow
│   │   │   │       ├── comment.model.ts
│   │   │   │       └── trendingCard.model.ts
│   │   │   ├── jobs/
│   │   │   │   └── refreshTrending.ts    # rebuild denormalised trending cards
│   │   │   ├── utils/
│   │   │   │   ├── jwt.ts                # sign/verify, 2h expiry
│   │   │   │   ├── authCookie.ts         # set/clear httpOnly SameSite=Lax cookie
│   │   │   │   ├── password.ts           # bcrypt hash/compare
│   │   │   │   └── pagination.ts
│   │   │   ├── routes.ts                 # mounts all module routers under /api
│   │   │   ├── app.ts                    # Express app (no listen, so tests can import it)
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
│   ├── architecture.png
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

| Store | Holds |
|---|---|
| PostgreSQL (Prisma) | users (+ role, bcrypt hash), titles (+ status PENDING/APPROVED/REJECTED, created_by, rejection_reason), genres, people, title_genres, title_people, list_entries, reviews header (id, user_id, title_id, rating, timestamps), rating aggregates |
| MongoDB (Mongoose) | review bodies (`_id` = PG `reviews.id`) with media-specific fields, comment threads (one reply level, creator official reply flagged `isOfficial`), denormalised trending cards |

Cross-database link: a review's PostgreSQL row and its Mongo body share one id; comments store `reviewId` / `userId`. There are no FKs across the two stores, so the reviews service writes PostgreSQL first, then Mongo, and undoes the PostgreSQL row if the Mongo write fails. Deleting a title or review must also delete the Mongo body and comments.
