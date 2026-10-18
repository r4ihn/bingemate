# BingeMate: Team Task List

Source: Group 29 INF2003 Progress Report (30 Sep 2026) + agreed tech stack
(React + TS frontend, Node.js + TS backend, PostgreSQL/Prisma, MongoDB, bcrypt, JWT, email & password).

Owners: **RA** Raihan · **JW** Jason · **HS** Hu Shi Yao · **WH** Winthrop · **SJ** Shang Jay · **ALL** whole team
`[x]` = already reported done in the progress report.

---

## 0. Decisions to lock before coding (ALL, Week 6)

- [x] **Where reviews live: split (option B).** PostgreSQL `reviews` holds the header row (`id`, `user_id`, `title_id`, `rating`, `created_at`, `updated_at`), so ratings and aggregates get ACID and FKs. MongoDB holds the body, the media-specific fields and the comments, keyed by the same `id`.
- [x] **Creator privileges (baseline).** Creators create titles and can edit/delete **only their own** titles; admins can edit/delete any.
  - [x] Extras locked: (a) submission status + rejection reason, (b) stats per own title, (c) editing an approved title sends it back to `PENDING`, (d) one pinned official reply per review on own titles, (e) "Creator" badge on their reviews/comments.
- [x] **Creator-uploaded titles.** Saved as `PENDING`; hidden from browse/search until an admin sets them to `APPROVED` (or `REJECTED`).
- [x] **Comments.** Consumers and creators can comment (admins can delete any). Assumed depth: one level of replies (review → comment → reply). Change it if you want deeper threads.
- [x] **JWT strategy.** One access token (2h) in an httpOnly cookie (`Secure` in prod, `SameSite=Lax`), no refresh tokens. Logout clears the cookie; on expiry the user logs in again.
- [x] **Libraries.** Express, Mongoose, Vite, Zod, Vitest/Jest + Supertest.
- [x] **Dev dataset size.** A subset of the 950k films for local dev; the full set for benchmarking only.
- [x] **Git workflow.** Monorepo, feature branches (`feat/…`, `fix/…`), merge to `main` through a PR with **no approval required**; direct pushes to `main` are blocked (branch protection). CI must pass before merge.

## 1. Project setup (Week 6)

- [x] Create the monorepo scaffold (`apps/web`, `apps/api`, `packages/shared`). See `ARCHITECTURE.md`. *(RA)*
- [x] `docker-compose.yml` for PostgreSQL + MongoDB so everyone runs identical local DBs *(RA)*
- [x] Shared `tsconfig.base.json`, ESLint, Prettier *(RA)*
- [x] `.env.example` for `apps/api` and `apps/web`; add `.env` and `data/raw/` to `.gitignore` *(RA)*
- [x] CI (GitHub Actions or similar): lint, typecheck and test on every PR *(RA)*
- [x] Branch protection on `main`: require a PR and passing CI, 0 approvals, no direct pushes *(RA)*
- [ ] Dev seed uses a dataset subset (e.g. 10–20k films); full load only for benchmarks *(JW)*
- [ ] Move the existing prototype code (Titles/Users CRUD, browse page) into the new structure *(JW, WH)*

## 2. Data & relational schema (JW, Week 6)

- [x] Download datasets and load them into PostgreSQL and MongoDB
- [x] Initial ER diagram (Users, Titles, Genres, Reviews, Lists, junction tables)
- [x] Basic CRUD for Titles and Users in PostgreSQL
- [ ] Finalise the ER diagram: `users`, `titles` (with `media_type` MOVIE/BOOK/TV_SHOW, `status` PENDING/APPROVED/REJECTED, `created_by` → users), `genres`, `title_genres`, `people`, `title_people` (role: author/director/actor/showrunner), `list_entries`, `reviews` (header row only)
- [ ] Write `prisma/schema.prisma` and generate the first migration
- [ ] Constraints: unique email, FKs with explicit `onDelete`, unique `(user_id, title_id)` on `list_entries` and on `reviews` (one review per user per title), `CHECK` on the rating range
- [ ] Indexes for browse/search: `titles(media_type)`, `titles(name)`, `titles(status)`, `title_genres(genre_id)`, `titles(avg_rating)`, `reviews(title_id)`
- [ ] Rating aggregates (`avg_rating`, `review_count` on `titles`) recomputed in the same transaction as a `reviews` insert/update/delete
- [ ] Imported dataset titles get `status = APPROVED` and `created_by = NULL`
- [ ] ETL scripts: clean nulls/duplicates, normalise genre names across the three datasets, dedupe people, keep a dataset-ID → DB-ID mapping
- [ ] `prisma/seed.ts`: one admin, one creator, one consumer, plus a small sample of titles
- [ ] Turn the CRUD into `titles` and `users` API modules with validation
- [ ] Creator title endpoints: create (→ `PENDING`), edit/delete own; editing an `APPROVED` title resets it to `PENDING`; store `rejection_reason` on `titles`

