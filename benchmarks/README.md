# BingeMate benchmarks

This folder holds the SQL-vs-MongoDB benchmark seed script, safety guard, workload
scenarios, runner, and recorded results. `scenarios/` covers reviews for a title,
top-N trending, inserting a review, reading a review's **flat replies collection**,
and filtered title browsing. `results/` holds raw runner output (gitignored). The curated,
committed write-ups are `docs/benchmarks/explain.md` (query plans, indexes, before and after)
and `docs/benchmarks/results.md` (SQL against NoSQL, load tests, conclusions).

The scale dataset is **SYNTHETIC**. The proposed 950k-film source does not exist in
the repository. Instead, the seed generates 950,000 titles cycling through movies,
books, and TV shows, 100,000 users, 1,000,000 review attempts, and 300,000 replies.
It reuses the real texts in `data/processed/review_bodies.jsonl` for realistic
document sizes. Label all resulting measurements synthetic in the report; these
are generated titles, not 950,000 real films. Random values vary between seeds.

Prepare the processed body-text file through the existing ETL before seeding. The
seed fails clearly if that file is absent, empty, or contains invalid body texts.
Run the following from the repository root with the existing database containers
running (PostgreSQL and MongoDB on localhost ports 5432 and 27017):

```sh
docker exec bingemate-postgres createdb -U bingemate bingemate_bench
DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public' npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
BENCH_DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public' BENCH_MONGO_URI='mongodb://localhost:27017/bingemate_bench' npx tsx benchmarks/seed-bench.ts --titles 950000 --reviews 1000000 --users 100000 --replies 300000
```

MongoDB creates its separate `bingemate_bench` database on the first insert; it
does not need a separate create-database command. These credentials match the
local PostgreSQL container; supply a MongoDB URI with credentials if required by
your installation.

The safety rule is mandatory: **both database names must end in `_bench`**. The
script reads only `BENCH_DATABASE_URL` and `BENCH_MONGO_URI`, never the application's
`DATABASE_URL` or `MONGO_URI`, and validates both before constructing clients. It
uses a dedicated Mongoose connection and refuses non-empty targets without
`--reset`. The migration command above uses `DATABASE_URL` only because Prisma's
schema requires it; always point that command explicitly at the bench database.

All four size flags are optional and default to the values shown above. Users and
titles must be positive integers; reviews and replies may be zero (replies need
at least one review). Review pairs are unique, so conflicting `(userId, titleId)`
attempts are skipped and the script reports the actual inserted count and loss.
Mongo bodies always follow the actual PostgreSQL rows. Review dates cover
2015–2025, ratings favour 4–5, and title selection favours a hot set. Each title has
two genres; title rating aggregates use the application's numeric rounding rule.
Replies are sampled during streaming; any shortfall from sampling or skipped
review pairs is filled using existing review parents to reach the requested count.

Inspect the plan without connecting (both benchmark env vars are still required):

```sh
BENCH_DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public' BENCH_MONGO_URI='mongodb://localhost:27017/bingemate_bench' npx tsx benchmarks/seed-bench.ts --titles 950000 --reviews 1000000 --users 100000 --replies 300000 --dry-run
```

To re-seed, add `--reset`. This truncates `User`, `Genre`, `Title`, `TitleGenre`, and
`Review` with **CASCADE** (dependent PostgreSQL data is also removed), and drops
MongoDB's `reviewbodies` and `replies` collections before rebuilding them. Other
Mongo collections are not dropped. A failed load can leave partial benchmark
data; run with `--reset` to retry.

```sh
BENCH_DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public' BENCH_MONGO_URI='mongodb://localhost:27017/bingemate_bench' npx tsx benchmarks/seed-bench.ts --titles 950000 --reviews 1000000 --users 100000 --replies 300000 --reset
```

Every phase prints progress and elapsed time. Mongo indexes declared by the
application models are created after bulk loading, and PostgreSQL's filled tables
are analyzed. Verification runs at the end, or independently without modifying
data:

```sh
BENCH_DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public' BENCH_MONGO_URI='mongodb://localhost:27017/bingemate_bench' npx tsx benchmarks/seed-bench.ts --verify-only
```

