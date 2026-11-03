# Demo script (10 minutes, all five members speak)

Total time is 9 minutes 30 seconds, leaving 30 seconds of slack. Every member has a timed segment. Rehearse it at least twice with a stopwatch: the click paths for the creator and admin screens have **not** yet been checked in a real browser (see `docs/manual-test-checklist.md` once it exists), so treat every "click" below as a plan, not a fact.

## Before you record

1. Reset the demo data so nothing from earlier testing shows up: `docker compose up -d`, then `npx tsx data/etl/load-all.ts --reset` (loads 1,500 titles, 13,490 reviews; asks no questions, so make sure `apps/api/.env` points at the dev database, not a `_bench` or `_test` one).
2. Start the API (`npm run dev` in `apps/api`) and the web app with `VITE_USE_MOCKS=false`. Confirm `http://localhost:5173` loads real titles. Run the trending job once so trending is not empty: `npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts`.
3. Open these windows before you start and put them side by side: the browser; a terminal in `psql` (`docker exec -it bingemate-postgres psql -U bingemate -d bingemate`); a terminal in `mongosh` (`docker exec -it bingemate-mongo mongosh bingemate`); a page with `docs/benchmarks/results.md` open.
4. Log in once as each of `admin@bingemate.dev`, `creator@bingemate.dev` and `user4@seed.bingemate.local` (password `Password123!`) in three browser profiles or private windows, so switching accounts costs no time. The loaded data has no `consumer@bingemate.dev`.
5. Zoom the terminals to a readable size. Close notifications.

## Segments

| Time      | Who | What the viewer sees                                                                                                    |
| --------- | --- | ----------------------------------------------------------------------------------------------------------------------- |
| 0:00-0:30 | WH  | Introduction and the architecture picture                                                                               |
| 0:30-2:00 | JW  | The relational model: ER diagram, constraints, views, the data load                                                     |
| 2:00-3:30 | RA  | Accounts, roles and the approval workflow                                                                               |
| 3:30-5:30 | HS  | MongoDB: one review across both stores, replies, aggregation pipelines                                                  |
| 5:30-7:30 | SJ  | Search, window function, query plans and the benchmark conclusions                                                      |
| 7:30-9:00 | WH  | The creator flow end to end on the website, then testing and CI                                                         |
| 9:00-9:30 | ALL | One sentence each: what we learned. Last speaker names what is not finished (admin user management, review moderation). |

### WH, 0:00-0:30: introduction

Show `docs/architecture.svg`. Say: React single-page app, Express API, PostgreSQL for the structured data, MongoDB for review text, replies, trending cards and images. One sentence on why two stores: ratings and titles need integrity and joins; text and precomputed cards suit documents. Hand over to JW.

### JW, 0:30-2:00: the relational model and the data

- **Show:** the relational ER diagram (Eraser link in `docs/eraser-diagrams.md`). Point at `Title`, `Review`, `ListEntry`, the details tables (`MovieDetails`, `TvDetails`, `BookDetails`) and the junction tables.
- **Database:** in `psql`, `\d "Review"` to show the `CHECK (rating BETWEEN 1 AND 5)` and the unique `(userId, titleId)`; then `select count(*) from "Title"; select count(*) from "Review";` (1,500 and 13,490 after the load).
- **Say:** the ETL turned raw datasets into the schema (ratings 0-10 became 1-5 stars; duplicate rows were collapsed); constraints, not application code, stop a second review by the same user.
- **Backup if the ER link is slow:** use the table printout from `psql`.

### RA, 2:00-3:30: roles and approval

