# BingeMate: Team Task List

Source: Group 29 INF2003 Progress Report (30 Sep 2026) + agreed tech stack
(React + TS frontend, Node.js + TS backend, PostgreSQL/Prisma, MongoDB, bcrypt, JWT, email & password).

Owners: **RA** Raihan · **JW** Jason · **HS** Hu Shi Yao · **WH** Winthrop · **SJ** Shang Jay · **ALL** whole team

- `[x]` = done and on `main` (or done before the repo existed, per the progress report)
- `[~]` = built and tested on a branch or open PR, waiting to merge (see "Where the work is")
- `[ ]` = not done

Last checked on 3 Nov 2026. `main` ends at PR #14. Every branch from the 30 Oct list (PRs #9 to #14) is merged, so nothing is marked `[~]` right now.

---

## Where the work is (3 Nov 2026)

Nothing is waiting to merge. PRs #9 to #14 were merged on 30 Oct: undated reviews (#9), review, reply and list endpoints (#10), title images (#11), genre options, creator stats and trending (#12), the website reading real data (#13) and the last task list (#14).

| Branch                                                                    | State                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `feat/admin-endpoints` _(RA)_                                             | Admin endpoints (§4). One commit, which only edits an older TASKS.md; no code yet. 6 commits behind `main`: rebase first |
| `feat/api-queries`, `feat/api-reviews-replies-lists`, `feat/title-poster` | Merged; can be deleted                                                                                                   |

The website reads real data on `main` with `VITE_USE_MOCKS=false` (web) and `npm run dev` (in `apps/api`). Reviews, replies, My Lists and creator stats writes are wired on `feat/web-wire-writes`; the creator title forms and the admin pages still need their API endpoints.

---

## 0. Decisions to lock before coding (ALL, Week 6)

- [x] **Where reviews live: split (option B).** PostgreSQL `reviews` holds the header row (`id`, `user_id`, `title_id`, `rating`, `created_at`, `updated_at`), so ratings and aggregates get ACID and FKs. MongoDB holds the review text and the replies, keyed by the same `id`. A review is a star rating and text, the same for every media type (WH, 2026-11-02).
- [x] **Creator privileges (baseline).** Creators create titles and can edit/delete **only their own** titles; admins can edit/delete any.
  - [x] Extras locked: (a) submission status + rejection reason, (b) stats per own title, (c) editing an approved title sends it back to `PENDING`, (d) ~~one pinned official reply per review~~ dropped by WH on 2026-10-27: a creator replies like anyone else, (e) "Creator" badge beside the name on the creator's own reviews/replies, only on titles they created.
- [x] **Creator-uploaded titles.** Saved as `PENDING`; hidden from browse/search until an admin sets them to `APPROVED` (or `REJECTED`).
  - [x] **Decided by WH on 2026-11-02: keep the approval process.** A creator's title is saved `PENDING` and stays hidden until an admin approves it. The 29 Oct proposal to drop it is not taken. The creator and admin halves are built on `feat/web-wire-writes` (see §2, §4, §8)
- [x] **Replies, not comments (WH, 2026-10-27).** Nobody comments on a review. Anyone signed in except an admin, including the review's author, can reply under it. Replies are one flat list per review, oldest first, with no replies to replies and no `@name` for now. Admins can delete any reply.
- [x] **JWT strategy.** One access token (2h) in an httpOnly cookie (`Secure` in prod, `SameSite=Lax`), no refresh tokens. Logout clears the cookie; on expiry the user logs in again.
- [x] **Libraries.** Express, Mongoose, Vite, Zod, Vitest/Jest + Supertest.
- [x] **Dev dataset size.** A subset of the 950k films for local dev; the full set for benchmarking only.
- [x] **Git workflow.** Monorepo, feature branches (`feat/…`, `fix/…`), merge to `main` through a PR with **no approval required**; direct pushes to `main` are blocked (branch protection). CI must pass before merge.
- [x] **Title images (WH, 29 Oct).** Optional. Stored in MongoDB (one document per title, keyed by the title id) and served by the API; `titles.posterUrl` points at it. JPEG, PNG or WebP only (SVG can carry scripts), 1 MB, checked by the file's bytes. The browser shrinks the image to 600 px wide before upload. The dataset has no images, so imported titles keep the colour placeholder. Merged in PR #11

## 1. Project setup (Week 6)

