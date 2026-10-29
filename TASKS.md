# BingeMate: Team Task List

Source: Group 29 INF2003 Progress Report (30 Sep 2026) + agreed tech stack
(React + TS frontend, Node.js + TS backend, PostgreSQL/Prisma, MongoDB, bcrypt, JWT, email & password).

Owners: **RA** Raihan · **JW** Jason · **HS** Hu Shi Yao · **WH** Winthrop · **SJ** Shang Jay · **ALL** whole team

- `[x]` = done and on `main` (or done before the repo existed, per the progress report)
- `[~]` = built and tested on a branch or open PR, waiting to merge (see "Where the work is")
- `[ ]` = not done

Last checked on 30 Oct 2026. `main` ends at the auth PR #8 (after the titles API #7 and the review and reply UI #6).

---

## Where the work is (30 Oct 2026)

Each branch below is stacked on the one above it, so merge them in this order.

| Branch                           | PR         | What it holds                                                    | Merge after                                 |
| -------------------------------- | ---------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `fix/etl-undated-reviews`        | not pushed | Undated reviews get one fixed old date                           | — (independent)                             |
| `feat/api-reviews-replies-lists` | not pushed | Review, reply and list endpoints; Mongo model renamed to replies | —                                           |
| `feat/title-poster`              | not pushed | Title image upload (API + creator form), code-review fixes       | the branch above                            |
| `feat/api-queries`               | not pushed | Genre options, creator stats, trending job + endpoint            | `feat/title-poster`                         |
| `feat/web-wire-reads`            | not pushed | The website reads real data (titles, search, reviews, replies)   | `feat/api-queries` (it uses their types)    |
| `docs/tasks-sync`                | not pushed | This file                                                        | merge last; on a conflict keep this version |
| `feat/admin-endpoints` _(RA)_    | started    | Admin moderation endpoints (§4)                                  | build on `feat/api-reviews-replies-lists`   |

To see the real data in the website before all of this is merged, a local merge of the branches above runs with
`VITE_USE_MOCKS=false` (web) and `npm run dev` (in `apps/api`). Sign-in and writes in the website still use mock data.

---

## 0. Decisions to lock before coding (ALL, Week 6)

- [x] **Where reviews live: split (option B).** PostgreSQL `reviews` holds the header row (`id`, `user_id`, `title_id`, `rating`, `created_at`, `updated_at`), so ratings and aggregates get ACID and FKs. MongoDB holds the body, the media-specific fields and the replies, keyed by the same `id`.
- [x] **Creator privileges (baseline).** Creators create titles and can edit/delete **only their own** titles; admins can edit/delete any.
  - [x] Extras locked: (a) submission status + rejection reason, (b) stats per own title, (c) editing an approved title sends it back to `PENDING`, (d) ~~one pinned official reply per review~~ dropped by WH on 2026-10-27: a creator replies like anyone else, (e) "Creator" badge beside the name on the creator's own reviews/replies, only on titles they created.
- [x] **Creator-uploaded titles.** Saved as `PENDING`; hidden from browse/search until an admin sets them to `APPROVED` (or `REJECTED`).
  - [ ] **Proposed by WH (29 Oct), pinned, needs team sign-off: drop the approval process.** Creators' titles would be public at once; admins moderate afterwards by deleting a title, and only admins grant the Creator role. Two ways: drop `status` and `rejectionReason` with a migration (recommended: rebuilds three views, removes every `APPROVED` filter), or keep the column and always save `APPROVED`. If agreed, the approval queue (§4), the re-submit rule (extra (c)) and the status column on "My submissions" (§8) go away. Wait for PRs #6 and #7 to merge first
