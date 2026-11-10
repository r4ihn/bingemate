# BingeMate: Team Task List

Source: Group 29 INF2003 Progress Report (30 Sep 2026) + agreed tech stack
(React + TS frontend, Node.js + TS backend, PostgreSQL/Prisma, MongoDB, bcrypt, JWT, email & password).

Owners: **RA** Raihan · **JW** Jason · **HS** Hu Shi Yao · **WH** Winthrop · **SJ** Shang Jay · **ALL** whole team

- `[x]` = done and on `main` (or done before the repo existed, per the progress report)
- `[~]` = built and tested on a branch or open PR, waiting to merge (see "Where the work is")
- `[ ]` = not done

Last checked on 10 Nov 2026. `main` ends at PR #32 (commit `b42aa49`). No pull requests are open.

---

## Where the work is (9 Nov 2026)

Everything is on `main`. Merged since the last update of this file:

| PR  | Merged | Contents                                                                                                                                                         |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #17 | 4 Nov  | Per-media-type details tables, posters                                                                                                                           |
| #18 | 4 Nov  | A review is a star rating and text for every media type                                                                                                          |
| #19 | 4 Nov  | Website writes on the real API, creator upload and admin approval, and the code-review fixes                                                                     |
| #20 | 4 Nov  | Rank view, aggregation pipelines, indexes, benchmarks, real-database tests and CI job, single trending scheduler, Browse and Home wiring, manual, demo, diagrams |
| #23 | 4 Nov  | Members replace consumers and creators (migration `members_and_usernames`), and signup collects a unique username                                                |
| #25 | 5 Nov  | Profile page and `users` module: view the account, change username and password (`/api/users/me`)                                                                |
| #26 | 5 Nov  | `npm run up`: one command from a fresh clone to a running app; database ports picked per machine                                                                 |
| #27 | 5 Nov  | Admin users, role changes and the review moderation list (API and web); nothing in the web client is mock-only any more                                          |
| #28 | 9 Nov  | Database triggers keep `Title.avgRating` / `reviewCount` in sync (migration `rating_triggers`)                                                                   |
| #29 | 9 Nov  | People pages, cast and crew on title pages, and degrees of separation between people (recursive CTE)                                                             |
| #30 | 9 Nov  | Dead and missing posters replaced from TMDB; the landing-page hero shows the poster                                                                              |
| #31 | 9 Nov  | Title trailers from TMDB (migration `title_trailer`), playable from the hero                                                                                     |
| #32 | 9 Nov  | Markdown docs synced with `main` at PR #31                                                                                                                       |

Nine migrations are on `main`, the last being `20261105130000_title_trailer`.

Local clean-up: these branches are squash-merged and can be deleted: `feat/admin-endpoints`, `feat/db-load`, `feat/degrees-of-separation`, `feat/rating-triggers`, `feat/title-details`, `feat/title-trailers`, `feat/web-shell`, `fix/tmdb-posters`, `resolve/pr-25`. Also `wip/all-changes-snapshot`, `backup/pre-rebase/*`, `backup/pre-review-fixes/*` and `demo/live-test` if they are still there.

---

## 0. Decisions to lock before coding (ALL, Week 6)

- [x] **Where reviews live: split (option B).** PostgreSQL `reviews` holds the header row (`id`, `user_id`, `title_id`, `rating`, `created_at`, `updated_at`), so ratings and aggregates get ACID and FKs. MongoDB holds the review text and the replies, keyed by the same `id`. A review is a star rating and text, the same for every media type (WH, 2026-11-02).
- [x] **Member privileges.** All members create titles and edit/delete **only their own** titles; admins can delete any title but do not submit or edit submissions.
  - [x] Extras locked: (a) submission status + rejection reason, (b) stats per own title, (c) editing an approved title sends it back to `PENDING`, (d) ~~one pinned official reply per review~~ dropped by WH on 2026-10-27: a member replies like anyone else, (e) "Creator" badge beside the name on the creator's own reviews/replies, only on titles they created.
- [x] **Member-submitted titles.** Saved as `PENDING`; hidden from browse/search until an admin sets them to `APPROVED` (or `REJECTED`).
  - [x] **Decided by WH on 2026-11-02: keep the approval process.** A member's title is saved `PENDING` and stays hidden until an admin approves it. The 29 Oct proposal to drop it is not taken. The creator and admin halves are merged (PR #19; see §2, §4, §8)
- [x] **Replies, not comments (WH, 2026-10-27).** Nobody comments on a review. Anyone signed in except an admin, including the review's author, can reply under it. Replies are one flat list per review, oldest first, with no replies to replies and no `@name` for now. Admins can delete any reply.
- [x] **JWT strategy.** One access token (2h) in an httpOnly cookie (`Secure` in prod, `SameSite=Lax`), no refresh tokens. Logout clears the cookie; on expiry the user logs in again.
- [x] **Libraries.** Express, Mongoose, Vite, Zod, Vitest/Jest + Supertest.
- [x] **Dev dataset size.** A subset of the 950k films for local dev; the full set for benchmarking only.
- [x] **Git workflow.** Monorepo, feature branches (`feat/…`, `fix/…`), merge to `main` through a PR with **no approval required**; direct pushes to `main` are blocked (branch protection). CI must pass before merge.
- [x] **Title images (WH, 29 Oct).** Optional. Stored in MongoDB (one document per title, keyed by the title id) and served by the API; `titles.posterUrl` points at it. JPEG, PNG or WebP only (SVG can carry scripts), 1 MB, checked by the file's bytes. The browser shrinks the image to 600 px wide before upload. The dataset has no images, so imported titles keep the colour placeholder. Merged in PR #11