## 3. Authentication & RBAC (RA, Week 7–8)

- [ ] `POST /auth/register`: validate email and password strength, hash with bcrypt (cost ≥ 12), default role `CONSUMER`
- [ ] `POST /auth/login`: bcrypt compare, sign a JWT (`sub`, `role`, `exp` = 2h) and set it as an httpOnly, `SameSite=Lax` cookie (`Secure` in prod); return the same generic error for a wrong email or a wrong password
- [ ] `GET /auth/me` (frontend calls it on load to restore the session), `POST /auth/logout` (clears the cookie)
- [ ] `cookie-parser` + CORS with `credentials: true` restricted to the web origin
- [ ] `authenticate` middleware (read the JWT from the cookie, verify it) and `authorize(...roles)` middleware
- [ ] Ownership checks: users edit/delete only their own reviews and comments, creators edit/delete only their own titles (`titles.created_by`), admins override all
- [ ] Comment permission: `CONSUMER` and `CREATOR` can comment and reply; `ADMIN` can delete any comment
- [ ] Rate-limit login/register; keep the JWT secret in env only
- [ ] Tests for every role × protected route

## 4. Admin moderation (RA, Week 11)

- [ ] Delete any review (PostgreSQL header + MongoDB body) or comment, and keep the PostgreSQL aggregates in sync
- [ ] `GET /admin/users` (paginated), `PATCH /admin/users/:id/role`
- [ ] Title approval queue: `GET /admin/titles?status=PENDING`, `PATCH /admin/titles/:id/status` (APPROVED / REJECTED, optional rejection reason)
- [x] Admin pages in the frontend *(with WH)*. UI done against mock data (branch `feat/web-shell`); real endpoints still to be wired

## 5. MongoDB: reviews, comments, trending (HS lead; SJ co-owns trending)

- [ ] Mongoose connection module
- [ ] `ReviewBody` model, `_id` = the PostgreSQL `reviews.id`, with discriminators per media type (movie: runtime, book: chapters, TV: season/episodes). No rating here; the rating lives in PostgreSQL
- [ ] Cross-store write order: insert the PostgreSQL row (transaction) → insert the Mongo body; if the Mongo write fails, delete the PostgreSQL row (compensating delete). Same idea for delete
- [ ] Comment threads, one reply level: embedded in the review vs. a separate `comments` collection with `reviewId` + `parentId` (watch the 16 MB document limit on popular reviews)
- [ ] `TrendingCard` collection (denormalised title + rating + review count + poster) and a refresh job *(HS, SJ support — SJ owns the trending queries in §6)*
- [ ] Indexes: `{titleId, createdAt}`, `{userId}`, `{rating}`
- [ ] Map review-dataset titles to PostgreSQL `title.id` and load the review datasets
- [ ] Review endpoints: list by title, create, update, delete
- [ ] Comment endpoints: list, reply, delete
- [ ] Creator official reply: one per review, only by the creator who owns the title; stored with `isOfficial: true` and returned pinned first
- [ ] Return the author's role with reviews/comments so the UI can show the Creator badge

## 6. Search, filtering, trending queries (SJ, Week 9–10)

- [ ] `GET /titles?q=&type=&genre=&minRating=&year=&sort=&page=` (returns `APPROVED` titles only)
- [ ] Text search: `ILIKE` first, then `pg_trgm` or full-text search if it is too slow on 950k rows
- [ ] Trending/popular aggregate queries (e.g. rating weighted by review count, recent time window)
- [ ] Run `EXPLAIN ANALYZE` on every heavy query and add indexes; record before/after numbers for the report
- [ ] Pagination everywhere (no unbounded queries)
- [ ] `GET /creator/stats`: avg rating, review count and list adds per title the creator owns