- [x] **Replies, not comments (WH, 2026-10-27).** Nobody comments on a review. Anyone signed in except an admin, including the review's author, can reply under it. Replies are one flat list per review, oldest first, with no replies to replies and no `@name` for now. Admins can delete any reply.
- [x] **JWT strategy.** One access token (2h) in an httpOnly cookie (`Secure` in prod, `SameSite=Lax`), no refresh tokens. Logout clears the cookie; on expiry the user logs in again.
- [x] **Libraries.** Express, Mongoose, Vite, Zod, Vitest/Jest + Supertest.
- [x] **Dev dataset size.** A subset of the 950k films for local dev; the full set for benchmarking only.
- [x] **Git workflow.** Monorepo, feature branches (`feat/…`, `fix/…`), merge to `main` through a PR with **no approval required**; direct pushes to `main` are blocked (branch protection). CI must pass before merge.
- [~] **Title images (WH, 29 Oct).** Optional. Stored in MongoDB (one document per title, keyed by the title id) and served by the API; `titles.posterUrl` points at it. JPEG, PNG or WebP only (SVG can carry scripts), 1 MB, checked by the file's bytes. The browser shrinks the image to 600 px wide before upload. The dataset has no images, so imported titles keep the colour placeholder

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
- [ ] README: document how to run the website against the real API (`VITE_USE_MOCKS=false`), how to view the databases (`npx prisma studio` in `apps/api`, `docker exec -it bingemate-postgres psql -U bingemate -d bingemate`, `docker exec -it bingemate-mongo mongosh bingemate`), and the `--env-file` start command until the item above is fixed _(WH)_

## 2. Data & relational schema (JW, Week 6)