- [x] **D10 — Members (3 Nov 2026).** One `MEMBER` role for all non-admin accounts; visitors browse and admins moderate. Creator remains the page/link name.
- [x] **D11 — Unique usernames (3 Nov 2026).** Required at signup; shared NFKC, character, script-mixing and reserved-name checks; unique index on `lower("username")`; legacy collisions suffixed. Migration `20261103140000_members_and_usernames`; tests: see the PR. Reserved names are also refused when written with mapped Cyrillic, Greek, small-capital or leetspeak lookalikes; a lookalike of another member's username is not detected (`docs/api.md`, "Username rules").
- [x] **D12 — Pending cap (3 Nov 2026).** At most 10 PENDING titles on creation per member, under an advisory transaction lock. Edits do not count against the cap; exact 409 message in §4. Tests: see the PR.

## 1. Project setup (Week 6)

- [x] Create the monorepo scaffold (`apps/web`, `apps/api`, `packages/shared`). See `ARCHITECTURE.md`. _(RA)_
- [x] `docker-compose.yml` for PostgreSQL + MongoDB so everyone runs identical local DBs _(RA)_
- [x] Shared `tsconfig.base.json`, ESLint, Prettier _(RA)_
- [x] `.env.example` for `apps/api` and `apps/web`; add `.env` and `data/raw/` to `.gitignore` _(RA)_
- [x] CI (GitHub Actions or similar): lint, typecheck and test on every PR _(RA)_
- [x] Branch protection on `main`: require a PR and passing CI, 0 approvals, no direct pushes _(RA)_
- [x] Dev seed uses a dataset subset; full load only for benchmarks _(JW)_. The cleaned dev set is 1,500 titles (500 movies, 500 books, 500 TV shows) with 13,490 reviews, loaded by `data/etl/load-all.ts`. Skip `prisma/seed.ts`: the load already holds the admin and member accounts. The full 950k set is for SJ's benchmarks only
- [ ] Move the existing prototype code (Titles/Users CRUD, browse page) into the new structure _(JW, WH)_. Most of it has been rebuilt in `modules/titles` and the web app; check whether anything in the prototype is still needed, then close this
- [x] `npm run dev` for the API exits with "Invalid environment variables": nothing loads `apps/api/.env` (Prisma reads it, the API does not). Load it in the `dev` script, e.g. `tsx watch --env-file=.env src/server.ts` (Node 20.6+), so everyone can start the API _(RA)_. Fixed in PR #8
- [x] README: quick start (`npm run up`, PR #26), manual setup, the run-on-real-data steps and how to view the databases (Prisma Studio, `psql`, `mongosh`; "Look at the databases") are in `README.md` _(WH)_

## 2. Data & relational schema (JW, Week 6)

- [x] Download datasets and load them into PostgreSQL and MongoDB
- [x] Initial ER diagram (Users, Titles, Genres, Reviews, Lists, junction tables)
- [x] Basic CRUD for Titles and Users in PostgreSQL
- [ ] Finalise the ER diagram: `users`, `titles` (with `media_type` MOVIE/BOOK/TV_SHOW, `status` PENDING/APPROVED/REJECTED, `created_by` → users), `genres`, `title_genres`, `people`, `title_people` (role: author/director/actor/showrunner), `list_entries`, `reviews` (header row only). All of these tables are in `schema.prisma`; the Eraser diagrams were updated on 27 Oct for the load schema changes (`WRITER`, `username`, `description`, the rating CHECK; links in `docs/eraser-diagrams.md`). Still to draw: the SQL views, the MongoDB `replies` and `titleposters` collections, and `status` if Part A (§0) changes it
- [x] Write `prisma/schema.prisma` and generate the first migration. Merged to `main` in PR #5 as `20261027075529_initial_bingemate` (JW's local `20261019011516_...` was never committed: drop it, then run `prisma migrate dev`)
- [x] Constraints: unique email, FKs with explicit `onDelete`, unique `(user_id, title_id)` on `list_entries` and on `reviews` (one review per user per title), `CHECK` on the rating range. The `CHECK (rating BETWEEN 1 AND 5)` is in migration `20261027075538_rating_check_and_views`
- [x] Indexes for browse/search: `titles(media_type)`, `titles(name)`, `titles(status)`, `title_genres(genre_id)`, `titles(avg_rating)`, `reviews(title_id)`, plus `list_entries(title_id)` and `titles(created_by)` (PR #5, for `/creator/stats` and delete cascades)
- [x] Rating aggregates (`avg_rating`, `review_count` on `titles`) recomputed in the same transaction as a `reviews` insert/update/delete. Since PR #28 three statement-level triggers on `Review` (migration `20261105120000_rating_triggers`) do the recompute from the `title_rating_stats` view, so cascaded deletes, bulk loads and manual SQL keep the totals right too; the API still locks the title row first (`SELECT … FOR UPDATE`) so two reviews saved at once cannot leave a wrong total. Real-database tests: `tests/real/ratingTriggers.real.ts`
- [x] Imported dataset titles get `status = APPROVED` and `created_by = NULL` (`data/etl/load-postgres.ts`)
- [x] Undated imported reviews (PR #9). 947 TV reviews have no date (965 before duplicates are dropped). They were loaded with the load time, so they sorted above every real review as "today". Both loaders now give them a made-up date between 1 Jan 2022 and 31 Dec 2025 (`undatedReviewDate` in `data/etl/lib/dates.ts`), hashed from the dataset review id so both stores agree and a reload gives the same dates; `verify-load` checks every one in both stores. These are not real dates (the ETL README says so). Reload with `npx tsx data/etl/load-all.ts --reset` if your local data predates the merge _(JW/HS)_ A database loaded before PR #9 can be repaired without a reload with `data/etl/backfill-undated-dates.ts` (a dry run by default; `--apply` writes; only rows still on 1900-01-01 are touched).
- [x] ETL scripts: clean nulls/duplicates, normalise genre names across the three datasets, dedupe people, keep a dataset-ID → DB-ID mapping. See `data/etl/README.md` (cleaners, loaders for PostgreSQL and MongoDB, `id-map.json`, verifiers)
- [x] `prisma/seed.ts`: one admin and two ordinary members, plus a small sample of titles (3 approved + 1 pending member title)
- [ ] Turn the CRUD into `titles` and `users` API modules with validation
  - [x] `modules/titles` (PR #7): `GET /api/titles/:id` returns genres, people and `createdById`; pending, rejected and missing titles all answer 404, so hidden titles do not leak
  - [x] The `users` module (PR #25): `GET /api/users/me`, `PATCH /api/users/me` (username, same rules as signup) and `PATCH /api/users/me/password` (current password required, 10 per 15 minutes). Both changes re-issue the cookie. Every route needs a signed-in user
- [x] Member title endpoints (Creator page) (PR #19): `POST /api/titles` (MEMBER, saved `PENDING`), `PATCH /api/titles/:id` (owner only; name and description; an `APPROVED` or `REJECTED` title goes back to `PENDING` and the reason is cleared; the media type cannot change), `DELETE /api/titles/:id` (owner or admin; also removes the review bodies, replies and image from MongoDB), `GET /api/creator/titles` (own titles, every status). Checked on the real stack. A member can delete their own title only while no other user has reviewed or listed it (otherwise 409, ask an admin); an admin can delete any title. Decided 2026-11-02 so a member cannot wipe other users' reviews and lists _(JW)_
- [x] Title image endpoints (PR #11): `PUT`, `GET` and `DELETE /api/titles/:id/poster`. Only the member who made the title or an admin can change it; 30 uploads per 15 minutes. The image URL carries `?v=<version>` taken from the stored document, so two uploads at once cannot leave the wrong version behind, and only a request for the current version is cached for a year
- [x] Where do runtime and publisher live? In `MovieDetails`, `TvDetails` and `BookDetails` (PostgreSQL), one optional row per title, type enforced by a composite foreign key (PR #17). The title page shows runtime, seasons, rating and publisher. Book `price` is not stored (23% filled). Studio and country are not in the dataset, and the UI hides them when empty

## 3. Authentication & RBAC (RA, Week 7–8)

- [x] `POST /auth/register`: validate email and password strength, hash with bcrypt (cost ≥ 12), default role `MEMBER`. Done in `modules/auth` (PR #8); the password rule (8+ characters, a letter and a digit) matches the web client
  - [x] Signup collects a required unique username using the shared NFKC validator and case-insensitive expression index; migration `20261103140000_members_and_usernames` repairs collisions with suffixes. JWT and auth responses carry username; nullable legacy names retain `user-xxxxxx`. API and web tests: see the PR
- [x] `POST /auth/login`: bcrypt compare, sign a JWT (`sub`, `role`, `username`, `exp` = 2h) and set it as an httpOnly, `SameSite=Lax` cookie (`Secure` in prod); return the same generic error for a wrong email or a wrong password. Done; the JWT also carries `email`
- [x] `GET /auth/me` (frontend calls it on load to restore the session), `POST /auth/logout` (clears the cookie)
- [ ] Keep one async route wrapper: PR #8 added `utils/asyncHandler.ts`, and the review, reply, list and image modules use `utils/asyncRoute.ts` (`route()`), which does the same job _(RA, WH)_
- [x] `cookie-parser` + CORS with `credentials: true` restricted to the web origin (`app.ts`, origin from `WEB_ORIGIN`)
- [x] `authenticate` middleware (read the JWT from the cookie, verify it) and `authorize(...roles)` middleware
  - [x] Bug: an expired or invalid token makes `jwt.verify` throw, which `errorHandler` turns into a **500**. Catch JWT errors and return 401. Fixed in `authenticate.ts` (PR #8)
  - [x] Bug: malformed JSON / oversized bodies gave **500**. Fixed by parser type: malformed JSON → 400, oversized JSON → 413, unsupported encoding/charset or aborted request → 400, all with fixed `{error}` responses. Regression tests added; API Supertest execution remains pending outside the sandbox (listen EPERM)
- [x] Ownership checks: members edit/delete only their own reviews and replies and their own titles (`titles.created_by`); admins delete any review, reply or title but never write reviews/replies or submit titles
  - [x] Reviews, replies, lists and title images already enforce their own rules inside their services (see §5, §7, §2), tested per role. Title ownership is enforced; admin user management is built (§4)
- [x] Reply permission: `MEMBER` can reply to a review; `ADMIN` can delete any reply but never writes one. Enforced in the reply endpoints (§5)
- [x] Rate-limit login/register; keep the JWT secret in env only. `authLimiter` is applied to both routes; `JWT_SECRET` is env-only (Zod-validated)
- [x] Tests for every role × protected route. Auth routes and `authorize` (every role) are covered (PR #8); the review, reply, list and image endpoints have them too, using real signed cookies. Member title writes, admin refusal and approval routes, the admin users and moderation routes (PR #27) and the profile routes (PR #25) are covered

- [x] Role merge: all former non-admin accounts are `MEMBER`, including both historical demo emails. Migration `20261103140000_members_and_usernames`; legacy JWT role mapping, shared validator, API/web/ETL/seed changes and tests: see the PR.

## 4. Admin moderation (RA, Week 11)

Admins are separate from members: no title submission and no reviews or replies. All members see **Creator**. A member may have at most 10 `PENDING` titles at once. Creating an eleventh returns HTTP 409: **You already have 10 titles waiting for approval. Wait for an admin to decide on some of them.** Edits do not count against this cap.

- [x] Delete any review (PostgreSQL header + MongoDB body) or reply, and keep the PostgreSQL aggregates in sync. `DELETE /reviews/:id` and `DELETE /replies/:id` accept an admin (§5)
- [x] `GET /admin/reviews` (PR #27): every review across all titles, any title status, newest first, paginated, with the title name and MongoDB body for the Moderation page. Its Delete button uses `DELETE /reviews/:id`. Checked on the real databases (`tests/real/admin.real.ts`)
- [x] `GET /admin/users` (paginated, newest first) and `PATCH /admin/users/:id/role` (PR #27): `Paginated<{ id, email, role }>` and the updated user back; an admin cannot change their own role (400), unknown id 404; a new role takes effect at the user's next login (the old JWT keeps its role for up to 2h). Checked on the real databases
- [x] Title approval queue (PR #19): `GET /api/admin/titles?status=PENDING` (paginated, oldest first) and `PATCH /api/admin/titles/:id/status` (`APPROVED` or `REJECTED` with an optional reason that is kept only for `REJECTED`). ADMIN only. Checked on the real stack
- [x] Admin pages in the frontend _(with WH)_. UI from PR #3; Users and Moderation call the real endpoints (PR #27)

## 5. MongoDB: reviews, replies, trending (HS lead; SJ co-owns trending)

The review, reply and trending items in this section were merged in PRs #10 to #12, tested with mocked stores in CI and run against the real local databases. The aggregation pipelines (Task 8) were merged in PR #20.

- [x] Mongoose connection module (`db/mongo.ts`)
- [x] `ReviewBody` model, `_id` = the PostgreSQL `reviews.id`, with one shape for all media types: a plain `mediaType` copy (so a Mongo pipeline can group by type without a cross-store join), and `body` text. No rating here; the rating lives in PostgreSQL
  - [x] Decided by WH on 2026-11-02, merged in PR #18: **a review is only a star rating and text, for every media type.** The media-specific review fields (runtime watched, chapters read, season, episodes) are gone from the form, the API (`fields` is now refused with 400), the shared types, the web client and the mocks, and the per-type discriminators are gone from the model. No stored data moved: none of the 13,490 imported bodies had those fields. Title facts (runtime, seasons, publisher) are in PostgreSQL `MovieDetails`, `TvDetails`, `BookDetails`
  - [x] Decided: imported review extras (review year, publication name, summary, helpfulness) removed from the ETL and model on 2026-11-03. A review is only a star rating and text; existing MongoDB data cleanup is run separately.
- [x] Cross-store write order: insert the PostgreSQL row (transaction) → insert the Mongo body; if the Mongo write fails, delete the PostgreSQL row (compensating delete). Edits put the rating back the same way. Deletes go PostgreSQL first, then the Mongo body and replies, because a leftover Mongo document is invisible but a review without its body would show as empty
- [x] Reply storage: a separate collection with `reviewId` (no 16 MB document limit). Renamed from `comment.model.ts` to `reply.model.ts` (collection `replies`); `parentId` and `isOfficial` dropped, `editedAt` added
- [x] `TrendingCard` collection (denormalised title + rating + review count + poster) and a refresh job _(HS, SJ)_ (PR #12). `jobs/refreshTrending.ts` copies the top 50 per media type from the `trending_titles` view, upserts by title, removes cards that dropped out, and is safe to run twice. Run it with `npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts`
  - [x] D2: `server.ts` starts a timer controlled by `TRENDING_REFRESH_MINUTES` (integer 0–1440, default 10; 0 disables it). First tick is after one interval; pending runs are skipped, failures logged, and SIGINT/SIGTERM stop the timer. A separate startup check refreshes only an empty collection. The CLI above remains available. Socket-free timer/startup unit tests pass. **Resolved 3 Nov:** `server.ts` used to start the older `startTrendingRefresh()` from PR #12 as well (every 60 s, ignoring `TRENDING_REFRESH_MINUTES`), so `0` did not switch refreshing off. That scheduler and its test are removed; the configurable timer and the empty-collection startup check are the only triggers now. Load tests were repeated afterwards and agree within 5% _(SJ, HS)_
- [x] Aggregation pipelines (Task 8): public review activity (populated UTC months, default 120, max 240), top reviewers (hidden titles excluded, author roles checked, max 50), and exported `recentReviewCounts(days)` for Task 9. Named builders and exact-stage unit tests added; socket-free checks pass. Supertest tests and live runs against the real databases pass; explain output on 1M reviews is in `docs/benchmarks/explain.md` (top reviewers 3.2 s to 0.8 s with a covering index). See `docs/api.md` _(HS, SJ)_
- [x] Indexes: `{titleId, createdAt}`, `{userId}`, plus two covering indexes added after measuring on 1M reviews: `{titleId, userId}` and `{mediaType, titleId, userId}` (they replace the single-field `titleId` index). `{rating}` was dropped (D3): ratings live in PostgreSQL. A `{createdAt, titleId}` index for recent counts was tried and rejected (1.8x, below the 2x bar; background job only)
- [x] Map review-dataset titles to PostgreSQL `title.id` and load the review datasets (`load-postgres.ts` + `load-mongo-reviews.ts`; the 0 to 10 scores are converted to 1 to 5 stars in `clean-reviews.ts`)
- [x] Review endpoints: `GET /titles/:titleId/reviews` (newest first, tie-break on id, 10 per page, max 50), `POST /titles/:titleId/reviews`, `PATCH /reviews/:id` (owner only), `DELETE /reviews/:id` (owner or admin). Editing a review whose MongoDB body is missing answers 502 and changes nothing, instead of a silent 200
  - [x] Rules enforced: **admins never write** reviews or replies (403, they only delete); **the creator of a title cannot review it** (403) but can reply; one review per user per title (409); only approved titles
- [x] Reply endpoints _(HS)_: `GET /reviews/:reviewId/replies` (oldest first, 50 per page, max 200), `POST /reviews/:reviewId/replies` (not admins), `PATCH /replies/:id` (writer only, never an admin, text not empty, keeps `createdAt`, sets `editedAt` only when the text really changed), `DELETE /replies/:id` (writer or admin). Only under reviews of approved titles
- [x] Creator badge data: the title detail returns `createdById` (PR #7) and every review and reply returns its author's id, name and role. No `isOfficial`, no pinning, no separate reply
  - [x] The replies list endpoint returns oldest first and the UI does not re-sort it
- [x] Return the author's id with reviews/replies (see above). A writer whose account is gone shows as "Deleted user"
- [x] **Rating scale is whole stars, 1 to 5** (decided by WH, 2026-10-18). On `main`: the `CHECK (rating BETWEEN 1 AND 5)`, the ETL conversion (`round(score / 2)`, clamped), and `RATING_MIN`/`RATING_MAX` in `@bingemate/shared`. Since PR #10, the review endpoints validate with the same constants and reject anything else (including half stars and text), and `avgRating` stays on the 1 to 5 scale
- [x] `GET /titles/:titleId/reviews/mine` returns the signed-in user's review of the title, or `null`

## 6. Search, filtering, trending queries (SJ, Week 9–10)

- [x] `GET /titles?q=&type=&genre=&minRating=&year=&sort=&page=&pageSize=` (PR #7; returns `APPROVED` titles only). `sort` is `name` (default), `rating`, `year` or `reviews`, every order ends on `id` so pages are stable; `genre` is a name (case-insensitive) and `year` an exact match. Bad values answer 400
- [x] Review statistics queries: `GET /api/titles/:titleId/review-activity?months=120` and `GET /api/reviews/top-reviewers?type=&limit=10`; Zod-bounded public reads with APPROVED-title filtering. Recent counts helper is integrated into the Task 9 refresh. Supertest tests pass and both endpoints were checked live on the dev data and on the 1M-review benchmark data.
- [ ] Text search: `ILIKE` is in (`q` matches the title name, ~5 ms on the 1,500-title dev set). Measured on 950k synthetic titles: 0.17 ms for a term with many matches, but 95 to 101 ms for a rare term (parallel sequential scan). That is right at the 100 ms line, so `pg_trgm` is a team decision (it needs a database extension); see `docs/benchmarks/explain.md`
- [x] Time-windowed trending (Task 9): the refresh stores `recentReviews` from `recentReviewCounts(1460)` on every card; `GET /api/trending?type=&limit=&sort=score|recent` selects score or recent-count order with deterministic ties. The window is fixed at job time (no `days` query parameter). Old cards and empty review windows read as 0. Socket-free tests pass; Supertest and live-database verification remain pending. The SQL score view still supplies the top 50 candidates per type
- [x] Genre filter options: `GET /api/genres?type=` from the `genre_filter_options` view, most titles first; without a type, the same genre is summed across media types (PR #12)
- [x] Run `EXPLAIN ANALYZE` on every heavy query and add indexes; record before/after numbers for the report. Done on the 1M-review synthetic benchmark database with `benchmarks/explain.ts`; results in `docs/benchmarks/explain.md`. Browse by rating or by reviews: 22 to 52 ms down to under 1 ms with two composite indexes (migration `browse_sort_indexes`). Known and left alone: browse by year (50 ms; Prisma 5.20 cannot declare `NULLS LAST`), the genre options view (about 200 ms), and the pagination `COUNT(*)` (about 25 ms, now the largest part of a browse request)
- [x] Window-function query: `title_rank_in_type`, a materialized view that ranks each reviewed approved title within its media type with `RANK()` and `PERCENT_RANK()`, refreshed concurrently by the trending job. `GET /api/titles/:id` returns `rankInType` and `topPercent` (null when unranked) and the title page shows "#3 in Movies · top 1%". Lookup is a 0.015 ms index scan; refresh takes about 20 ms on the dev set
- [x] Pagination everywhere (no unbounded queries). Titles 20 per page (max 100), reviews 10 (max 50), replies 50 (max 200), lists 12 (max 50), trending up to 50. The genre list is small and returned whole
- [x] `GET /creator/stats`: avg rating, review count and list adds per title the creator owns. MEMBER only, scoped to the signed-in member; a `?creatorId=` in the URL is ignored (PR #12)

## 7. Personal lists (JW backend + WH UI; RA support on the transaction) — now assigned

The list endpoints were merged in PR #10.

- [x] Status per entry: `COMPLETED`, `IN_PROGRESS`, `PLAN_TO`, filterable by media type _(JW)_
- [x] `GET /me/lists` (status and media type filters), `GET /me/lists/by-title/:titleId`, `POST /me/lists`, `PATCH /me/lists/:id`, `DELETE /me/lists/:id` _(JW)_. Every query is scoped to the signed-in user, so someone else's entry answers 404 like a missing one; entries of titles that are no longer approved are left out
- [x] Wrap list updates in a transaction (the report promises ACID for list updates) _(JW, RA support)_. Adding and changing run in a transaction; two taps of "Add" at once answer 409 instead of 500
- [x] My Lists UI page _(WH — see §8)_. UI done against mock data; the endpoints are merged, so it is waiting on the wiring in §8

## 8. Frontend (WH lead; SJ co-owns the data-heavy pages — rebalanced from solo)

- [x] Browse and search page connected to the backend: with `VITE_USE_MOCKS=false` Browse, search, the title page and Home read the real API (checked in a real browser on 3 Nov; `docs/manual-test-checklist.md`)
  - [x] The public reads now call the real API when `VITE_USE_MOCKS=false`: title detail, search/browse, the Home rails, a title's reviews and a review's replies (PR #13). Long reply threads are read page by page, and search text is cut to the 100 characters the API accepts
  - [x] Writes wired (PR #19): write/edit/delete review, the user's own review (`/mine`), replies, My Lists and creator stats, each with fetch-stubbed tests, and the client shows the API's error text. Creator title forms (create, edit, delete, then `PUT` the image) and admin approval use the real API, and admin Users and Moderation followed in PR #27. The review, reply, list, creator and approval flows were clicked through in a browser on 3 Nov (`docs/manual-test-checklist.md`) _(WH)_
- [x] Router, layout, typed API client, `AuthContext`, protected routes _(WH)_. Done
  - [x] Sign-in, register, `me` and logout call the real `/auth/*` (the client uses `apiFetch`, no mock switch). Sign-in was used for all three accounts in the 3 Nov browser run _(WH)_
- [x] Login and register pages _(WH)_. Done; the password rule (8+ characters, a letter and a digit) matches the API (RA confirmed in PR #8)
- [x] Home page with trending cards _(SJ)_: the "Trending now" strip reads `GET /api/trending` and falls back to the name-ordered titles when trending is empty or fails (#20). The large title at the top of Home is still the first approved title by name, not a trending one; since PR #30 and #31 it shows the real poster over a blurred copy, and a play button when the title has a trailer
- [~] Browse page filters (type, genre, rating) and pagination _(SJ)_: type pills, a Genre select (from `GET /api/genres`), a Sort select (Name, Top rated, Newest, Most reviewed) and pagination are done, all kept in the URL (#20). Still missing: a minimum-rating control and an exact-year control (the API accepts `minRating` and `year`)
- [x] Title detail page: info, reviews, replies _(WH)_. Reads real data since PR #13. Country and studio are optional and hidden when empty; runtime, seasons and publisher come from the details tables (PR #17). Cast and crew link to person pages (PR #29), and a trailer plays from the hero (PR #31)
- [x] Person page `/people/:id` (PR #29): the person's credits, newest first, and a "How are they connected?" finder that shows the shortest chain of shared approved titles to anyone else (`GET /api/people/:id/connection/:otherId`, a breadth-first recursive CTE, median 63 to 157 ms over 12,758 people; `benchmarks/people-connection.ts`)
- [x] Profile page `/me/profile` (PR #25): account details, list counts, change username and change password, with the shared validation rules
- [x] Write/edit/delete review form (star rating and text only, the same for every media type) _(WH)_. Write, edit and delete are done against mock data. Review text keeps its line breaks, wraps long strings and folds past 600 characters behind Read more. Edit is also available in place on the card. The rules the API enforces are listed in §5
- [x] My Lists page _(WH)_. Done against mock data (status tabs, media filter, move/remove with rollback)
- [x] Replies UI _(WH)_. Done against mock data: one flat list per review, one action row (Reply with a count, Edit, Delete) on every review and reply, writer-only edit with an "edited" mark, relative dates, a "You" marker, threads over 3 replies fold to 2
- [x] Site-styled `Dropdown` (combobox + listbox) replaces the native select for list status on the title page and My Lists _(WH)_. The role picker in the admin table and the media type in the submission form are still native selects
- [x] Role-based controls (hide or disable actions the role cannot perform; the backend still enforces them) _(WH)_. Done: nav links, route guards, delete buttons, own-role select
- [x] Creator upload flow: create, edit (media type is fixed once created), "My submissions" with status and rejection reason, and the optional image (the title is `POST`ed, then the image is `PUT`) go through the real API (PR #19), with the "edit re-submits" warning kept. If only the image fails, the creator is told the title was saved. Clicked through in a browser on 3 Nov. Delete is available on every submission and approved-title stats row, with inline Confirm / Cancel; success refreshes the rows, and a server error (including 409 for other users’ reviews/lists) keeps the title and shows the message. Covered by mock UI and real-mode fetch-stub tests _(WH)_
  - [x] Optional poster image on the new and edit forms (PR #11): preview, Remove image (a first press drops a new pick and keeps the current image; a second removes the current one), a message for the wrong type or a file over 8 MB, and the form waits while the image is shrunk. A slower earlier pick can no longer replace a later one
- [x] Creator stats page; Creator badge on the creator's own reviews/replies _(WH)_. Done against mock data. The badge is by title ownership, not by role
- [x] API client sends cookies (`credentials: 'include'`); on 401 clear `AuthContext` and redirect to login _(WH)_. Done; forms keep their drafts when a 401 arrives
- [x] Admin dashboard: users/roles, title approval queue, review/reply moderation _(WH UI + RA endpoints, Week 11)_. All three screens use the real API (PR #19, PR #27). The approval queue was run in a real browser on 3 Nov (approve, reject with a reason, stale-version message); Users and Moderation have real-database and fetch-stub tests but have not been clicked through in a browser yet
- [ ] Loading, empty and error states; keyboard/a11y pass _(WH)_. States and automated a11y checks are done, focus returns to the right button after edit, reply and the dropdown, and the code-level audit is done. A manual keyboard-only pass on a real browser is still to do (the browser tool needs Chrome remote debugging switched on)
- [ ] **Phone layout, one site-wide pass (parked by WH, 2026-10-27).** Aim for no sideways scroll at 320 CSS px (WCAG reflow) _(WH)_. PR #6 resizes the header dock (smaller logo, 46px buttons and tighter gaps below `sm`) and the title overview (104px poster, long titles break). Both were sized by hand and have not been seen on a device. Still to do: check those two at 320px in a real browser, then the Home strip and rails (fixed widths) and every other page

## 9. Performance & SQL vs NoSQL comparison (SJ lead; HS co-owns the Mongo side, Week 12)

- [x] Define scenarios: fetch reviews for a title, top-N trending, insert a review, read the replies of a review (flat), filtered browse. The flat replies read came out as a tie between the stores, so it does not by itself make the case for MongoDB; see the conclusions in `docs/benchmarks/results.md`
- [x] Benchmark scripts that run the same workload against PostgreSQL and MongoDB: `benchmarks/run.ts` and five scenarios, on a separate `bingemate_bench` database seeded by `benchmarks/seed-bench.ts` with synthetic data (no 950k-title source exists). Three full runs recorded; the 15% repeatability target was missed on sub-millisecond rows and that is stated in the results
- [x] Load-test the API: autocannon@7.15.0, 20 connections for 15 s on three endpoints, zero non-2xx replies (trending 1,960 req/s, reviews 1,194, browse 496; run twice, within 5%)
- [ ] Tables and charts for the final report: tables are in `docs/benchmarks/results.md` and `docs/benchmarks/explain.md`; charts are not made yet

## 10. Testing & quality (ALL, ongoing)

- [ ] Unit tests for services; integration tests (Supertest) against test DBs
  - [x] Every new endpoint has Supertest tests with Prisma and MongoDB replaced by stubs (CI has no database), and each permission rule was checked by breaking it on purpose and watching a test fail. Each module was also run by hand against the real local databases
  - [x] Real-database tests: `npm run test:real --workspace apps/api` runs 39 tests in 9 files with no stubs (14 when this item was first done; PRs #23 to #31 added the members and usernames, rating trigger, people and trailer files) against `bingemate_test` (views and their rounding, the trending and rank views, the two-store review lifecycle with a shared id, moderation with the `updatedAt` check, creator and admin delete cleanup, and a real concurrent delete-versus-list race). They pass locally, three runs in a row, and each was checked by breaking the code on purpose (removing the row lock fails the race test on every run). `.github/workflows/ci.yml` has a new `verify-real-db` job with `postgres:16-alpine` and `mongo:7` services; the existing job is unchanged and `npm test` stays stubbed. **It ran green on GitHub on 3 Nov 2026** (draft PR #21 into `main`: all six migrations applied to a fresh PostgreSQL service and the 14 tests passed) _(RA, ALL)_
- [ ] Each owner covers their own module; CI must pass before merge
- [~] `prettier --check`: `seed.ts` and `pagination.ts` are formatted and so are the files added in #20; about ten older files on `main` still fail it. CI does not run prettier. Decide whether CI should check formatting, and if yes format those files first

## 11. Final deliverables (ALL, Week 13)

- [x] Signup username and role merge documentation and browser-script additions: migration `20261103140000_members_and_usernames`; tests at that point: 690 API (stubbed), 543 web, 18 real-database (on 10 Nov 2026: 755 API, 579 web, 39 real-database); browser script 30 of 30 (`docs/manual-test-checklist.md`). New browser steps await a run.
- [ ] Final report: each member writes up their own component
- [~] Updated ER diagram + architecture diagram. `docs/architecture.svg` is redrawn from the code (per-route middleware, the cross-store review write, the trending refresh, the rank view, tooling) and `ARCHITECTURE.md` matches. The Eraser ER and MongoDB diagrams are still stale (no `title_rank_in_type`, the two new `Title` indexes, the two new `ReviewBody` indexes, or the new review body shape). `docs/eraser-diagrams.md` holds anyone-can-edit Eraser links, so decide whether to keep it in the repo _(WH)_
- [~] User manual (the project spec asks for one with the submission): drafted in `docs/user-manual.md`, checked against the source on 9 Nov (PR #31). The creator, admin and reader flows were walked through in a real browser (`docs/manual-test-checklist.md`); the setup commands were not run from a fresh clone. Each member should read their part _(ALL)_
- [ ] Slides
- [~] Video presentation and demo script: the 9.5-minute script with one timed segment per member is in `docs/demo-script.md`; it has not been rehearsed and the video is not recorded
- [~] Report: the 10-page outline with page budgets, authors and evidence is in `docs/report-outline.md`; nobody has written their section yet
- [x] Web gaps that affected the demo (found and fixed 3 Nov): Browse now has a **Genre** select (from `GET /api/genres`) and a **Sort** select (Name, Top rated, Newest, Most reviewed), both kept in the URL and sent to `GET /api/titles`; Home's "Trending now" strip reads `GET /api/trending` and falls back to the name-ordered titles if trending is empty or fails. 22 new web tests; checked in a real browser at 1280 px and 320 px (no horizontal overflow) _(WH)_
- [x] Real-browser click-through of the member submission, admin and member reading flows (Playwright, headless Chromium, isolated profile): 24 of 24 steps passed, each run deleting what it created. Results, screenshots, what was not covered and how to re-run it: `docs/manual-test-checklist.md`, `docs/e2e/`. Not covered: keyboard-only use, screen readers, Safari/Firefox, the phone layout of the creator and admin screens _(WH)_
- [x] README with setup steps: `npm run up` (PR #26) or the manual docker compose → migrate → seed → run. Database ports are picked per machine and saved in the root `.env`. See the README item in §1

## 12. Known gaps and follow-ups (found in code review, 29–30 Oct)

Fixed on 30 Oct (merged in PRs #10 to #13): stored ratings now come from the `title_rating_stats` view, so they round exactly like it (JS rounding stored 1.02 for 41 stars over 40 reviews, the view 1.03); a failed review edit undoes its rating only if no other edit has saved since; deleting a review clears its replies even when the body delete fails; the creator form drops an image still being prepared when it closes.

- [x] **500 on malformed JSON** — fixed on 3 Nov: parser errors return fixed 400/413 JSON responses; unknown routes return 404 `{error: 'Not found'}`. Unexpected errors still log `Unhandled error:` and return only 500 `{error: 'InternalServerError'}`. Regression tests added; API Supertest execution remains pending outside the sandbox (listen EPERM) _(WH)_

- [~] **A reply posted while its review is being deleted can be left behind.** The reply check passes, the review and its replies are deleted, then the reply is saved. `cleanupOrphans` covers this race by removing Mongo review bodies and replies whose PostgreSQL review is gone, in bounded batches. Run manually from the repo root: `npx tsx --env-file=apps/api/.env apps/api/src/jobs/cleanupOrphans.ts`. Unit tests use stubbed stores; real-database verification is pending. The job is not scheduled automatically _(HS)_

- [~] **Deleting a title leaves nothing behind in MongoDB** now (review bodies, replies and the image are removed after the PostgreSQL delete, and a MongoDB failure is logged without failing the delete). There is still no user delete. When one is built it must remove the user's MongoDB review bodies and replies (the rating triggers from PR #28 already keep title totals right on the PostgreSQL cascade) _(RA)_. The trending read now drops cards whose title is no longer approved, so a deleted, rejected or re-submitted title stops showing there at once
- [x] **A member can change the image of an approved title with no re-moderation**: done on `main` (PR #11). A member's image replacement sends an approved title back to `PENDING` before the stored bytes are overwritten, so the old public URL never serves an unreviewed image. Removing the image does not re-moderate, since nothing unreviewed is published _(WH, JW)_
- [x] **The owner cannot see the image of their own pending title**: done on `main` (PR #11). The owner and admins can fetch it; everyone else gets the same 404 as for a missing image _(WH)_
- [x] **An empty `trending_titles` view keeps existing cards.** The refresh job warns and returns `{upserted: 0, removed: 0}` without writes or deletion. Socket-free unit and existing job tests pass; non-empty upserts and stale-card deletion are unchanged. Live-database verification remains pending _(SJ)_
- [ ] Some pagination validation remains repeated across modules, and `titles.routes.ts` still uses try/catch instead of the `route()` helper. The admin-cannot-write check is shared in `utils/assertCanWrite.ts`, and the trending job now joins poster URLs in its ranking SQL. Tidy once the modules have merged _(WH)_
- [ ] **Found by the 3 Nov code review of `feat/remaining-work`, in code already on `main` and not changed here:**
  - Poster replace (`posters.service.ts`, PR #11): it sets the title to PENDING, then overwrites the image and updates `posterUrl` in separate steps, and the last update does not re-check the status. An admin approval landing in that short window would publish the new image unreviewed. Holding the title row lock (`lockTitle`) across the whole replace would close it _(JW, WH)_
  - Replies (`replies.service.ts`, PR #10): `updateReply` and `deleteReply` do not check that the parent review's title is APPROVED, although the reads and `createReply` treat such reviews as absent _(HS)_
  - Genres (`genres.service.ts`, PR #12): the merge `Map` and sort re-aggregate rows that are already unique per genre, and the type-less SQL repeats the view's `HAVING COUNT(*) >= 5`, which can drift from the view _(SJ)_
  - Top reviewers passes every non-approved title id as `$nin`, so its cost grows with the number of hidden titles. Fine at hundreds; revisit if thousands _(HS, SJ)_