- [x] Create the monorepo scaffold (`apps/web`, `apps/api`, `packages/shared`). See `ARCHITECTURE.md`. _(RA)_
- [x] `docker-compose.yml` for PostgreSQL + MongoDB so everyone runs identical local DBs _(RA)_
- [x] Shared `tsconfig.base.json`, ESLint, Prettier _(RA)_
- [x] `.env.example` for `apps/api` and `apps/web`; add `.env` and `data/raw/` to `.gitignore` _(RA)_
- [x] CI (GitHub Actions or similar): lint, typecheck and test on every PR _(RA)_
- [x] Branch protection on `main`: require a PR and passing CI, 0 approvals, no direct pushes _(RA)_
- [x] Dev seed uses a dataset subset; full load only for benchmarks _(JW)_. The cleaned dev set is 1,500 titles (500 movies, 500 books, 500 TV shows) with 13,490 reviews, loaded by `data/etl/load-all.ts`. Skip `prisma/seed.ts`: the load already holds the admin and creator accounts. The full 950k set is for SJ's benchmarks only
- [ ] Move the existing prototype code (Titles/Users CRUD, browse page) into the new structure _(JW, WH)_. Most of it has been rebuilt in `modules/titles` and the web app; check whether anything in the prototype is still needed, then close this
- [x] `npm run dev` for the API exits with "Invalid environment variables": nothing loads `apps/api/.env` (Prisma reads it, the API does not). Load it in the `dev` script, e.g. `tsx watch --env-file=.env src/server.ts` (Node 20.6+), so everyone can start the API _(RA)_. Fixed in PR #8
- [~] README: the run-on-real-data steps are in `README.md` (`feat/web-wire-writes`). Still to document: how to view the databases (`npx prisma studio` in `apps/api`, `docker exec -it bingemate-postgres psql -U bingemate -d bingemate`, `docker exec -it bingemate-mongo mongosh bingemate`), and the `--env-file` start command until the item above is fixed _(WH)_

## 2. Data & relational schema (JW, Week 6)

