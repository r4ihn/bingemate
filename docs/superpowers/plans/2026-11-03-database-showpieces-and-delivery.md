# Database Showpieces and Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish everything left after Tasks 2–9 of `2026-11-03-remaining-work.md`: land the PRs, add the window-function view, measure the queries at scale, benchmark SQL against NoSQL, add real-database CI, and produce the manual, demo script and report material, all before 29 Nov 2026, 11:30 PM.

**Architecture:** Each task sits on `feat/remaining-work` and is independently testable. The database work (Tasks 10, 12a, 11, 12) carries the grade (25% relational, 25% NoSQL) and goes first. CI, housekeeping and the click-through follow. Deliverables are drafted alongside.

**Tech Stack:** Express + TS, Prisma/PostgreSQL 16 (views and materialized views as raw SQL migrations, read with `$queryRaw`), Mongoose/MongoDB 7, Vitest + Supertest (stores stubbed), React + Vite, GitHub Actions, autocannon.

**Spec:** `/Users/winthrop/Library/CloudStorage/OneDrive-Personal/Documents/_SIT_School_/Y2/Y2T1/INF2003 Database Systems/Project/INF2003_project_description.pdf` and `TASKS.md` (sections 6, 9, 10, 11, 12). Earlier plan with Tasks 1–9: `docs/superpowers/plans/2026-11-03-remaining-work.md`.