Verification prints table/collection counts, PostgreSQL `pg_total_relation_size`
(including indexes), and MongoDB `dataSize + indexSize`. MongoDB's `dataSize` is
logical uncompressed data size; the output also reports `storageSize + indexSize`
as allocated storage. It checks equal review counts, full review ID parity, up to
20 random reviews' `titleId`, `userId`, and `createdAt`, and up to 1,000 sampled
reply parents against PostgreSQL. Any mismatch exits non-zero. It does not read
or connect to the development databases.

Benchmark fairness rules (Task 12, Step 1):

- Compare the same logical rows and use the same page size in both stores.
- Discard warm-up measurements and state each database's connection pool size.
- Report cold-cache runs separately: restart both containers, then run one pass.
  Skip cold-cache measurements if time is short, and state that they were skipped.

For the workload results, report compute-on-read trending versus precomputed
Mongo cards explicitly and include refresh duration as the amortised cost.
Include the application's two-store path as its own measurement. Throwaway
`bench_*` comparison objects belong only in the benchmark databases and must be
removed by scenario teardown. Run twice and investigate medians differing by
more than 15%; load-test runs containing any non-2xx response are invalid.

## Running the benchmarks

Run from the repository root against the synthetic benchmark databases only:

```sh
BENCH_DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public' BENCH_MONGO_URI='mongodb://localhost:27017/bingemate_bench' npx tsx benchmarks/run.ts --scenario all --runs 200 --warmup 20
npx tsx benchmarks/run.ts --list
```

`--scenario` accepts `all` (default) or one of the five names below. `--runs` and
`--warmup` override scenario defaults: 200 measured calls and 20 untimed warmup
calls, except trending uses 20 and 3. Calls run sequentially, with each store's
warmup followed by its measured calls. Percentiles (including median) use the
nearest-rank method. PostgreSQL defaults to `connection_limit=10` if absent;
MongoDB uses `maxPoolSize=10`. Reports state the effective pool sizes and include
Prisma client overhead on the SQL side; Mongo uses native driver collections.

- `reviews-for-title`: alternates the hottest title and a title with one review,
  reading the newest 20. SQL includes ratings and copied bodies; Mongo contains
  bodies only. `app` measures PG headers followed by Mongo bodies by shared ids.
- `top-n-trending`: computes the top 50 per media type from `trending_titles`
  versus reading precomputed `bench_trendingcards`, sorted by `score`. Setup's
  card refresh duration (including indexes and recent-review counts) is reported
  as the price of precomputation; it excludes the separate title-rank refresh.
- `insert-review`: SQL text-row insert, Mongo body insert, and the application's
  two-store write path, including the locked header transaction and rating
  recomputation. Random pairs use existing tail users and least-reviewed titles.
- `replies-of-review`: oldest 20 flat replies under the busiest review, using
  the same Mongo replies copied to an indexed SQL table.
- `filtered-browse`: approved movies in Drama, first 20 plus a separate total
  count in each store. Mirrors the app's rating order: average rating descending,
  review count descending, id ascending. Mongo embeds the canonical seeded genre
  names; the requested compound index does not cover the review-count tie-break.

The console prints a table. `benchmarks/results/<YYYY-MM-DD>.md` and `.csv` use
UTC dates and are overwritten on another run that day; preserve a copy before a
repeat if needed. The Markdown includes synthetic-data labeling, live counts,
git SHA, runtime, descriptions, and setup notes, without conclusions. Cold-cache
measurements need a separate manual container restart and run; the harness does
not reset caches. Warmup inserts are real writes and are cleaned up as well.

Setup copies stream in batches of 5,000. Throwaway PostgreSQL tables and MongoDB
collections are named `bench_*` and removed by teardown, including when a scenario
fails. `--keep-setup` skips teardown and allows setup to reuse existing objects;
only reuse a completed setup on unchanged seed data. Inserted `bench-ins-` rows
also remain with this flag. The insert scenario can create `bench_review_text`
empty when run alone; remove it before reusing a reviews-for-title setup.

To clean all throwaway objects and inserted rows after a kept or interrupted run:

```sh
BENCH_DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public' BENCH_MONGO_URI='mongodb://localhost:27017/bingemate_bench' npx tsx benchmarks/run.ts --drop-only
```

`--drop-only` ignores scenario selection, drops all `bench_*` tables in the current
PostgreSQL schema and Mongo collections, deletes `bench-ins-` review rows/bodies,
and recomputes affected title ratings. It cannot be combined with `--keep-setup`.
`--list` and argument validation require neither credentials nor connections.
All database modes validate both `BENCH_*` URLs before constructing clients and
never fall back to the application's environment variables.