- [x] Download datasets and load them into PostgreSQL and MongoDB
- [x] Initial ER diagram (Users, Titles, Genres, Reviews, Lists, junction tables)
- [x] Basic CRUD for Titles and Users in PostgreSQL
- [ ] Finalise the ER diagram: `users`, `titles` (with `media_type` MOVIE/BOOK/TV_SHOW, `status` PENDING/APPROVED/REJECTED, `created_by` → users), `genres`, `title_genres`, `people`, `title_people` (role: author/director/actor/showrunner), `list_entries`, `reviews` (header row only). All of these tables are in `schema.prisma`; the Eraser diagrams were updated on 27 Oct for the load schema changes (`WRITER`, `username`, `description`, the rating CHECK, `details` in MongoDB; links in `docs/eraser-diagrams.md`). Still to draw: the SQL views, the MongoDB `replies` and `titleposters` collections, and `status` if Part A (§0) changes it
- [x] Write `prisma/schema.prisma` and generate the first migration. Merged to `main` in PR #5 as `20261027075529_initial_bingemate` (JW's local `20261019011516_...` was never committed: drop it, then run `prisma migrate dev`)
- [x] Constraints: unique email, FKs with explicit `onDelete`, unique `(user_id, title_id)` on `list_entries` and on `reviews` (one review per user per title), `CHECK` on the rating range. The `CHECK (rating BETWEEN 1 AND 5)` is in migration `20261027075538_rating_check_and_views`
- [x] Indexes for browse/search: `titles(media_type)`, `titles(name)`, `titles(status)`, `title_genres(genre_id)`, `titles(avg_rating)`, `reviews(title_id)`, plus `list_entries(title_id)` and `titles(created_by)` (PR #5, for `/creator/stats` and delete cascades)
- [~] Rating aggregates (`avg_rating`, `review_count` on `titles`) recomputed in the same transaction as a `reviews` insert/update/delete (`feat/api-reviews-replies-lists`). Each write first locks the title row (`SELECT … FOR UPDATE`), so two reviews saved at once cannot leave a wrong total, and the average is rounded to 2 places like the `title_rating_stats` view. Checked on the real data, including two reviews posted at the same moment
- [x] Imported dataset titles get `status = APPROVED` and `created_by = NULL` (`data/etl/load-postgres.ts`)
- [~] Undated imported reviews (`fix/etl-undated-reviews`). 947 TV reviews have no date (965 before duplicates are dropped; the old note said 965). They were loaded with the load time, so they sorted above every real review as "today". Both loaders now give them `1900-01-01`, older than the earliest real review (1938), and `verify-load` checks the count in both stores. Reload with `npx tsx data/etl/load-all.ts --reset` after merging _(JW/HS)_
- [x] ETL scripts: clean nulls/duplicates, normalise genre names across the three datasets, dedupe people, keep a dataset-ID → DB-ID mapping. See `data/etl/README.md` (cleaners, loaders for PostgreSQL and MongoDB, `id-map.json`, verifiers)
- [x] `prisma/seed.ts`: one admin, one creator, one consumer, plus a small sample of titles (3 approved + 1 pending creator title)
- [ ] Turn the CRUD into `titles` and `users` API modules with validation
  - [x] `modules/titles` (PR #7): `GET /api/titles/:id` returns genres, people and `createdById`; pending, rejected and missing titles all answer 404, so hidden titles do not leak
  - [ ] The `users` module: every route needs a signed-in user, so it waits for RA's auth
- [ ] Creator title endpoints: create (→ `PENDING`), edit/delete own; editing an `APPROVED` title resets it to `PENDING`; store `rejection_reason` on `titles`. The `rejectionReason` column exists; endpoints not started. **Hold until the Part A decision (§0)**, since the rules differ with and without approval. Deleting a title must also remove its MongoDB review bodies, replies and image (see §12)
- [~] Title image endpoints (`feat/title-poster`): `PUT`, `GET` and `DELETE /api/titles/:id/poster`. Only the creator who made the title or an admin can change it; 30 uploads per 15 minutes. The image URL carries `?v=<version>` taken from the stored document, so two uploads at once cannot leave the wrong version behind, and only a request for the current version is cached for a year
- [ ] Where do runtime and publisher live? The cleaned data has `runtime_min` (movies), `duration` (TV), `publisher` and `price` (books), but no loader stores them, so the title page shows no runtime. Studio and country are not in the dataset at all, and the UI hides them when empty. Store them in MongoDB or drop them _(JW, HS)_

## 3. Authentication & RBAC (RA, Week 7–8)

- [x] `POST /auth/register`: validate email and password strength, hash with bcrypt (cost ≥ 12), default role `CONSUMER`. Done in `modules/auth` (PR #8); the password rule (8+ characters, a letter and a digit) matches the web client
  - [ ] Ask for a username too. Signed-up users have none, so their reviews and replies show `user-xxxxxx` (from the id); an email address is never shown to other readers
- [x] `POST /auth/login`: bcrypt compare, sign a JWT (`sub`, `role`, `exp` = 2h) and set it as an httpOnly, `SameSite=Lax` cookie (`Secure` in prod); return the same generic error for a wrong email or a wrong password. Done; the JWT also carries `email`
- [x] `GET /auth/me` (frontend calls it on load to restore the session), `POST /auth/logout` (clears the cookie)
- [ ] Keep one async route wrapper: PR #8 added `utils/asyncHandler.ts`, and the review, reply, list and image modules use `utils/asyncRoute.ts` (`route()`), which does the same job _(RA, WH)_
- [x] `cookie-parser` + CORS with `credentials: true` restricted to the web origin (`app.ts`, origin from `WEB_ORIGIN`)
- [x] `authenticate` middleware (read the JWT from the cookie, verify it) and `authorize(...roles)` middleware
  - [x] Bug: an expired or invalid token makes `jwt.verify` throw, which `errorHandler` turns into a **500**. Catch JWT errors and return 401. Fixed in `authenticate.ts` (PR #8)
  - [ ] Bug: a request with malformed JSON (or a body over the parser's limit) also gives a **500**, because `errorHandler` only knows Zod and `HttpError`. Pass on the status that Express's body parser sets (400 / 413). Found on 29 Oct; affects every route
- [ ] Ownership checks: users edit/delete only their own reviews and replies, creators edit/delete only their own titles (`titles.created_by`), admins override all
  - [~] Reviews, replies, lists and title images already enforce their own rules inside their services (see §5, §7, §2), tested per role. Titles and users still need it
- [~] Reply permission: `CONSUMER` and `CREATOR` can reply to a review; `ADMIN` can delete any reply but never writes one. Enforced in the reply endpoints (§5)
- [x] Rate-limit login/register; keep the JWT secret in env only. `authLimiter` is applied to both routes; `JWT_SECRET` is env-only (Zod-validated)
- [ ] Tests for every role × protected route. Auth routes and `authorize` (every role) are covered (PR #8); the review, reply, list and image endpoints have them too, using real signed cookies. Titles writes and admin routes still need them

## 4. Admin moderation (RA, Week 11)

- [~] Delete any review (PostgreSQL header + MongoDB body) or reply, and keep the PostgreSQL aggregates in sync. `DELETE /reviews/:id` and `DELETE /replies/:id` accept an admin (§5)
- [ ] An admin endpoint that lists reviews across all titles, paginated, for the Moderation page (for example `GET /admin/reviews`; name to agree). The web calls it `adminApi.reviews` and it is mock-only today. Not started
- [ ] `GET /admin/users` (paginated), `PATCH /admin/users/:id/role`
- [ ] Title approval queue: `GET /admin/titles?status=PENDING`, `PATCH /admin/titles/:id/status` (APPROVED / REJECTED, optional rejection reason). **Not needed if Part A (§0) is agreed**; an admin "delete title" takes its place
- [x] Admin pages in the frontend _(with WH)_. UI done against mock data (branch `feat/web-shell`); real endpoints still to be wired

## 5. MongoDB: reviews, replies, trending (HS lead; SJ co-owns trending)

All `[~]` items in this section are on `feat/api-reviews-replies-lists` (fixes on `feat/title-poster`), tested with mocked stores in CI and run against the real local databases.

- [x] Mongoose connection module (`db/mongo.ts`)
- [x] `ReviewBody` model, `_id` = the PostgreSQL `reviews.id`, with discriminators per media type (movie: runtime, book: chapters, TV: season/episodes) and a `details` (Mixed) field for the dataset's extras. No rating here; the rating lives in PostgreSQL
  - [ ] Decide what the review form's media fields should be. The form asks for minutes, chapters, season and episodes, but the imported reviews carry other extras (review year, publication name, summary, helpfulness), so they show no details line. Keep, replace or drop the discriminators _(HS, JW)_. Today the API keeps only the fields a title's media type takes (`chapters` is stored as `chaptersRead`) and does not return `details`
- [~] Cross-store write order: insert the PostgreSQL row (transaction) → insert the Mongo body; if the Mongo write fails, delete the PostgreSQL row (compensating delete). Edits put the rating back the same way. Deletes go PostgreSQL first, then the Mongo body and replies, because a leftover Mongo document is invisible but a review without its body would show as empty
- [~] Reply storage: a separate collection with `reviewId` (no 16 MB document limit). Renamed from `comment.model.ts` to `reply.model.ts` (collection `replies`); `parentId` and `isOfficial` dropped, `editedAt` added
- [~] `TrendingCard` collection (denormalised title + rating + review count + poster) and a refresh job _(HS, SJ)_ (`feat/api-queries`). `jobs/refreshTrending.ts` copies the top 50 per media type from the `trending_titles` view, upserts by title, removes cards that dropped out, and is safe to run twice. Run it with `npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts`
  - [ ] Decide when it runs (on a timer, after review writes, or by hand before a demo). Nothing schedules it yet
- [ ] Indexes: `{titleId, createdAt}`, `{userId}`, `{rating}`. The first two are done. `{rating}` doesn't apply any more since ratings live in PostgreSQL (option B); confirm with the team and drop it
- [x] Map review-dataset titles to PostgreSQL `title.id` and load the review datasets (`load-postgres.ts` + `load-mongo-reviews.ts`; the 0 to 10 scores are converted to 1 to 5 stars in `clean-reviews.ts`)
- [~] Review endpoints: `GET /titles/:titleId/reviews` (newest first, tie-break on id, 10 per page, max 50), `POST /titles/:titleId/reviews`, `PATCH /reviews/:id` (owner only), `DELETE /reviews/:id` (owner or admin). Editing a review whose MongoDB body is missing answers 502 and changes nothing, instead of a silent 200
  - [~] Rules enforced: **admins never write** reviews or replies (403, they only delete); **the creator of a title cannot review it** (403) but can reply; one review per user per title (409); only approved titles
- [~] Reply endpoints _(HS)_: `GET /reviews/:reviewId/replies` (oldest first, 50 per page, max 200), `POST /reviews/:reviewId/replies` (not admins), `PATCH /replies/:id` (writer only, never an admin, text not empty, keeps `createdAt`, sets `editedAt` only when the text really changed), `DELETE /replies/:id` (writer or admin). Only under reviews of approved titles
- [~] Creator badge data: the title detail returns `createdById` (PR #7) and every review and reply returns its author's id, name and role. No `isOfficial`, no pinning, no separate reply
  - [~] The replies list endpoint returns oldest first and the UI does not re-sort it
- [~] Return the author's id with reviews/replies (see above). A writer whose account is gone shows as "Deleted user"
- [~] **Rating scale is whole stars, 1 to 5** (decided by WH, 2026-10-18). On `main`: the `CHECK (rating BETWEEN 1 AND 5)`, the ETL conversion (`round(score / 2)`, clamped), and `RATING_MIN`/`RATING_MAX` in `@bingemate/shared`. On the branch: the review endpoints validate with the same constants and reject anything else (including half stars and text), and `avgRating` stays on the 1 to 5 scale
- [~] `GET /titles/:titleId/reviews/mine` returns the signed-in user's review of the title, or `null`

## 6. Search, filtering, trending queries (SJ, Week 9–10)

- [x] `GET /titles?q=&type=&genre=&minRating=&year=&sort=&page=&pageSize=` (PR #7; returns `APPROVED` titles only). `sort` is `name` (default), `rating`, `year` or `reviews`, every order ends on `id` so pages are stable; `genre` is a name (case-insensitive) and `year` an exact match. Bad values answer 400
- [ ] Text search: `ILIKE` is in (`q` matches the title name, ~5 ms on the 1,500-title dev set); move to `pg_trgm` or full-text search only if it is too slow on 950k rows
- [~] Trending/popular aggregate queries. The `trending_titles` view (rating weighted by review count) is on `main`; `GET /api/trending?type=&limit=` reads the cards the job builds (`feat/api-queries`). A recent time window is not in the view yet
- [~] Genre filter options: `GET /api/genres?type=` from the `genre_filter_options` view, most titles first; without a type, the same genre is summed across media types (`feat/api-queries`)
- [ ] Run `EXPLAIN ANALYZE` on every heavy query and add indexes; record before/after numbers for the report
- [~] Pagination everywhere (no unbounded queries). Titles 20 per page (max 100), reviews 10 (max 50), replies 50 (max 200), lists 12 (max 50), trending up to 50. The genre list is small and returned whole
- [~] `GET /creator/stats`: avg rating, review count and list adds per title the creator owns (`feat/api-queries`). CREATOR only, scoped to the signed-in creator; a `?creatorId=` in the URL is ignored

## 7. Personal lists (JW backend + WH UI; RA support on the transaction) — now assigned

All `[~]` items here are on `feat/api-reviews-replies-lists`.

- [~] Status per entry: `COMPLETED`, `IN_PROGRESS`, `PLAN_TO`, filterable by media type _(JW)_
- [~] `GET /me/lists` (status and media type filters), `GET /me/lists/by-title/:titleId`, `POST /me/lists`, `PATCH /me/lists/:id`, `DELETE /me/lists/:id` _(JW)_. Every query is scoped to the signed-in user, so someone else's entry answers 404 like a missing one; entries of titles that are no longer approved are left out
- [~] Wrap list updates in a transaction (the report promises ACID for list updates) _(JW, RA support)_. Adding and changing run in a transaction; two taps of "Add" at once answer 409 instead of 500
- [x] My Lists UI page _(WH — see §8)_. UI done against mock data; waiting on the list endpoints to merge

## 8. Frontend (WH lead; SJ co-owns the data-heavy pages — rebalanced from solo)

- [ ] Browse and search page connected to the backend. Was ticked, but `main` only uses mock data
  - [~] The public reads now call the real API when `VITE_USE_MOCKS=false`: title detail, search/browse, the Home rails, a title's reviews and a review's replies (`feat/web-wire-reads`). Long reply threads are read page by page, and search text is cut to the 100 characters the API accepts. Needs #6 and the API branches to merge
  - [ ] Wire the writes to the real API: write/edit/delete review, the user's own review (`/mine`), replies, My Lists, the creator pages (including the image upload: `POST` the title, then `PUT` the image), creator stats and the admin pages. The endpoints exist (§5–§7) except the creator title ones and RA's; each can be tested with a signed cookie before login exists _(WH)_
- [x] Router, layout, typed API client, `AuthContext`, protected routes _(WH)_. Done
  - [ ] Point sign-in, register, `me` and logout at the real `/auth/*` (on `main` since PR #8); they still use mock data _(WH)_
- [x] Login and register pages _(WH)_. Done; the password rule (8+ characters, a letter and a digit) matches the API (RA confirmed in PR #8)
- [ ] Home page with trending cards _(SJ)_. WH built the layout (hero, poster strip, Movies/TV/Books rails) on the titles API. `GET /api/trending` now exists (§6): swap it in
- [ ] Browse page filters (type, genre, rating) and pagination _(SJ)_. WH built the shell: `?q`, `?type`, `?page` in the URL, type pills and pagination, plus the nav search with quick matches. `GET /api/genres` now exists (§6) for the genre filter; the rating filter can use `minRating`
- [x] Title detail page: info, reviews, replies _(WH)_. Done against mock data; reads real data on `feat/web-wire-reads`. Country, studio and runtime are optional and hidden when empty, since the API has none of them
  - [ ] Undated imported reviews carry `1900-01-01` (§2) and read as "126 years ago". Show "date unknown" for that date instead _(WH)_
- [x] Write/edit/delete review form (media-specific fields) _(WH)_. Write, edit and delete are done against mock data. Media fields accept digits only. Review text keeps its line breaks, wraps long strings and folds past 600 characters behind Read more. Edit is also available in place on the card. The rules the API enforces are listed in §5
- [x] My Lists page _(WH)_. Done against mock data (status tabs, media filter, move/remove with rollback)
- [x] Replies UI _(WH)_. Done against mock data: one flat list per review, one action row (Reply with a count, Edit, Delete) on every review and reply, writer-only edit with an "edited" mark, relative dates, a "You" marker, threads over 3 replies fold to 2
- [x] Site-styled `Dropdown` (combobox + listbox) replaces the native select for list status on the title page and My Lists _(WH)_. The role picker in the admin table and the media type in the submission form are still native selects
- [x] Role-based controls (hide or disable actions the role cannot perform; the backend still enforces them) _(WH)_. Done: nav links, route guards, delete buttons, own-role select
- [ ] Creator upload flow _(UI done against mock data, including the edit-resubmits warning; waiting on JW's endpoints)_: create, edit and delete own titles; "My submissions" list showing PENDING / APPROVED / REJECTED + rejection reason; warn that editing an approved title re-submits it _(WH UI + JW backend — Week 11)_. The status parts change if Part A (§0) is agreed
  - [~] Optional poster image on the new and edit forms (`feat/title-poster`): preview, Remove image (a first press drops a new pick and keeps the current image; a second removes the current one), a message for the wrong type or a file over 8 MB, and the form waits while the image is shrunk. A slower earlier pick can no longer replace a later one
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
  - [~] Every new endpoint has Supertest tests with Prisma and MongoDB replaced by stubs (CI has no database), and each permission rule was checked by breaking it on purpose and watching a test fail. Each module was also run by hand against the real local databases
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

## 12. Known gaps and follow-ups (found in code review, 29 Oct)

- [ ] **Deleting a title or a user leaves MongoDB documents behind.** PostgreSQL cascades the review rows, but their bodies, replies and the title image stay in MongoDB. Whoever builds title delete (§2) and user delete must remove them too _(JW, RA)_
- [ ] **A creator can change the image of an approved title with no re-moderation**, while editing the title itself would send it back to `PENDING`. Disappears if Part A (§0) is agreed; otherwise decide whether an image change also re-submits _(WH, JW)_
- [ ] **The owner cannot see the image of their own pending title**, because the image is served only for approved titles. Disappears with Part A; otherwise let the owner and admins fetch it _(WH)_
- [ ] **If the `trending_titles` view returns no rows, the refresh job removes every card.** Correct for a truly empty view (a failed read stops before the delete); accepted for now _(SJ)_
- [ ] Small shared helpers are repeated across modules (the title id param schema, the admin-cannot-write check, the page/pageSize schema), and `titles.routes.ts` still uses try/catch instead of the `route()` helper. Tidy once the modules have merged _(WH)_