## 7. Personal lists (JW backend + WH UI; RA support on the transaction) — now assigned

- [ ] Status per entry: `COMPLETED`, `IN_PROGRESS`, `PLAN_TO`, filterable by media type *(JW)*
- [ ] `GET/POST/PATCH/DELETE /me/lists` *(JW)*
- [ ] Wrap list updates in a transaction (the report promises ACID for list updates) *(JW, RA support — overlaps auth/ownership checks)*
- [x] My Lists UI page *(WH — see §8)*. UI done against mock data; waiting on JW's `/me/lists`

## 8. Frontend (WH lead; SJ co-owns the data-heavy pages — rebalanced from solo)

- [x] Browse and search page connected to the backend
- [x] Router, layout, typed API client, `AuthContext`, protected routes *(WH)*. Done; `AuthContext` calls the real `/auth/*` once RA ships them
- [x] Login and register pages *(WH)*. Done; the password rule (8+ characters, a letter and a digit) is client-side only, RA to confirm it matches the API
- [ ] Home page with trending cards *(SJ — consumes SJ's own trending queries from §6)*. WH built the layout (hero, poster strip, Movies/TV/Books rails) on the titles API; swap in SJ's trending data
- [ ] Browse page filters (type, genre, rating) and pagination *(SJ — consumes SJ's own search/filter API from §6)*. WH built the shell: `?q`, `?type`, `?page` in the URL, type pills and pagination, plus the nav search with quick matches. Genre and rating filters are still SJ's, and the real `GET /titles?q=&type=&page=` needs wiring
- [x] Title detail page: info, reviews, comment threads *(WH)*. Done against mock data; waiting on HS's review and comment shapes
- [ ] Write/edit/delete review form (media-specific fields) *(WH)*. Write and delete are done; **edit is not built** (needs an update call in the API plan)
- [x] My Lists page *(WH)*. Done against mock data (status tabs, media filter, move/remove with rollback)
- [x] Role-based controls (hide or disable actions the role cannot perform; the backend still enforces them) *(WH)*. Done: nav links, route guards, delete buttons, own-role select
- [ ] Creator upload flow *(UI done against mock data, including the edit-resubmits warning; waiting on JW's endpoints)*: create, edit and delete own titles; "My submissions" list showing PENDING / APPROVED / REJECTED + rejection reason; warn that editing an approved title re-submits it *(WH UI + JW backend — Week 11; JW now owns the backend)*
- [ ] Creator stats page; pinned official-reply UI on own titles; Creator badge on reviews/comments *(WH)*. Stats page, Creator badge and pin-first display are done; **a creator cannot yet post the official reply** (UI not built)
- [x] API client sends cookies (`credentials: 'include'`); on 401 clear `AuthContext` and redirect to login *(WH)*. Done; forms keep their drafts when a 401 arrives
- [ ] Admin dashboard: users/roles, title approval queue, review/comment moderation *(WH UI + RA endpoints — Week 11)*. WH UI done against mock data; RA's endpoints still to build and wire
- [ ] Loading, empty and error states; keyboard/a11y pass *(WH)*. States and automated a11y checks are done; a manual keyboard-only pass on a real browser is still to do

## 9. Performance & SQL vs NoSQL comparison (SJ lead; HS co-owns the Mongo side, Week 12)

- [ ] Define scenarios: fetch reviews for a title, top-N trending, insert a review, nested comment read, filtered browse
- [ ] Benchmark scripts that run the same workload against PostgreSQL and MongoDB
- [ ] Load-test the API (e.g. autocannon or k6)
- [ ] Tables and charts for the final report

## 10. Testing & quality (ALL, ongoing)

- [ ] Unit tests for services; integration tests (Supertest) against test DBs
- [ ] Each owner covers their own module; CI must pass before merge

## 11. Final deliverables (ALL, Week 13)

- [ ] Final report: each member writes up their own component
- [ ] Updated ER diagram + architecture diagram
- [ ] Slides
- [ ] Video presentation and demo script
- [ ] README with setup steps (docker compose → migrate → seed → run)