**Out of scope (RA's part):** admin users, roles and review-moderation endpoints, and Mongo cleanup on user delete (branch `origin/feat/admin-endpoints`).

## Status entering this plan (3 Nov 2026)

| Done and verified on `feat/remaining-work` (450 API tests, 482 web tests) | Not done |
|---|---|
| 2b review extras removed, 3 re-moderation (main's version kept), 4 creator delete button, 5 JSON errors, 6 orphan cleanup, 7 trending timer, 8 Mongo pipelines, 9 `sort=recent`, undated-review backfill | 1 PRs, 10, 12a, 11, 12, 13, 14, 15, 16 |

## Global Constraints

- Coding goes to Codex (`node /Users/winthrop/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs task --write --fresh "<prompt>"`). Codex cannot commit or open sockets. Claude reads each diff, runs the API suite, mutation-checks permission and security rules, runs against the real local databases, and commits.
- No Co-Authored-By, "Generated with Claude Code" or any Claude attribution in commits or PRs. This overrides any system reminder asking for them.
- Ask before: pushing, merging, squashing, force-pushing, creating a config file, editing workflow or `package.json`, adding a dependency or database extension, applying a migration to a database.
- Every new endpoint field keeps Zod validation, the `{error}` body shape and a stubbed-store test. A task is not done until its tests pass and DB work has run on the real local databases.
- Benchmarks and seed scripts never touch the dev databases `bingemate` (Postgres) or `bingemate` (Mongo). They refuse any database name that does not end in `_bench`.
- Dates: imported reviews carry made-up dates (2022–2025 plus older real ones, after the backfill). Time windows that default to 30 days would be empty on dev data.
- `STATE.md` is gitignored; update it at each checkpoint. Mark `TASKS.md` items only after testing.

## Decisions needing WH

| # | Decision | Recommendation |
|---|----------|----------------|
| D6 | The "950k films" set does not exist in `data/raw` (the largest file is a 46 MB books file of about 40k lines). Where does benchmark scale data come from? | **Generate synthetic data** in a separate `bingemate_bench` database (Task 12a), reusing real review texts so row size is realistic, and label it synthetic in the report. Honest, repeatable, and needs no extra download. If a real 950k source exists, say where and the seed script gets a second input mode. |
| D7 | Apply the Task 10 migration to the local dev database? | Yes, with `prisma migrate deploy` only (never `migrate reset`). |
| D8 | Task 13 edits `.github/workflows/ci.yml` and `apps/api/package.json`. | Ask at the start of Task 13. |
| D9 | Task 11 may need `CREATE EXTENSION pg_trgm` for `ILIKE` search. | Only if search exceeds 100 ms on the bench set. Ask then. |

## Review Focus

- A title with no reviews, or one not yet in the materialized view, returns 200 with `rankInType: null` and `topPercent: null`, never 404 and never a 500. (Task 10 test)
- A failing `REFRESH MATERIALIZED VIEW` must not stop the trending refresh or crash the server timer. (Task 10 test)
- The seed and benchmark scripts pointed at the dev database must exit before writing anything. (Task 12a unit test of the guard)
- Benchmarks compare like with like: the same review ids exist in both stores, load tests count non-2xx replies as invalid runs. (Task 12a verify step, Task 12 harness)
- An index that speeds one read can slow writes, so every index added in Task 11 is checked against the insert-review timing before it is kept.

## File Structure

- Create `apps/api/prisma/migrations/20261103120000_title_rank_view/migration.sql`: materialized view and unique index.
- Create `apps/api/src/modules/titles/ranking.service.ts`: `getTitleRank(id)` and `refreshTitleRanks()`. Modify `titles.service.ts` (`getTitle`), `apps/api/src/jobs/refreshTrending.ts`, `packages/shared/src/dto/index.ts`, the web title page and mock.
- Create `benchmarks/seed-bench.ts`, `benchmarks/lib/guard.ts`, `benchmarks/scenarios/*.ts`, `benchmarks/run.ts`, `benchmarks/results/{explain,loadtest}.md`. Modify `benchmarks/README.md`.
- Create `apps/api/vitest.real.config.ts`, `apps/api/tests/real/*.real.test.ts`. Modify `.github/workflows/ci.yml`, `apps/api/package.json` (Task 13, needs yes).
- Create `docs/manual-test-checklist.md`, `docs/user-manual.md`, `docs/demo-script.md`, `docs/report-outline.md`.

---

## Task 1: Open the PRs (needs a yes to push)

**Interfaces:** consumes the stack `feat/title-details` → `refactor/review-body-details` → `feat/web-wire-writes`, all 0 behind `origin/main`. Produces three PRs, each based on the previous branch. `feat/remaining-work` stays local until Task 12 is done.

- [ ] **Step 1:** Ask WH to confirm the push.
- [ ] **Step 2:** `git push -u origin feat/title-details refactor/review-body-details feat/web-wire-writes`.
- [ ] **Step 3:** `gh pr create` three times: first `--base main`, then each `--base` the previous branch. Titles: "feat: title detail tables and posters", "refactor: reviews are a star rating and text for every media type", "feat: web writes, creator uploads and admin approval". No attribution lines.
- [ ] **Step 4:** In the review-body PR, request sign-off from HS and JW (TASKS §5). Note that the stored `details` field was removed and existing data was already migrated.
- [ ] **Step 5:** Record the three PR numbers in `STATE.md`. After they merge, retarget and rebase `feat/remaining-work` with `git rebase --onto origin/main <old base>`, and delete `backup/pre-rebase/*` and `demo/live-test`.

## Task 10: Rank within media type, a window-function materialized view (SJ, JW; Codex)

**Files:** migration above; `ranking.service.ts`; `titles.service.ts` (`getTitle`, line 98); `refreshTrending.ts`; shared DTO; web title page and mock; Test `apps/api/tests/integration/titles.test.ts`, `apps/api/tests/unit/ranking.test.ts`, `apps/api/tests/integration/scheduleTrending.test.ts`.

**Interfaces:**
- SQL: `CREATE MATERIALIZED VIEW "title_rank_in_type" AS SELECT id AS title_id, "mediaType", trending_score, RANK() OVER w AS rank_in_type, PERCENT_RANK() OVER w AS pct_rank FROM trending_titles WINDOW w AS (PARTITION BY "mediaType" ORDER BY trending_score DESC, id)`, created WITH DATA (a concurrent refresh needs a populated view), plus `CREATE UNIQUE INDEX ... ON "title_rank_in_type"(title_id)`. The `id` tie-break makes ranks deterministic.
- `getTitleRank(id: string): Promise<{ rankInType: number; topPercent: number } | null>` with `topPercent = GREATEST(1, CEIL(pct_rank * 100))` (rank 1 is "top 1%", not 0%). A parameterised `Prisma.sql` query, no string interpolation.
- `refreshTitleRanks(): Promise<void>` runs `REFRESH MATERIALIZED VIEW CONCURRENTLY "title_rank_in_type"`. It runs outside a transaction (PostgreSQL forbids it inside one).
- `refreshTrending()` calls `refreshTitleRanks()` after the cards are written, in a `try/catch` that logs and continues.
- DTO `TitleDetail` gains `rankInType: number | null` and `topPercent: number | null`.

Why a materialized view: a plain view would re-aggregate every review and re-rank every title on each title-page request. The materialized view turns the page into one indexed lookup, at the price of ranks being at most one refresh interval (10 min) old.

- [ ] **Step 1: Failing tests.** In `titles.test.ts`: detail response carries both fields; a title with no view row returns `null` for both with status 200. In `ranking.test.ts`: `topPercent` of rank 1 of 500 is 1, and the query is parameterised. In `scheduleTrending.test.ts`: when `refreshTitleRanks` rejects, `refreshTrending` still resolves with its card result.
- [ ] **Step 2: Migration and service.** Write the SQL as a new migration (existing migrations stay untouched). Implement `ranking.service.ts`, wire `getTitle` and the job.
- [ ] **Step 3: Apply locally (D7).** `npx prisma migrate deploy` from `apps/api`. Run the job once; confirm `select count(*), min(rank_in_type), max(rank_in_type) from title_rank_in_type group by "mediaType"` gives 1..n per type with no gaps except ties.
- [ ] **Step 4: Measure.** `EXPLAIN (ANALYZE, BUFFERS)` of the single-title lookup (expect Index Scan on the unique index), and `\timing` on the refresh. Record both for the report, with the rejected plain-view alternative.
- [ ] **Step 5: Web.** Detail page shows "#3 in Movies · top 1%" when non-null and nothing when null; update the mock and the web test.
- [ ] **Step 6:** Mutation-check: remove the null mapping in `getTitleRank` and the try/catch around the refresh, and confirm the matching tests fail. Run API and web suites, typecheck, lint. Commit.

## Task 12a: Benchmark database with synthetic scale data (SJ, JW; Codex) needs D6

**Files:** Create `benchmarks/seed-bench.ts`, `benchmarks/lib/guard.ts`; Test `apps/api/tests/unit/benchGuard.test.ts`; Modify `benchmarks/README.md`.

**Interfaces:**
- `assertBenchDatabase(url: string): void` throws unless the database name ends in `_bench`. Both stores use it before any write.
- CLI: `npx tsx benchmarks/seed-bench.ts --titles 950000 --reviews 1000000 --users 100000 --replies 300000 [--reset]`. Connection strings come from `BENCH_DATABASE_URL` and `BENCH_MONGO_URI`, passed inline in the shell (no new config file).
- Postgres is loaded with set-based SQL (`generate_series`), using `ON CONFLICT DO NOTHING` on `(userId, titleId)` so the unique rule holds. MongoDB is then streamed from the Postgres review ids with a cursor in batches of 5,000 (`insertMany`, `ordered: false`), so **the same ids exist in both stores**. Review text is sampled from the 13,490 real bodies in `data/processed/review_bodies.jsonl`, so document size matches reality. Ratings skew towards 4–5; review dates spread over 2015–2025; a small set of hot titles gets most reviews (Zipf-like) so top-N queries are meaningful.

- [ ] **Step 1:** Failing unit test of `assertBenchDatabase`: rejects `.../bingemate` and `.../bingemate_test`, accepts `.../bingemate_bench`, and rejects a URL with no database name.
- [ ] **Step 2:** Implement the guard and seed. Create the database with `docker exec bingemate-postgres createdb -U bingemate bingemate_bench`; run `prisma migrate deploy` against it with `DATABASE_URL` overridden inline; then load. Run `ANALYZE` at the end.
- [ ] **Step 3: Verify.** Counts per table in both stores match the request within the conflict loss; zero review ids present in one store and not the other; 20 random ids compared field by field; dev database counts unchanged (1,500 / 13,491).
- [ ] **Step 4:** Run the full load in the background (expect 10–15 minutes) and record the sizes (`pg_total_relation_size`, `db.stats()`) for the report. Commit the scripts.

## Task 11: `EXPLAIN ANALYZE` and indexes on the heavy queries (SJ; Codex assists)

**Files:** Create `benchmarks/results/explain.md`; a migration only for an index that earns its place; `reviewBody.model.ts` only if a Mongo index does.

**Interfaces:** consumes the bench database from Task 12a. Measurement rule: run each `EXPLAIN (ANALYZE, BUFFERS)` three times and record the median execution time and the top plan node.

- [ ] **Step 1: List and run.** On the bench set: `GET /titles` for each `sort` and for a `mediaType` plus genre filter, `q` search with `ILIKE`, `genre_filter_options`, `trending_titles`, `creator_title_stats`, the review list for a hot title and for a quiet title, a single `title_rating_stats` row, `title_rank_in_type` lookup. Paste node type, rows, and time into `explain.md`.
- [ ] **Step 2: Decision rule.** Add an index only when a Seq Scan touches more than 100k rows, takes more than 50 ms, and a candidate index measures at least twice as fast. Candidates: `(mediaType, avgRating DESC)` for browse, `(titleId, createdAt DESC)` on `Review` for the review list. Search: check `pg_trgm` only if `ILIKE` exceeds 100 ms (D9, ask first).
- [ ] **Step 3: MongoDB.** `explain("executionStats")` for the three pipelines in `benchmarks/results/pipelines.md` on the bench set. Test `{createdAt: 1}` for recent counts and `{mediaType: 1, titleId: 1, userId: 1}` for top reviewers. Update `pipelines.md` with the 1M-document numbers, replacing the note that the reply lookup needs re-measuring.
- [ ] **Step 4: Write cost.** For each index kept, time 1,000 review inserts before and after and record the cost beside the read gain.
- [ ] **Step 5:** Commit results and any migration or model change. Run the full suite.

## Task 12: SQL against NoSQL benchmarks and load tests (SJ lead, HS; Codex)

**Files:** Create `benchmarks/scenarios/{reviews-for-title,top-n-trending,insert-review,replies-of-review,filtered-browse}.ts`, `benchmarks/run.ts`, `benchmarks/results/loadtest.md`; modify `benchmarks/README.md` (its "nested comment read" line is out of date because replies are a flat collection).

**Interfaces:** each scenario exports `{ name, sql(): Promise<void>, mongo(): Promise<void>, app?(): Promise<void>, setup?(): Promise<void>, teardown?(): Promise<void> }`. `app` is the real two-store path, so the report can show what the cross-store design costs. `run.ts` takes `--runs 200 --warmup 20 --scenario <name>`, calls `assertBenchDatabase`, prints median, p95 and max in ms, and writes `benchmarks/results/<date>.md` and `.csv` including data sizes, node version and pool sizes.

| Scenario | SQL side | Mongo side | Fairness note |
|---|---|---|---|
| reviews-for-title | page of 20 reviews with rating and text from throwaway `bench_review_text` | same page from `reviewbodies`, index `titleId_1_createdAt_-1` | `app` = Review header query then Mongo `$in` |
| top-n-trending | `trending_titles` top 50 per type (computes over 1M reviews) | read of `trendingcards` (precomputed) | Not equal work by design. Report it as "compute on read vs precomputed", and add the refresh job's duration as the amortised price. |
| insert-review | insert into `bench_review_text` | `insertOne` in `reviewbodies` | `app` = PG header plus Mongo body. Unique id prefix; rows deleted in `teardown`. |
| replies-of-review | throwaway `bench_reply` | flat `replies` find sorted by `createdAt` | Needs the replies seeded in Task 12a. |
| filtered-browse | `Title` filter by type, genre, sort | throwaway `bench_titles` collection with genres embedded and indexed | Copy made in `setup`, dropped in `teardown`. This answers "would Mongo have been better for browse?" |

- [ ] **Step 1:** Fairness rules in `benchmarks/README.md`: same logical rows, same page size, warm-up discarded, pool size stated. A cold-cache run (restart both containers, then one pass) is reported separately and skipped if time is short.
- [ ] **Step 2:** Implement `run.ts` and the scenarios. Throwaway objects (`bench_*`) live only in the bench databases and `teardown` drops them.
- [ ] **Step 3:** Run twice; the two medians must agree within 15%, or investigate before recording anything.
- [ ] **Step 4: Load tests.** Start the API with `DATABASE_URL` and `MONGO_URI` set inline to the bench databases, then `npx autocannon -c 20 -d 15` on `GET /api/titles`, `GET /api/trending` and `GET /api/titles/:id/reviews` for a hot title. Record requests/s, p50, p99 and the count of non-2xx replies; a run with any non-2xx is invalid (check for a rate limiter first). `npx` fetches autocannon without adding a project dependency; note that in `STATE.md`.
- [ ] **Step 5:** Write one plain conclusion per scenario, naming the winner and why. Where PostgreSQL wins, say so. Add the cross-store `app` cost as its own finding.
- [ ] **Step 6:** Commit scripts and results.

## Task 13: CI with real PostgreSQL and MongoDB (ALL) needs D8

**Files:** Create `apps/api/vitest.real.config.ts` (includes only `tests/real/**`), `apps/api/tests/real/{views,reviews,submissions}.real.test.ts`; modify `.github/workflows/ci.yml` and `apps/api/package.json` (`test:real`).

- [ ] **Step 1:** Ask WH for D8.
- [ ] **Step 2: Tests, using database `bingemate_test`** (a guard like Task 12a's refuses other names): migrations on an empty database; load 20 fixture titles; `title_rating_stats` rounding (41 stars over 40 reviews gives 1.03); `trending_titles` ordering and its exclusion of unreviewed titles; `title_rank_in_type` after a refresh; a review created through the API has the same id in Postgres and Mongo; creator delete removes the Mongo body; the delete-vs-list lock test from `1ed21ed` against a real database.
- [ ] **Step 3:** Workflow: add `services` for `postgres:16-alpine` and `mongo:7` with health checks, a `prisma migrate deploy` step, then `npm run test:real --workspace apps/api`. The existing stubbed job stays unchanged and `npm test` must still run only stubbed tests.
- [ ] **Step 4:** Run locally against `docker compose up -d`. Then, with a yes to push, push a branch and confirm CI is green before relying on it.

## Task 14: Housekeeping (WH; Codex for the refactor)

**Files:** `apps/api/prisma/seed.ts`, `apps/api/src/utils/pagination.ts`, `docs/architecture.svg`, `docs/eraser-diagrams.md`, `TASKS.md`, `docs/api.md`.

- [ ] **Step 1:** `npx prettier --write` the two files; run the suite; commit separately from behaviour changes. Ask the team whether CI should run `format:check` (10 files on `main` already fail it).
- [ ] **Step 2:** Update `architecture.svg`: remove the global rate limit and auth pipeline the code does not have; show the cross-store review write, the trending job and the materialized view.
- [ ] **Step 3:** Sync `TASKS.md`: tick what is tested, drop the `{rating}` index item (D3), record D1–D5, link the benchmark results. Document the rank fields in `docs/api.md`.
- [ ] **Step 4:** Tidy repeated helpers (title id param schema, admin-cannot-write check, page/pageSize schema) and convert `titles.routes.ts` to `asyncHandler` if `main` has not already. Last, only if the suite stays green; drop it if time is short.

## Task 15: Click-through of creator, admin and consumer flows (WH, browser)

**Files:** Create `docs/manual-test-checklist.md`.

- [ ] **Step 1:** The API and web servers are already running with mocks off. With `creator@bingemate.dev`: create a title with an image and see PENDING with the image; edit it; delete it; see the 409 message on a title that blocks deletion. With `admin@bingemate.dev`: confirm there is no Creator link; approve; reject with a reason; trigger the stale-version message from two tabs. With a consumer: review, edit, reply, add to a list, and see the new rank line on a title page.
- [ ] **Step 2:** Record pass or fail per line. Keep screenshots for the report; ask whether they belong in git. Each failure becomes a Codex fix with a failing test first.

## Task 16: User manual, demo script, report outline (WH drafts; each member writes their own section)

**Files:** Create `docs/user-manual.md`, `docs/demo-script.md`, `docs/report-outline.md`.

- [ ] **Step 1:** Manual from the README and the click-through: setup (Docker, migrate, load, run), accounts, one section per role (visitor, user, creator, admin), troubleshooting.
- [ ] **Step 2:** Demo script of 10 minutes, with every member speaking: one timed segment per person (what they show, on which account, what to click, what the database shows underneath, such as `EXPLAIN` or an aggregation result).
- [ ] **Step 3:** Report outline, 10 pages maximum, one page budget and one named author per section: problem; ER diagrams for both stores; the cross-store review decision and its failure handling; views, the materialized view and window functions; aggregation pipelines with explain output; benchmarks and conclusions; testing and CI; limits.
- [ ] **Step 4:** Slides, video, final zip and peer review are manual and not delegated. Slides start once the report is stable.

---

## Order and Dates

| When | Tasks |
|------|-------|
| 4 Nov | Task 1 (after yes); Task 10 |
| 5–6 Nov | Task 12a (full load runs in the background); start Task 16 drafts |
| 7–10 Nov | Task 11 |
| 10–15 Nov | Task 12 |
| 15–19 Nov | Task 13, Task 14, Task 15 |
| 19–24 Nov | Finish Task 16; report sections written by their authors |
| 24–28 Nov | Code freeze; video, final report, zip, peer review. 28 Nov is the buffer day. |

Dependencies: 12a → 11 → 12 (12 can start before the last index lands but must be re-run after it). Task 10 is independent. Task 13 needs Task 10's view for its rank test.

## Self-Review Notes

- Coverage: relational (views, materialized view, window functions, `EXPLAIN`, indexes, CI against real PostgreSQL) and NoSQL (aggregation explain at scale, benchmarks, cross-store cost) are each a task. The 950k assumption in the earlier plan is replaced by D6.
- Types: `getTitleRank` and `refreshTitleRanks` are defined in Task 10 only; Task 13's test uses them by those names. `assertBenchDatabase` is defined in Task 12a and reused by Tasks 12 and 13.
- Risk: the bench load (Task 12a) is the longest run; start it first on its day. Disk has 72 GB free against an estimated 3–4 GB for both stores.
