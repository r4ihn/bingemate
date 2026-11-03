# Remaining Work (everything except RA's part) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status (3 Nov 2026):** Tasks 2–9 are done. Tasks 1 and 10–16 continue in `2026-11-03-database-showpieces-and-delivery.md`, which supersedes them: it fixes the benchmark data source (there is no 950k set) and adds a bench-database task.

**Goal:** Close every open item in `TASKS.md` that is not RA's, in time for the 29 Nov 2026, 11:30 PM submission.

**Architecture:** Small, independent tasks on top of the existing stack. The three unpushed branches become PRs first. The MongoDB aggregation work, the SQL window-function query and the benchmarks come next, because they carry the grade (25% relational, 25% NoSQL). Report, slides, video and manual drafting run alongside.

**Tech Stack:** Express + TS, Prisma/PostgreSQL 16, Mongoose/MongoDB 7, Zod, Vitest + Supertest (stubbed stores), React + Vite, GitHub Actions, autocannon.

**Spec:** `/Users/winthrop/Library/CloudStorage/OneDrive-Personal/Documents/_SIT_School_/Y2/Y2T1/INF2003 Database Systems/Project/INF2003_project_description.pdf` and `TASKS.md` (sections 5, 6, 9, 10, 11, 12).

**Out of scope (RA's part):** admin users / roles / review-moderation endpoints and their web pages (still mock), and deleting a user's Mongo review bodies and replies. Nothing here may depend on them.

## Global Constraints

- Coding jobs are delegated to Codex (`codex-companion.mjs task --write --fresh`). Codex edits and runs web tests / tsc / eslint. Claude reads the diff, runs the API Supertest suite, mutation-checks, and commits. Codex cannot commit or open sockets.
- Never add Co-Authored-By, "Generated with Claude Code" or any Claude attribution to commits or PRs.
- No new config file, CI workflow edit or dependency without asking first (Task 9 and Task 8 both need a yes).
- Never push, merge, squash or force-push without explicit OK.
- Every new endpoint: Zod-validated input, pagination bounded, `{error}` body shape, Supertest test with stores stubbed, and each permission rule mutation-checked.
- A task is not done until its tests pass and (for DB work) it has been run against the real local databases.
- `STATE.md` is gitignored; update it at each checkpoint. Mark `TASKS.md` items only after testing.
- Dates: today is 2026-11-03. Imported reviews carry made-up dates in 2022–2025, so a "last 30 days" window is empty on the dev data.

## Review Focus

- A trending refresh that runs while a review is being written must not leave a half-built card set (cards swapped, not wiped then refilled).
- Time-windowed trending on a window with zero reviews returns an empty list, not a 500 or `NaN` scores.
- A Mongo pipeline on a title with no reviews returns an empty series (200), not 404, and never a review from a hidden (non-APPROVED) title.
- An owner or admin fetching the image of a PENDING title works; a stranger still gets 404 and learns nothing about whether it exists.
- Malformed JSON, an oversized body or a wrong Content-Type returns a 400 or 413 with `{error}`, not a 500 and not a stack trace.
- Benchmarks compare like with like: same rows, warm cache stated, same page size, median and p95 reported with run count.

## Decisions (all made by WH, 2026-11-03)

| #   | Decision                                                                               | Outcome                                                                                                                   |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| D1  | Does changing the image of an APPROVED title send it back to PENDING?                  | **Yes**, same as editing the name. Closes the moderation bypass (Task 3).                                                 |
| D2  | When does the trending refresh run?                                                    | **A timer in `server.ts`** (default 10 min, `TRENDING_REFRESH_MINUTES`, `0` turns it off) plus the existing CLI (Task 7). |
| D3  | Does the `{rating}` Mongo index stay on the task list?                                 | **Dropped**: ratings live in PostgreSQL. Documentation change only (Task 14).                                             |
| D4  | Keep the imported review extras (review year, publication name, summary, helpfulness)? | **Removed** from the ETL, the model and the stored data (Task 2b). A review is a star rating and text, all the way down.  |
| D5  | Window for "recent" trending on dev data                                               | **Query param `days`, default 1460**, so the 2022–2025 import shows up. Real activity dominates once it exists (Task 9).  |

Work from here is committed on a new branch `feat/remaining-work`, stacked on `feat/web-wire-writes`, so no pushed or shared branch is rewritten.

## File Structure

- Create `apps/api/src/modules/reviewStats/` (`reviewStats.schema.ts`, `.service.ts`, `.routes.ts`): Mongo aggregation endpoints.
- Create `apps/api/src/modules/titles/ranking.service.ts` plus a migration for the window-function view or query.
- Modify `apps/api/src/jobs/refreshTrending.ts` (recent counts, swap-not-wipe), `apps/api/src/server.ts` (timer), `apps/api/src/app.ts` (JSON error handling), `apps/api/src/modules/posters/posters.{routes,service}.ts` (owner access, re-moderation).
- Create `apps/api/src/jobs/cleanupOrphans.ts`: removes Mongo documents whose PostgreSQL parent is gone.
- Create `benchmarks/scenarios/*.ts`, `benchmarks/run.ts`, `benchmarks/results/*.md`.
- Create `apps/api/tests/real/` + `apps/api/vitest.real.config.ts`; modify `.github/workflows/ci.yml` (needs a yes).
- Create `docs/user-manual.md`, `docs/demo-script.md`, `docs/report-outline.md`.

---

## Phase A: Land what exists (day 1)

### Task 1: Open the three PRs

**Files:** none changed; `git`/`gh` only.

**Interfaces:** Consumes the branch stack `feat/title-details` → `refactor/review-body-details` → `feat/web-wire-writes`. Produces three PRs, each based on the one before.

- [ ] **Step 1:** Ask WH to confirm pushing. Do not push before the yes.
- [ ] **Step 2:** `git push -u origin feat/title-details refactor/review-body-details feat/web-wire-writes`.
- [ ] **Step 3:** `gh pr create` three times (`--base main`, then base = previous branch). Titles: "feat: title detail tables and posters", "refactor: reviews are a star rating and text for every media type", "feat: web writes, creator uploads and admin approval". No attribution lines.
- [ ] **Step 4:** In the review-body PR description, ask HS and JW for sign-off (TASKS.md §5).
- [ ] **Step 5:** Run `git log --oneline origin/main..HEAD | wc -l` and record the three PR numbers in `STATE.md`.

---

## Phase B: Close the small gaps in the creator flow (days 1–3)

### Task 2b: Remove the imported review extras (WH), D4

**Files:** Modify `data/etl/clean-reviews.ts` (drop `details` and `cleanDetails`), `data/etl/load-mongo-reviews.ts` (stop writing it), `apps/api/src/mongo/models/reviewBody.model.ts` (drop the field, fix the comment), `ARCHITECTURE.md`, `TASKS.md` §5, `docs/eraser-diagrams.md`, `data/etl/README.md`; Eraser MongoDB diagram `hgzGFlMuxezB-AnS_Q6_`.

**Interfaces:** `ReviewBody` becomes `{_id, titleId, userId, mediaType, body, createdAt, updatedAt}`. The loader's row type has no `details`.

- [ ] **Step 1:** Search every use of `details` on review bodies (ETL, model, tests, docs, diagram). Only the ETL and the model touch it in code.
- [ ] **Step 2:** Edit the ETL and the model. A test: a body written by `createReview` has no `details` key; the loader maps a JSONL row without it.
- [ ] **Step 3:** Run `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] **Step 4:** Count first: `countDocuments({details: {$exists: true}})` should be about 13,490. After WH confirms, run `updateMany({}, {$unset: {details: ''}})` and check the count is 0 and the total is unchanged.
- [ ] **Step 5:** Update the docs and the Eraser diagram. Commit `refactor: review bodies drop the imported extras`.

### Task 2: Owner and admin can see a PENDING title's image (WH)

**Files:** Modify `apps/api/src/modules/posters/posters.{routes,service}.ts`; Test `apps/api/tests/integration/posters.test.ts`.

**Interfaces:** Produces `getPoster(user: AuthUser | undefined, titleId: string)` returning the same `{contentType, data, version}`. `GET /titles/:titleId/poster` uses an optional-auth middleware (reads the cookie if present, never 401s).

- [ ] **Step 1:** Write failing tests: `serves_a_pending_poster_to_its_creator`, `serves_a_pending_poster_to_an_admin`, `404s_a_pending_poster_for_a_stranger`, `404s_a_pending_poster_for_a_signed_out_visitor`, `still_serves_approved_posters_to_everyone`.
- [ ] **Step 2:** Run `npm test --workspace apps/api -- posters`. Expected: the first two FAIL.
- [ ] **Step 3:** Implement the optional-auth read and the owner/admin check in `getPoster`. A pending poster for anyone else answers the same 404 as a missing one. A non-public response sends `Cache-Control: private, no-cache`, never the year-long public header.
- [ ] **Step 4:** Mutation-check: allow every user through; the stranger test must fail. Restore.
- [ ] **Step 5:** Commit `fix(api): the creator and admins can see the image of a pending title`.

### Task 3: An image change on an approved title is re-moderated (WH, JW), needs D1

**Files:** Modify `apps/api/src/modules/posters/posters.service.ts` (`putPoster`, `deletePoster`); Test `posters.test.ts`, `submissions.test.ts`; Web: `apps/web/src/pages/creator/SubmissionForm.tsx` hint text.

**Interfaces:** `putPoster` / `deletePoster` by the owner CREATOR on an APPROVED or REJECTED title set `status = PENDING` and clear `rejectionReason` in the same transaction that bumps the poster version.

- [ ] **Step 1:** Failing tests: `replacing_the_image_of_an_approved_title_sets_it_pending`, `removing_the_image_sets_it_pending`, `an_admin_uploading_does_not_change_status`, `a_pending_title_stays_pending`.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement with `lockTitle(tx, id)` first, like the other title writes. **Step 4:** Mutation-check and restore.
- [ ] **Step 5:** Web: the edit form tells the creator "Changing the image sends this title back for approval". Web test for the text. Run `npm test --workspace apps/web`.
- [ ] **Step 6:** Commit `fix: changing a title's image sends it back for approval`.

### Task 4: Delete button in the creator UI (WH)

**Files:** Modify `apps/web/src/pages/creator/CreatorDashboard.tsx`, `apps/web/src/api/creator.ts` (add `creatorApi.remove(id)`: real `DELETE /titles/:id`, mock removes locally); Test `Creator.test.tsx`, `real.test.ts`.

- [ ] **Step 1:** Failing tests: confirm dialog shown before delete; success removes the row; a 409 shows the server message ("Other users have reviewed or listed this title…") and keeps the row; real-mode test asserts `DELETE /titles/:id`.
- [ ] **Step 2:** Implement with a confirm step (no one-click delete). **Step 3:** Run web tests, `npm run typecheck`, `npm run lint`. **Step 4:** Commit `feat(web): creators can delete their own title`.

### Task 5: Malformed JSON answers 400 (WH)

**Files:** Modify `apps/api/src/middleware/errorHandler.ts`; Test `apps/api/tests/integration/health.test.ts` (or a new `errors.test.ts`).

- [ ] **Step 1:** Failing tests: `POST /api/auth/login` with body `{bad` → 400 `{error: 'Invalid JSON'}`; body over the limit → 413 `{error: 'Request body too large'}`; unknown route → 404 `{error: 'Not found'}`.
- [ ] **Step 2:** In `errorHandler`, map body-parser errors by `err.type` (`entity.parse.failed`, `entity.too.large`) before the 500 fallback; add a final 404 handler in `app.ts`. Never echo `err.message` of unknown errors.
- [ ] **Step 3:** Run API tests; commit `fix(api): malformed JSON answers 400, not 500`.

### Task 6: Clean up Mongo leftovers whose parent is gone (HS)

**Files:** Create `apps/api/src/jobs/cleanupOrphans.ts`; Test `apps/api/tests/unit/cleanupOrphans.test.ts`.

**Interfaces:** Produces `cleanupOrphans(): Promise<{ reviewBodies: number; replies: number }>`: deletes `ReviewBody` whose `_id` is not in `Review`, then `Reply` whose `reviewId` is not in `Review`. Batches of 1,000 ids; never loads the whole collection.

- [ ] **Step 1:** Tests with stubs: removes bodies with no header row; removes replies with no review; leaves live ones; running twice returns zeros the second time; a Prisma failure deletes nothing.
- [ ] **Step 2:** Implement; add CLI guard like `refreshTrending.ts`. **Step 3:** Run it against real databases after creating one fake orphan body and one fake orphan reply; expect `{1, 1}`. This also covers the reply-posted-during-review-delete race in TASKS §12 and (as a side effect) user-delete leftovers once RA builds it.
- [ ] **Step 4:** Commit `feat(api): a job that removes Mongo documents whose review is gone`.

---

## Phase C: The database-course showpieces (days 3–10)

### Task 7: Trending refresh is scheduled and safe (SJ lead, HS), needs D2

**Files:** Modify `apps/api/src/jobs/refreshTrending.ts`, `apps/api/src/server.ts`, `apps/api/src/config/env.ts`; Test `apps/api/tests/unit/refreshTrending.test.ts`.

**Interfaces:** `startTrendingTimer(minutes: number): () => void` returns a stop function. `refreshTrending()` keeps its `RefreshResult`.

- [ ] **Step 1:** Failing tests: the timer calls the job at the interval and stops on the returned function; a job that throws is logged and the timer keeps running; two ticks never overlap (a second tick is skipped while one is running); an empty view leaves the existing cards in place and logs a warning (resolves the TASKS §12 item).
- [ ] **Step 2:** Implement the overlap guard and the empty-view guard. **Step 3:** Env: `TRENDING_REFRESH_MINUTES` (default 10, `0` disables); tests run with it off. Update `.env.example` (ask first; it is a config file).
- [ ] **Step 4:** Run against the real databases; confirm cards still appear during a refresh (poll `GET /api/trending` while it runs). **Step 5:** Commit.

### Task 8: MongoDB aggregation pipelines (HS lead, SJ), needs D5

**Files:** Create `apps/api/src/modules/reviewStats/*`; modify `apps/api/src/routes.ts`; Test `apps/api/tests/integration/reviewStats.test.ts`; Docs `docs/api.md`.

**Interfaces:**

- `GET /api/titles/:titleId/review-activity?months=12` → `{ data: { month: 'YYYY-MM', reviews: number, avgBodyLength: number }[] }`. Pipeline: `$match {titleId}` → `$group` by `$dateToString` month with `$sum` and `$avg: {$strLenCP: '$body'}` → `$sort` ascending. Only for APPROVED titles (checked in PostgreSQL first, 404 otherwise). Gaps in the months are filled with zeros in the service.
- `GET /api/reviews/top-reviewers?type=&limit=10` → `{ data: { userId, name, reviews, replies }[] }`. Pipeline: `$match {mediaType}` → `$group` by `userId` → `$sort`/`$limit` → `$lookup` from `replies` on `userId` counting replies → names fetched from PostgreSQL in one `findMany`. Admin and deleted users excluded; `limit` max 50.
- Exports `recentReviewCounts(days: number): Promise<Map<string, number>>` (`$match {createdAt: {$gte}}` → `$group` by `titleId`), used by Task 9.

- [ ] **Step 1:** Failing tests for each route: happy path shape, zero-fill, empty title → 200 with empty-or-zero series, unapproved title → 404, bad `months`/`limit` → 400, `limit` clamped at 50.
- [ ] **Step 2:** Implement with Mongoose `aggregate()`; keep the pipeline arrays as named constants so the report can quote them.
- [ ] **Step 3:** Run both against the real Mongo; save `explain("executionStats")` output for each pipeline in `benchmarks/results/pipelines.md` (index used, docs examined). Add the index `{ mediaType: 1, userId: 1 }` only if the explain shows a collection scan that matters.
- [ ] **Step 4:** Mutation-check the APPROVED guard. **Step 5:** Commit `feat(api): review activity and top reviewers from MongoDB aggregation pipelines`.

### Task 9: Time-windowed trending (SJ)

**Files:** Modify `apps/api/src/jobs/refreshTrending.ts`, `trendingCard.model.ts` (add `recentReviews: Number, default 0`), `packages/shared/src/dto/index.ts` (`TrendingCardDTO.recentReviews`), `trending.schema.ts` (`days`, `sort=score|recent`), `trending.service.ts`.

**Interfaces:** the job calls `recentReviewCounts(windowDays)` from Task 8 and stores the count on each card. `GET /api/trending?sort=recent` orders by `recentReviews` desc, then `score`, then `titleId`.

- [ ] **Step 1:** Failing tests: cards carry `recentReviews`; `sort=recent` orders correctly with ties broken on `titleId`; a window with no reviews gives 0, not `NaN`; `days` outside 1–3650 → 400.
- [ ] **Step 2:** Implement. The old cards without the field read as 0 (`default: 0` in the schema and `?? 0` in the DTO mapper). **Step 3:** Run the job on the real data and check the top 5 against a hand-written SQL count. **Step 4:** Commit.

### Task 10: SQL window-function query (SJ, JW)

**Files:** Create `apps/api/prisma/migrations/<ts>_title_rank_view/migration.sql`; modify `apps/api/src/modules/titles/titles.{schema,routes,service}.ts` or a new `ranking` module; Test `apps/api/tests/integration/titles.test.ts`.

**Interfaces:** a **materialized view** `title_rank_in_type(title_id, "mediaType", trending_score, rank_in_type, pct_rank)` over `trending_titles`, using `RANK() OVER (PARTITION BY "mediaType" ORDER BY trending_score DESC, id)` and `PERCENT_RANK() OVER (...)`, with a unique index on `title_id`. A plain view would re-aggregate every review and re-rank every title on each title-page request; the materialized view makes the page a single indexed lookup. `refreshTitleRanks()` runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` and is called by the trending job after the cards are written, so ranks are at most one refresh interval (10 min) old. `GET /api/titles/:id` adds `rankInType: number | null` and `topPercent: number | null` (null for titles not in the view, such as titles with no reviews).

- [ ] **Step 1:** Failing tests: detail response carries both fields; a title below the review threshold returns `null`; shared DTO and web `TitleDetail` type updated (web test shows "#3 in Movies" on the detail page).
- [ ] **Step 2:** Write the migration (do not use `prisma migrate reset`); apply with `prisma migrate deploy` to the local database only. **Step 3:** `EXPLAIN ANALYZE` the single-title lookup (must be an index scan on `title_id`) and time the refresh on the dev set; record both for the report, with a note that the plain-view alternative was rejected because it re-ranks every title per request.
- [ ] **Step 4:** Web: show the rank on the title page. **Step 5:** Commit.

### Task 11: `EXPLAIN ANALYZE` and indexes on every heavy query (SJ)

**Files:** Create `benchmarks/results/explain.md`; a migration only if a measured index helps.

- [ ] **Step 1:** List the heavy queries: `GET /titles` for each `sort` and filter, the genre options, `trending_titles`, `creator_title_stats`, the review list, `title_rank_in_type`.
- [ ] **Step 2:** For each, run `EXPLAIN (ANALYZE, BUFFERS)` on the dev set and again on the full 950k set (Task 12 loads it). Paste the plan summaries and times into `explain.md`.
- [ ] **Step 3:** Add an index only where a sequential scan costs measurable time; record before/after. Check `pg_trgm` for `ILIKE` only if search takes more than 100 ms on 950k rows (TASKS §6).
- [ ] **Step 4:** Commit the results and any migration.

### Task 12: Benchmarks, SQL against NoSQL (SJ lead, HS)

**Files:** Create `benchmarks/scenarios/{reviews-for-title,top-n-trending,insert-review,replies-of-review,filtered-browse}.ts`, `benchmarks/run.ts`, `benchmarks/loadtest.md`; modify `benchmarks/README.md` (the "nested comment read" line is out of date: replies are flat).

**Interfaces:** each scenario exports `{ name, sql(): Promise<void>, mongo(): Promise<void>, setup?(), teardown?() }`. `run.ts` takes `--runs 200 --warmup 20`, prints median, p95 and max in ms, and writes `benchmarks/results/<date>.md` and `.csv`.

- [ ] **Step 1:** Fix the fairness rules in `benchmarks/README.md`: same logical rows, same page size, warm-up discarded, cold-cache run labelled separately, single connection pool size stated.
- [ ] **Step 2:** The comparison needs the same data in both stores. Reviews and replies already exist in Mongo; `setup()` copies the review text into a throwaway PostgreSQL table `bench_review_text(id, titleId, userId, body, createdAt)` indexed the same way. `teardown()` drops it. It never touches app tables.
- [ ] **Step 3:** Implement the five scenarios. Insert uses a unique prefix and deletes its rows afterwards.
- [ ] **Step 4:** Load the full 950k set into a separate `bingemate_bench` database and Mongo db (never the dev one). Document the load commands.
- [ ] **Step 5:** Run twice, check the numbers agree within noise, then commit results. Add API load tests with `npx autocannon -c 20 -d 15` on `GET /api/titles`, `GET /api/trending` and `GET /api/titles/:id/reviews`; record requests/sec and p99 in `loadtest.md`.
- [ ] **Step 6:** Write a plain conclusion per scenario (which store wins and why). If PostgreSQL wins a scenario, say so.

---

## Phase D: Quality, CI and housekeeping (days 8–12)

### Task 13: CI runs real PostgreSQL and MongoDB (ALL), needs a yes to edit the workflow

**Files:** Create `apps/api/vitest.real.config.ts`, `apps/api/tests/real/{views,reviews,submissions}.real.test.ts`; modify `.github/workflows/ci.yml`, `apps/api/package.json` (`test:real`).

- [ ] **Step 1:** Ask WH before touching the workflow or `package.json`.
- [ ] **Step 2:** Tests: apply migrations to an empty database, load 20 fixture titles, assert each view's rows (`title_rating_stats` rounding of 41 stars over 40 reviews gives 1.03; `trending_titles` ordering); create a review (header in PG, body in Mongo, same id); creator delete removes the Mongo body; the delete-vs-list lock test from `1ed21ed` against a real database.
- [ ] **Step 3:** Workflow: add `services: postgres:16-alpine` and `mongo:7` with health checks, `prisma migrate deploy`, then `npm run test:real --workspace apps/api`. Keep the existing stubbed job unchanged.
- [ ] **Step 4:** Run locally with `docker compose up -d`; push a branch and confirm the CI run is green before relying on it.

### Task 14: Housekeeping (WH)

**Files:** `apps/api/prisma/seed.ts`, `apps/api/src/utils/pagination.ts`, `docs/architecture.svg`, `docs/eraser-diagrams.md`, `TASKS.md`.

- [ ] **Step 1:** `npx prettier --write` the two files; run the suite; commit separately from behaviour changes. Decide with the team whether CI runs `format:check`.
- [ ] **Step 2:** Update `architecture.svg` (remove the global rate limit and auth pipeline the code does not have; show the cross-store review write and the trending job). Decide whether to keep Eraser links in the repo.
- [ ] **Step 3:** Sync `TASKS.md`: tick what is tested, drop the `{rating}` index (D3), record D1–D5. Update `docs/api.md`.
- [ ] **Step 4:** Tidy the repeated helpers (title id param schema, admin-cannot-write check, page/pageSize schema) and convert `titles.routes.ts` to `route()`. Do this last and only if the tests stay green; skip it if time is short.

### Task 15: Click-through the creator and admin flows in a real browser (WH)

**Files:** Create `docs/manual-test-checklist.md`.

- [ ] **Step 1:** Start the stack (`VITE_USE_MOCKS=false`). With `creator@bingemate.dev`: create a title with an image, see it as PENDING with the image (Task 2), edit it, delete it. With `admin@bingemate.dev`: confirm no Creator link, approve, reject with a reason, hit the stale-version message from two tabs. With a consumer account: review, edit, reply, list.
- [ ] **Step 2:** Record pass or fail per line, with screenshots for the report. File a bug (or fix via Codex) for each failure.

---

## Phase E: Deliverables (start day 6, finish by 24 Nov)

### Task 16: User manual, demo script and report skeleton (WH drafts; everyone writes their own section)

**Files:** Create `docs/user-manual.md`, `docs/demo-script.md`, `docs/report-outline.md`.

- [ ] **Step 1:** User manual from the README and the click-through: setup (Docker, migrate, load, run), accounts, a section per role (visitor, user, creator, admin), troubleshooting.
- [ ] **Step 2:** Demo script, 10 minutes with every member speaking: one timed segment per person (who shows what, on which account, what to click, what the database shows underneath).
- [ ] **Step 3:** Report outline (10 pages maximum): problem, ER diagrams (both stores), the cross-store review decision and its failure handling, the views and the window-function query, the aggregation pipelines with explain output, benchmarks and conclusions, testing, limits. One page budget per section, one named author per section.
- [ ] **Step 4:** Slides (.pptx) after the report is stable; the zip of source plus manual; peer review submitted by each member on their own. These are not code and not delegated.

---

## Order and Dates

| When      | Tasks                                                                           |
| --------- | ------------------------------------------------------------------------------- |
| 3–5 Nov   | 1, 2, 3, 4, 5                                                                   |
| 5–9 Nov   | 6, 7, 8                                                                         |
| 9–14 Nov  | 9, 10, 11, 12 (12 starts the full-set load early; it runs overnight)            |
| 12–18 Nov | 13, 14, 15                                                                      |
| 6–24 Nov  | 16 (drafts alongside)                                                           |
| 24–28 Nov | Freeze code, record video, final report, zip, peer review. Buffer day on 28 Nov |

Tasks 2–6 are independent and can go to Codex in sequence the same day. Tasks 8 → 9 are ordered (9 uses 8's helper). Task 12 needs Task 8 for the Mongo side and benefits from Task 11 first.

## Self-Review Notes

- Spec coverage: relational (views, window function, transactions, EXPLAIN, indexes), NoSQL (aggregation pipelines, `$lookup`, TTL-free denormalised cards, benchmarks), report, slides, video, manual and peer review are each in a task. Admin/user management is RA's and is excluded.
- Types: `recentReviewCounts` (Task 8) is the only cross-task function; Task 9 uses the same name and signature. `recentReviews` is added to the model, shared DTO and mapper together in Task 9.
- Risk: Task 12's full load of 950k titles is the longest-running step. Start it first on the day it begins.
