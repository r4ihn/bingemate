# Query plans and indexes at scale

Measured on 3 Nov 2026 on a laptop with PostgreSQL 16 and MongoDB 7 in Docker, using the **synthetic** benchmark database (`bingemate_bench`): 950,000 titles, 999,372 reviews in both stores with identical ids, 300,000 flat replies, 100,000 users. The data is generated because no 950k-title source exists in the project; real review text is reused so document sizes are realistic. See `benchmarks/README.md` for how to rebuild it.

**Method.** PostgreSQL: `EXPLAIN (ANALYZE, BUFFERS)`, three runs per query, median execution time, warm cache (the data fit in memory). The queries mirror what `GET /titles`, `GET /genres`, the trending job and the review endpoints send, with the same bound parameters Prisma uses. MongoDB: one `explain("executionStats")` per aggregation pipeline, so a single sample each. Both come from `benchmarks/explain.ts`.

**How far to trust small numbers.** The laptop was also running two dev servers and Docker, and repeated runs of the same sub-millisecond query varied by up to about 35%. Treat differences under roughly 2× as noise. Rows where nothing changed but the number moved (for example `genre-filter-options` and `review-activity`) show that noise, not an improvement.

## PostgreSQL: before and after the browse indexes

| Query | Before: plan | Before: ms | After: plan | After: ms |
| --- | --- | --- | --- | --- |
| browse-rating | Index Scan Title_avgRating_idx | 22.596 | Index Scan Title_…status_avgRating_reviewCount_id_idx | 0.069 |
| browse-rating-genre | Index Scan Title_avgRating_idx | 36.737 | Index Scan Title_…status_avgRating_reviewCount_id_idx | 0.874 |
| browse-name | Index Scan Title_name_idx | 0.043 | Index Scan Title_name_idx | 0.101 |
| browse-year | Bitmap Heap Scan Title_mediaType_idx | 48.348 | Bitmap Heap Scan Title_mediaType_idx | 55.251 |
| browse-reviews | Bitmap Heap Scan Title_mediaType_idx | 51.665 | Index Scan Title_…status_reviewCount_id_idx | 0.024 |
| search-name | Index Scan Title_name_idx | 0.036 | Index Scan Title_name_idx | 0.038 |
| genre-filter-options | Seq Scan — | 238.852 | Seq Scan — | 197.96 |
| trending-top-50 | Seq Scan — | 2569.277 | Seq Scan — | 2709.813 |
| rating-stats-hot | Index Only Scan Title_id_mediaType_key | 5.42 | Index Only Scan Title_id_mediaType_key | 3.543 |
| reviews-hot | Bitmap Heap Scan Review_titleId_idx | 5.004 | Bitmap Heap Scan Review_titleId_idx | 2.916 |
| reviews-one-review | Bitmap Heap Scan Review_titleId_idx | 0.032 | Bitmap Heap Scan Review_titleId_idx | 0.024 |
| rank-hot | Index Scan title_rank_in_type_title_id_key | 0.032 | Index Scan title_rank_in_type_title_id_key | 0.016 |

- **Browse by rating and by reviews** went from 22 to 52 ms to under 1 ms (about 300 to 2,000 times faster) after adding two composite indexes on `"Title"` that lead with `(mediaType, status)` and then follow each sort order.
- **Browse by year is unchanged** at about 50 ms. The index was measured (0.018 ms) but is deliberately not shipped: the app sorts `releaseYear DESC NULLS LAST` and Prisma 5.20 cannot declare `NULLS LAST` in `schema.prisma`, so a hand-made index would show up as drift on the next `migrate dev`.
- **Name sort** was already an index scan; its movement is noise.
- **Search (`search-name`) is flattering in that table.** The runner searched for a name that matches many titles, so the name-ordered index scan stops after 20 hits (0.04 ms). A rare term has to read every row: see "Left alone" below for the real figure.

## MongoDB pipelines: before and after