- [x] Download datasets and load them into PostgreSQL and MongoDB
- [x] Initial ER diagram (Users, Titles, Genres, Reviews, Lists, junction tables)
- [x] Basic CRUD for Titles and Users in PostgreSQL
- [ ] Finalise the ER diagram: `users`, `titles` (with `media_type` MOVIE/BOOK/TV_SHOW, `status` PENDING/APPROVED/REJECTED, `created_by` → users), `genres`, `title_genres`, `people`, `title_people` (role: author/director/actor/showrunner), `list_entries`, `reviews` (header row only). All of these tables are in `schema.prisma`; the Eraser diagrams were updated on 27 Oct for the load schema changes (`WRITER`, `username`, `description`, the rating CHECK; links in `docs/eraser-diagrams.md`). Still to draw: the SQL views, the MongoDB `replies` and `titleposters` collections, and `status` if Part A (§0) changes it
- [x] Write `prisma/schema.prisma` and generate the first migration. Merged to `main` in PR #5 as `20261027075529_initial_bingemate` (JW's local `20261019011516_...` was never committed: drop it, then run `prisma migrate dev`)
- [x] Constraints: unique email, FKs with explicit `onDelete`, unique `(user_id, title_id)` on `list_entries` and on `reviews` (one review per user per title), `CHECK` on the rating range. The `CHECK (rating BETWEEN 1 AND 5)` is in migration `20261027075538_rating_check_and_views`
- [x] Indexes for browse/search: `titles(media_type)`, `titles(name)`, `titles(status)`, `title_genres(genre_id)`, `titles(avg_rating)`, `reviews(title_id)`, plus `list_entries(title_id)` and `titles(created_by)` (PR #5, for `/creator/stats` and delete cascades)
- [x] Rating aggregates (`avg_rating`, `review_count` on `titles`) recomputed in the same transaction as a `reviews` insert/update/delete (PR #10). Each write first locks the title row (`SELECT … FOR UPDATE`), so two reviews saved at once cannot leave a wrong total, and the average is rounded to 2 places like the `title_rating_stats` view. Checked on the real data, including two reviews posted at the same moment
- [x] Imported dataset titles get `status = APPROVED` and `created_by = NULL` (`data/etl/load-postgres.ts`)
- [x] Undated imported reviews (PR #9). 947 TV reviews have no date (965 before duplicates are dropped). They were loaded with the load time, so they sorted above every real review as "today". Both loaders now give them a made-up date between 1 Jan 2022 and 31 Dec 2025 (`undatedReviewDate` in `data/etl/lib/dates.ts`), hashed from the dataset review id so both stores agree and a reload gives the same dates; `verify-load` checks every one in both stores. These are not real dates (the ETL README says so). Reload with `npx tsx data/etl/load-all.ts --reset` if your local data predates the merge _(JW/HS)_
- [x] ETL scripts: clean nulls/duplicates, normalise genre names across the three datasets, dedupe people, keep a dataset-ID → DB-ID mapping. See `data/etl/README.md` (cleaners, loaders for PostgreSQL and MongoDB, `id-map.json`, verifiers)
- [x] `prisma/seed.ts`: one admin, one creator, one consumer, plus a small sample of titles (3 approved + 1 pending creator title)
- [ ] Turn the CRUD into `titles` and `users` API modules with validation
  - [x] `modules/titles` (PR #7): `GET /api/titles/:id` returns genres, people and `createdById`; pending, rejected and missing titles all answer 404, so hidden titles do not leak
  - [ ] The `users` module: every route needs a signed-in user. Auth is merged (PR #8), so this can start
- [~] Creator title endpoints (`feat/web-wire-writes`): `POST /api/titles` (CREATOR, saved `PENDING`), `PATCH /api/titles/:id` (owner only; name and description; an `APPROVED` or `REJECTED` title goes back to `PENDING` and the reason is cleared; the media type cannot change), `DELETE /api/titles/:id` (owner or admin; also removes the review bodies, replies and image from MongoDB), `GET /api/creator/titles` (own titles, every status). Checked on the real stack. A creator can delete their own title only while no other user has reviewed or listed it (otherwise 409, ask an admin); an admin can delete any title. Decided 2026-11-02 so a creator cannot wipe other users' reviews and lists _(JW)_
- [x] Title image endpoints (PR #11): `PUT`, `GET` and `DELETE /api/titles/:id/poster`. Only the creator who made the title or an admin can change it; 30 uploads per 15 minutes. The image URL carries `?v=<version>` taken from the stored document, so two uploads at once cannot leave the wrong version behind, and only a request for the current version is cached for a year
- [~] Where do runtime and publisher live? In `MovieDetails`, `TvDetails` and `BookDetails` (PostgreSQL), one optional row per title, type enforced by a composite foreign key (`feat/title-details`, needs team sign-off). The title page shows runtime, seasons, rating and publisher. Book `price` is not stored (23% filled). Studio and country are not in the dataset, and the UI hides them when empty

## 3. Authentication & RBAC (RA, Week 7–8)

- [x] `POST /auth/register`: validate email and password strength, hash with bcrypt (cost ≥ 12), default role `CONSUMER`. Done in `modules/auth` (PR #8); the password rule (8+ characters, a letter and a digit) matches the web client
  - [ ] Ask for a username too. Signed-up users have none, so their reviews and replies show `user-xxxxxx` (from the id); an email address is never shown to other readers
- [x] `POST /auth/login`: bcrypt compare, sign a JWT (`sub`, `role`, `exp` = 2h) and set it as an httpOnly, `SameSite=Lax` cookie (`Secure` in prod); return the same generic error for a wrong email or a wrong password. Done; the JWT also carries `email`
- [x] `GET /auth/me` (frontend calls it on load to restore the session), `POST /auth/logout` (clears the cookie)
- [ ] Keep one async route wrapper: PR #8 added `utils/asyncHandler.ts`, and the review, reply, list and image modules use `utils/asyncRoute.ts` (`route()`), which does the same job _(RA, WH)_
- [x] `cookie-parser` + CORS with `credentials: true` restricted to the web origin (`app.ts`, origin from `WEB_ORIGIN`)
- [x] `authenticate` middleware (read the JWT from the cookie, verify it) and `authorize(...roles)` middleware
  - [x] Bug: an expired or invalid token makes `jwt.verify` throw, which `errorHandler` turns into a **500**. Catch JWT errors and return 401. Fixed in `authenticate.ts` (PR #8)
  - [x] Bug: malformed JSON / oversized bodies gave **500**. Fixed by parser type: malformed JSON → 400, oversized JSON → 413, unsupported encoding/charset or aborted request → 400, all with fixed `{error}` responses. Regression tests added; API Supertest execution remains pending outside the sandbox (listen EPERM)
- [ ] Ownership checks: users edit/delete only their own reviews and replies, creators edit/delete only their own titles (`titles.created_by`), admins override all
  - [x] Reviews, replies, lists and title images already enforce their own rules inside their services (see §5, §7, §2), tested per role. Titles and users still need it
- [x] Reply permission: `CONSUMER` and `CREATOR` can reply to a review; `ADMIN` can delete any reply but never writes one. Enforced in the reply endpoints (§5)
- [x] Rate-limit login/register; keep the JWT secret in env only. `authLimiter` is applied to both routes; `JWT_SECRET` is env-only (Zod-validated)
- [ ] Tests for every role × protected route. Auth routes and `authorize` (every role) are covered (PR #8); the review, reply, list and image endpoints have them too, using real signed cookies. Titles writes and admin routes still need them

## 4. Admin moderation (RA, Week 11)

- [x] Delete any review (PostgreSQL header + MongoDB body) or reply, and keep the PostgreSQL aggregates in sync. `DELETE /reviews/:id` and `DELETE /replies/:id` accept an admin (§5)
- [ ] An admin endpoint that lists reviews across all titles, paginated, for the Moderation page (for example `GET /admin/reviews`; name to agree). The web calls it `adminApi.reviews` and it is mock-only today. Not started (branch `feat/admin-endpoints` has no code yet)
- [ ] `GET /admin/users` (paginated), `PATCH /admin/users/:id/role`. Not started (branch `feat/admin-endpoints`). Shapes from `apps/web/src/api/admin.ts`: `Paginated<{ id, email, role }>` and the updated user back; an admin cannot change their own role (400), unknown id 404; a new role takes effect at the user's next login (the old JWT keeps its role for up to 2h)
- [~] Title approval queue (`feat/web-wire-writes`): `GET /api/admin/titles?status=PENDING` (paginated, oldest first) and `PATCH /api/admin/titles/:id/status` (`APPROVED` or `REJECTED` with an optional reason that is kept only for `REJECTED`). ADMIN only. Checked on the real stack. The rest of §4 (users, roles, review moderation) is still RA's
- [x] Admin pages in the frontend _(with WH)_. UI done against mock data (PR #3); real endpoints still to be wired

## 5. MongoDB: reviews, replies, trending (HS lead; SJ co-owns trending)

The review, reply and trending items in this section were merged in PRs #10 to #12, tested with mocked stores in CI and run against the real local databases. The aggregation pipelines (Task 8) are new on the work branch.

- [x] Mongoose connection module (`db/mongo.ts`)
- [x] `ReviewBody` model, `_id` = the PostgreSQL `reviews.id`, with one shape for all media types: a plain `mediaType` copy (so a Mongo pipeline can group by type without a cross-store join), and `body` text. No rating here; the rating lives in PostgreSQL
  - [x] Decided by WH on 2026-11-02, needs HS/JW sign-off: **a review is only a star rating and text, for every media type.** The media-specific review fields (runtime watched, chapters read, season, episodes) are gone from the form, the API (`fields` is now refused with 400), the shared types, the web client and the mocks, and the per-type discriminators are gone from the model. No stored data moved: none of the 13,490 imported bodies had those fields. Title facts (runtime, seasons, publisher) are in PostgreSQL `MovieDetails`, `TvDetails`, `BookDetails`
  - [x] Decided: imported review extras (review year, publication name, summary, helpfulness) removed from the ETL and model on 2026-11-03. A review is only a star rating and text; existing MongoDB data cleanup is run separately.
- [x] Cross-store write order: insert the PostgreSQL row (transaction) → insert the Mongo body; if the Mongo write fails, delete the PostgreSQL row (compensating delete). Edits put the rating back the same way. Deletes go PostgreSQL first, then the Mongo body and replies, because a leftover Mongo document is invisible but a review without its body would show as empty
- [x] Reply storage: a separate collection with `reviewId` (no 16 MB document limit). Renamed from `comment.model.ts` to `reply.model.ts` (collection `replies`); `parentId` and `isOfficial` dropped, `editedAt` added
- [x] `TrendingCard` collection (denormalised title + rating + review count + poster) and a refresh job _(HS, SJ)_ (PR #12). `jobs/refreshTrending.ts` copies the top 50 per media type from the `trending_titles` view, upserts by title, removes cards that dropped out, and is safe to run twice. Run it with `npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts`
  - [x] D2: `server.ts` starts a timer controlled by `TRENDING_REFRESH_MINUTES` (integer 0–1440, default 10; 0 disables it). First tick is after one interval; pending runs are skipped, failures logged, and SIGINT/SIGTERM stop the timer. A separate startup check refreshes only an empty collection. The CLI above remains available. Socket-free timer/startup unit tests pass; live-database verification remains pending _(SJ, HS)_
- [~] Aggregation pipelines (Task 8): public review activity (populated UTC months, default 120, max 240), top reviewers (hidden titles excluded, author roles checked, max 50), and exported `recentReviewCounts(days)` for Task 9. Named builders and exact-stage unit tests added; socket-free checks pass. Supertest, real-database execution and explain output remain pending. See `docs/api.md` _(HS, SJ)_
- [ ] Indexes: `{titleId, createdAt}`, `{userId}`, `{rating}`. The first two are done. `{rating}` doesn't apply any more since ratings live in PostgreSQL (option B); confirm with the team and drop it
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
- [~] Review statistics queries: `GET /api/titles/:titleId/review-activity?months=120` and `GET /api/reviews/top-reviewers?type=&limit=10`; Zod-bounded public reads with APPROVED-title filtering. Recent counts helper is ready for Task 9; trending integration remains pending. Socket-free checks pass; Supertest and live database verification pending.
- [ ] Text search: `ILIKE` is in (`q` matches the title name, ~5 ms on the 1,500-title dev set); move to `pg_trgm` or full-text search only if it is too slow on 950k rows
- [x] Trending/popular aggregate queries. The `trending_titles` view (rating weighted by review count) is on `main`; `GET /api/trending?type=&limit=` reads the cards the job builds (PR #12). A recent time window is not in the view yet
- [x] Genre filter options: `GET /api/genres?type=` from the `genre_filter_options` view, most titles first; without a type, the same genre is summed across media types (PR #12)
- [ ] Run `EXPLAIN ANALYZE` on every heavy query and add indexes; record before/after numbers for the report
- [x] Pagination everywhere (no unbounded queries). Titles 20 per page (max 100), reviews 10 (max 50), replies 50 (max 200), lists 12 (max 50), trending up to 50. The genre list is small and returned whole
- [x] `GET /creator/stats`: avg rating, review count and list adds per title the creator owns. CREATOR only, scoped to the signed-in creator; a `?creatorId=` in the URL is ignored (PR #12)

## 7. Personal lists (JW backend + WH UI; RA support on the transaction) — now assigned

The list endpoints were merged in PR #10.

- [x] Status per entry: `COMPLETED`, `IN_PROGRESS`, `PLAN_TO`, filterable by media type _(JW)_
- [x] `GET /me/lists` (status and media type filters), `GET /me/lists/by-title/:titleId`, `POST /me/lists`, `PATCH /me/lists/:id`, `DELETE /me/lists/:id` _(JW)_. Every query is scoped to the signed-in user, so someone else's entry answers 404 like a missing one; entries of titles that are no longer approved are left out
- [x] Wrap list updates in a transaction (the report promises ACID for list updates) _(JW, RA support)_. Adding and changing run in a transaction; two taps of "Add" at once answer 409 instead of 500
- [x] My Lists UI page _(WH — see §8)_. UI done against mock data; the endpoints are merged, so it is waiting on the wiring in §8

## 8. Frontend (WH lead; SJ co-owns the data-heavy pages — rebalanced from solo)

- [ ] Browse and search page connected to the backend. Was ticked, but `main` only uses mock data
  - [x] The public reads now call the real API when `VITE_USE_MOCKS=false`: title detail, search/browse, the Home rails, a title's reviews and a review's replies (PR #13). Long reply threads are read page by page, and search text is cut to the 100 characters the API accepts
  - [~] Writes wired on `feat/web-wire-writes`: write/edit/delete review, the user's own review (`/mine`), replies, My Lists and creator stats, each with fetch-stubbed tests, and the client now shows the API's error text (it sends `error`, the client read `message`). Checked against the endpoints, not yet clicked through in a browser. Still not wired: the creator title forms (create, edit, delete, then `PUT` the image) wait on JW's title endpoints, and the admin pages wait on RA's _(WH)_
- [x] Router, layout, typed API client, `AuthContext`, protected routes _(WH)_. Done
  - [~] Sign-in, register, `me` and logout call the real `/auth/*` (the client uses `apiFetch`, no mock switch; `POST /auth/login` checked for the admin, creator and an imported user). Not yet clicked through in a browser _(WH)_
- [x] Login and register pages _(WH)_. Done; the password rule (8+ characters, a letter and a digit) matches the API (RA confirmed in PR #8)
- [ ] Home page with trending cards _(SJ)_. WH built the layout (hero, poster strip, Movies/TV/Books rails) on the titles API. `GET /api/trending` now exists (§6): swap it in
- [ ] Browse page filters (type, genre, rating) and pagination _(SJ)_. WH built the shell: `?q`, `?type`, `?page` in the URL, type pills and pagination, plus the nav search with quick matches. `GET /api/genres` now exists (§6) for the genre filter; the rating filter can use `minRating`
- [x] Title detail page: info, reviews, replies _(WH)_. Done against mock data; reads real data since PR #13. Country, studio and runtime are optional and hidden when empty, since the API has none of them
- [x] Write/edit/delete review form (star rating and text only, the same for every media type) _(WH)_. Write, edit and delete are done against mock data. Review text keeps its line breaks, wraps long strings and folds past 600 characters behind Read more. Edit is also available in place on the card. The rules the API enforces are listed in §5
- [x] My Lists page _(WH)_. Done against mock data (status tabs, media filter, move/remove with rollback)
- [x] Replies UI _(WH)_. Done against mock data: one flat list per review, one action row (Reply with a count, Edit, Delete) on every review and reply, writer-only edit with an "edited" mark, relative dates, a "You" marker, threads over 3 replies fold to 2
- [x] Site-styled `Dropdown` (combobox + listbox) replaces the native select for list status on the title page and My Lists _(WH)_. The role picker in the admin table and the media type in the submission form are still native selects
- [x] Role-based controls (hide or disable actions the role cannot perform; the backend still enforces them) _(WH)_. Done: nav links, route guards, delete buttons, own-role select
- [~] Creator upload flow: create, edit (media type is fixed once created), "My submissions" with status and rejection reason, and the optional image (the title is `POST`ed, then the image is `PUT`) now go through the real API (`feat/web-wire-writes`), with the "edit re-submits" warning kept. If only the image fails, the creator is told the title was saved. Not yet clicked through in a browser. Delete is available on every submission and approved-title stats row, with inline Confirm / Cancel; success refreshes the rows, and a server error (including 409 for other users’ reviews/lists) keeps the title and shows the message. Covered by mock UI and real-mode fetch-stub tests _(WH)_
  - [x] Optional poster image on the new and edit forms (PR #11): preview, Remove image (a first press drops a new pick and keeps the current image; a second removes the current one), a message for the wrong type or a file over 8 MB, and the form waits while the image is shrunk. A slower earlier pick can no longer replace a later one
- [x] Creator stats page; Creator badge on the creator's own reviews/replies _(WH)_. Done against mock data. The badge is by title ownership, not by role
- [x] API client sends cookies (`credentials: 'include'`); on 401 clear `AuthContext` and redirect to login _(WH)_. Done; forms keep their drafts when a 401 arrives
- [ ] Admin dashboard: users/roles, title approval queue, review/reply moderation _(WH UI + RA endpoints — Week 11)_. WH UI done against mock data; RA's endpoints still to build and wire
- [ ] Loading, empty and error states; keyboard/a11y pass _(WH)_. States and automated a11y checks are done, focus returns to the right button after edit, reply and the dropdown, and the code-level audit is done. A manual keyboard-only pass on a real browser is still to do (the browser tool needs Chrome remote debugging switched on)
- [ ] **Phone layout, one site-wide pass (parked by WH, 2026-10-27).** Aim for no sideways scroll at 320 CSS px (WCAG reflow) _(WH)_. PR #6 resizes the header dock (smaller logo, 46px buttons and tighter gaps below `sm`) and the title overview (104px poster, long titles break). Both were sized by hand and have not been seen on a device. Still to do: check those two at 320px in a real browser, then the Home strip and rails (fixed widths) and every other page

## 9. Performance & SQL vs NoSQL comparison (SJ lead; HS co-owns the Mongo side, Week 12)

- [ ] Define scenarios: fetch reviews for a title, top-N trending, insert a review, read the replies of a review (was "nested comment read"; replies are flat now, so confirm this still makes the case for MongoDB), filtered browse
- [ ] Benchmark scripts that run the same workload against PostgreSQL and MongoDB
- [ ] Load-test the API (e.g. autocannon or k6)
- [ ] Tables and charts for the final report

## 10. Testing & quality (ALL, ongoing)

- [ ] Unit tests for services; integration tests (Supertest) against test DBs
  - [x] Every new endpoint has Supertest tests with Prisma and MongoDB replaced by stubs (CI has no database), and each permission rule was checked by breaking it on purpose and watching a test fail. Each module was also run by hand against the real local databases
  - [ ] CI has no PostgreSQL or MongoDB, so nothing in CI runs the real SQL, the views or the Mongo writes. Add both as CI services and a small real-database test run _(RA, ALL)_
- [ ] Each owner covers their own module; CI must pass before merge
- [ ] `prettier --check` fails on `apps/api/prisma/seed.ts` and `apps/api/src/utils/pagination.ts` (CI does not run prettier). Format them once, then decide whether CI should check formatting

## 11. Final deliverables (ALL, Week 13)

- [ ] Final report: each member writes up their own component
- [ ] Updated ER diagram + architecture diagram. `docs/architecture.svg` (in `main`) shows a global rate-limit and auth pipeline the code does not have; `docs/eraser-diagrams.md` holds anyone-can-edit Eraser links, so decide whether to keep it in the repo _(WH)_
- [ ] User manual (the project spec asks for one with the submission) _(ALL)_
- [ ] Slides
- [ ] Video presentation and demo script
- [x] README with setup steps (docker compose → migrate → seed → run). Update it if the local Postgres port change to `5433` (uncommitted) is kept, and see the README item in §1

## 12. Known gaps and follow-ups (found in code review, 29–30 Oct)

Fixed on 30 Oct (merged in PRs #10 to #13): stored ratings now come from the `title_rating_stats` view, so they round exactly like it (JS rounding stored 1.02 for 41 stars over 40 reviews, the view 1.03); a failed review edit undoes its rating only if no other edit has saved since; deleting a review clears its replies even when the body delete fails; the creator form drops an image still being prepared when it closes.

- [x] **500 on malformed JSON** — fixed on 3 Nov: parser errors return fixed 400/413 JSON responses; unknown routes return 404 `{error: 'Not found'}`. Unexpected errors still log `Unhandled error:` and return only 500 `{error: 'InternalServerError'}`. Regression tests added; API Supertest execution remains pending outside the sandbox (listen EPERM) _(WH)_

- [~] **A reply posted while its review is being deleted can be left behind.** The reply check passes, the review and its replies are deleted, then the reply is saved. `cleanupOrphans` covers this race by removing Mongo review bodies and replies whose PostgreSQL review is gone, in bounded batches. Run manually from the repo root: `npx tsx --env-file=apps/api/.env apps/api/src/jobs/cleanupOrphans.ts`. Unit tests use stubbed stores; real-database verification is pending. The job is not scheduled automatically _(HS)_

- [~] **Deleting a title leaves nothing behind in MongoDB** now (review bodies, replies and the image are removed after the PostgreSQL delete, and a MongoDB failure is logged without failing the delete). **Deleting a user still leaves its review bodies and replies behind**; whoever builds user delete must remove them too _(RA)_. The trending read now drops cards whose title is no longer approved, so a deleted, rejected or re-submitted title stops showing there at once
- [x] **A creator can change the image of an approved title with no re-moderation**: done on `main` (PR #11). A creator's image replacement sends an approved title back to `PENDING` before the stored bytes are overwritten, so the old public URL never serves an unreviewed image. Removing the image does not re-moderate, since nothing unreviewed is published _(WH, JW)_
- [x] **The owner cannot see the image of their own pending title**: done on `main` (PR #11). The owner and admins can fetch it; everyone else gets the same 404 as for a missing image _(WH)_
- [x] **An empty `trending_titles` view keeps existing cards.** The refresh job warns and returns `{upserted: 0, removed: 0}` without writes or deletion. Socket-free unit and existing job tests pass; non-empty upserts and stale-card deletion are unchanged. Live-database verification remains pending _(SJ)_
- [ ] Small shared helpers are repeated across modules (the title id param schema, the admin-cannot-write check, the page/pageSize schema), and `titles.routes.ts` still uses try/catch instead of the `route()` helper. The trending job also reads poster URLs with a second query that could be a JOIN in its ranking SQL. Tidy once the modules have merged _(WH)_