- **Show:** log in as `creator@bingemate.dev`; the Creator link exists. Log in as `admin@bingemate.dev`; there is no Creator link. Open the approval queue.
- **Do:** approve one pending title and reject another with a reason. If you can, open the queue in two tabs and decide the same title twice to show the "This title changed after you opened it" message (the version check on `updatedAt`).
- **Database:** `select status, "rejectionReason" from "Title" order by "updatedAt" desc limit 3;`
- **Say:** JWT in an httpOnly cookie, role checks per route, admins never write reviews, the creator of a title cannot review it.
- **Do not show:** admin user and role management, review moderation. They are not built. If asked, say so.
- **Backup:** if the two-tab step is fiddly, skip it and mention the 409 in one sentence.

### HS, 3:30-5:30: MongoDB

- **Show and do:** as the imported user, write a review on any title in the browser.
- **Database:** in `psql`, `select id, "titleId", rating from "Review" order by "createdAt" desc limit 1;`. Copy the id. In `mongosh`, `db.reviewbodies.findOne({ _id: "<that id>" })` to show the body with the same id. Say: header in PostgreSQL, text in MongoDB, one shared id, and if the Mongo write fails the header is taken back out.
- **Show:** `db.replies.findOne()`: replies are a flat collection, not nested documents.
- **Run:** `GET /api/reviews/top-reviewers` and `GET /api/titles/<id>/review-activity` in the browser or `curl`. Name the pipeline stages (`$group`, `$lookup`, `$dateToString`) from `docs/benchmarks/explain.md`.
- **Say:** on 1M reviews the top-reviewers pipeline took 3.2 s and 0.8 s with a covering index that fetches no documents.
- **Backup:** if the live review write fails, use an existing review's id for the same `findOne` comparison.

### SJ, 5:30-7:30: queries, plans and benchmarks

- **Show:** the title page rank line ("#N in Movies, top X%"). In `psql`: `select title_id, rank_in_type, pct_rank from title_rank_in_type where "mediaType"='MOVIE' order by rank_in_type limit 5;`. Say: a materialized view using `RANK()` and `PERCENT_RANK()`, refreshed with the trending job.
- **Show trending as JSON, not as a page:** open `http://localhost:4000/api/trending?type=MOVIE&limit=5` and `...&sort=recent` in the browser. The website does not use the trending API yet (Home's "Trending now" strip lists titles in name order) and Browse has no genre or sort controls, so do not say "on the site"; say "from the API". Show the same sorted browse as `http://localhost:4000/api/titles?type=MOVIE&sort=rating`.
- **Show:** `docs/benchmarks/explain.md`, the before and after table: browse by rating 22.6 ms to 0.07 ms after a composite index; the partial index that Prisma's queries never used.
- **Show:** `docs/benchmarks/results.md`, the conclusions: single reads and inserts tie between the stores; precomputed trending is about 900 times faster than computing it, which is a design result; the two-store review path costs about 6 to 9 times a single-store read.
- **Say:** the data is synthetic (no 950k-title source exists), and the repeatability target was missed on sub-millisecond rows.
- **Backup:** if live `EXPLAIN` is slow, show the tables only.

### WH, 7:30-9:00: the creator flow, tests and CI

- **Do:** as the creator, submit a title with an image. It appears as PENDING with its image. As the admin, approve it. As a visitor, find it in Browse. Optionally edit it as the creator to show it returns to PENDING.
- **Show:** `npm test` summary (540 API tests, 492 web tests, no databases needed) and `npm run test:real --workspace apps/api` (14 tests against real PostgreSQL and MongoDB, including a concurrent delete-versus-add-to-list race). Say each rule was checked by breaking the code on purpose and watching a test fail.
- **Show:** the CI file: the second job starts both databases.

### ALL, 9:00-9:30: close

One sentence each. The last speaker states what is unfinished.

## Rules of the recording

- Every member speaks. Practise handovers: "over to ..." with no pause.
- Do not read slides aloud. Show the system, say what the database shows underneath.
- Never show a screen with a password, a token or a `.env` file.
- If something fails live, say what it should have shown, show the backup, and move on. Do not debug on camera.
- Do not claim anything this script marks as not built or not checked.