| Pipeline | Before: stage / index | Before: keys / docs | Before: ms | After: stage / index | After: keys / docs | After: ms |
| --- | --- | --- | --- | --- | --- | --- |
| review-activity | IXSCAN titleId_1_createdAt_-1 | 7817 / 7817 | 144 | IXSCAN titleId_1_createdAt_-1 | 7817 / 7817 | 42 |
| top-reviewers | IXSCAN titleId_1 | 999372 / 999372 | 3205 | IXSCAN titleId_1_userId_1 | 999372 / 0 | 803 |
| top-reviewers-type | IXSCAN titleId_1 | 999372 / 999372 | 1408 | IXSCAN mediaType_1_titleId_1_userId_1 | 338448 / 0 | 266 |
| recent-review-counts | COLLSCAN — | 0 / 999372 | 477 | COLLSCAN — | 0 / 999372 | 567 |

- **Top reviewers** read every one of the 999,372 index keys and fetched every document (3.2 s). With `{titleId, userId}` the query is answered from the index alone, with 0 documents fetched (about 0.8 s). With `{mediaType, titleId, userId}` the type-filtered version reads only 338,448 keys (1.4 s to 0.27 s). These are the only Mongo indexes added.
- **Recent review counts** is still a collection scan. A covering `{createdAt, titleId}` index took it from 477 to 267 ms in the experiment, which misses the 2× bar, and the query only runs in the 10-minute trending job, so it was not kept. The 567 ms in the table is the unindexed query again; the difference from 477 is noise.
- **Review activity** already used `titleId_1_createdAt_-1`. The 144 to 42 ms change is cache warmth, not the index change.

## Decision rule and what it kept

An index was kept only if it made a measured query at least twice as fast **and** did not measurably slow inserts. Insert cost was checked with the real two-store insert path (`insert-review`, 200 timed inserts): median 2.24 ms before the indexes, 2.13 and 1.59 ms in two runs after. The run-to-run swing is larger than any index effect, so the honest statement is "no measurable write penalty over 200 inserts", not "faster". Cost in space: the two Postgres browse indexes add about 45 to 54 MB each on 950,000 titles.

## Finding: a partial index never helped Prisma's queries

The first attempt used partial indexes `WHERE status = 'APPROVED'`, since every public query filters on that. With literal values the planner used them (22 ms to 0.05 ms). With Prisma's bound parameters it never did, even with a custom plan, and the queries stayed on the old indexes. Putting `status` into the index key instead (equality columns first: `mediaType, status`, then the sort columns) fixed it. The likely cause is that Prisma binds the enum as a text-to-enum cast that PostgreSQL does not treat as a constant when proving a partial-index predicate. That mechanism is a hypothesis; the behaviour is measured.

## Left alone, on purpose

| Item | Measured | Why it stays |
| --- | --- | --- |
| `trending-top-50` | 2.5 to 2.7 s | It is the trending job's query, run every 10 minutes. The API reads the precomputed cards, never this query. |
| `genre-filter-options` | 198 to 239 ms | A full aggregate over 1.9M title-genre links. An index cannot avoid reading them. A cache or a materialized view would; not done. |
| Browse `total` count | about 25 ms (EXPLAIN), see load test | The page query is 0.06 ms but `COUNT(*)` for the pagination total scans about 316k index entries. It is now the largest part of a browse request. |
| `recent-review-counts` | 0.5 s | Background job only. |
| `ILIKE '%term%'` search for a rare term | 95 to 101 ms (parallel sequential scan over 950,000 titles); 0.17 ms for a term with many matches | Right on the 100 ms line set for adding `pg_trgm`. Not added: it needs a database extension, and a trigram index is a team decision. Worth doing if sub-10 ms search matters. Measured by hand with `EXPLAIN (ANALYZE, BUFFERS)`, not by the runner. |

## Reproduce

```
docker exec bingemate-postgres createdb -U bingemate bingemate_bench
DATABASE_URL="postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
export BENCH_DATABASE_URL="postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public" BENCH_MONGO_URI="mongodb://localhost:27017/bingemate_bench"
npx tsx benchmarks/seed-bench.ts --reset
npx tsx benchmarks/explain.ts --label mine
```

Raw runner output is written to `benchmarks/results/` (gitignored); this file is the curated record.
