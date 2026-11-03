# SQL against NoSQL: benchmark results

Five workloads run against PostgreSQL and MongoDB over the same **synthetic** data (950,000 titles, 999,372 reviews with identical ids in both stores, 300,000 flat replies; see `docs/benchmarks/explain.md` and `benchmarks/README.md`). Harness: `benchmarks/run.ts`. Measured 3 Nov 2026 on one laptop, with both databases, the load generator and two dev servers on the same machine.

## How the comparison was kept fair

- Same logical rows in both stores, same page size (20), same ordering.
- 20 warm-up calls discarded, then 200 timed calls run one after another (20 for trending, which takes seconds per call). Connection pools: PostgreSQL 10, MongoDB 10.
- The PostgreSQL side goes through Prisma (its client overhead is included); the MongoDB side uses the native driver.
- Where a store does not hold the data (review text is in MongoDB; titles are in PostgreSQL), a throwaway copy is built in the other store with the same indexes, and dropped afterwards. The application tables are never changed: every `bench-ins-` row is deleted and the title ratings recomputed, and store parity was re-verified afterwards (999,372 reviews in both).
- Each scenario also has a third row, **real app path**, where that exists: what the API actually does across both stores.

## Results

Three complete runs, back to back. The table gives the median of the three run-medians and the range between them.

| Scenario | Store | Runs each | Median of 3 run-medians (ms) | Range of run-medians (ms) | p95, run 3 (ms) |
| --- | --- | --- | --- | --- | --- |
| reviews-for-title | PostgreSQL | 200 | 0.441 | 0.441 to 0.443 | 0.576 |
| reviews-for-title | MongoDB | 200 | 0.436 | 0.434 to 0.464 | 0.664 |
| reviews-for-title | Both stores (real app path) | 200 | 3.492 | 2.669 to 3.806 | 4.505 |
| top-n-trending | PostgreSQL | 20 | 2233.005 | 2175.465 to 2248.280 | 2256.548 |
| top-n-trending | MongoDB | 20 | 2.451 | 2.109 to 2.815 | 3.512 |
| insert-review | PostgreSQL | 200 | 0.561 | 0.479 to 0.587 | 1.576 |
| insert-review | MongoDB | 200 | 0.469 | 0.364 to 0.487 | 0.634 |
| insert-review | Both stores (real app path) | 200 | 2.405 | 2.100 to 2.715 | 4.788 |
| replies-of-review | PostgreSQL | 200 | 0.537 | 0.452 to 0.580 | 0.785 |
| replies-of-review | MongoDB | 200 | 0.527 | 0.411 to 0.555 | 0.731 |
| filtered-browse | PostgreSQL | 200 | 69.372 | 66.630 to 88.431 | 101.585 |
| filtered-browse | MongoDB | 200 | 70.184 | 68.583 to 72.528 | 78.006 |

**Repeatability.** The plan required two runs to agree within 15%. They did not on sub-millisecond rows: run 1 against run 2 differed by up to 29%, and run 2 against run 3 by up to 35%. I first suspected cold caches in run 1, but run 3 refuted that (it was slower than run 2 on several rows), so it is plain run-to-run noise on a shared laptop. For that reason the table shows the range, and the conclusions below rest only on differences far outside it.

## Conclusions

1. **Reviews for a title (one page of 20): a tie.** PostgreSQL 0.44 ms, MongoDB 0.44 ms. The real app path, which reads rating headers from PostgreSQL and then the bodies from MongoDB by id, takes 2.7 to 3.8 ms: roughly 6 to 9 times either single store. That multiple is the price of splitting one review across two stores. (The MongoDB row returns bodies only; ratings live in PostgreSQL.)
2. **Top 50 trending: precomputing wins by about 900×, but that is a design result, not a store result.** Computing it from 1M reviews in PostgreSQL takes about 2.2 s; reading the precomputed MongoDB cards takes about 2.5 ms. The same precomputation could live in a PostgreSQL table. What the cards give the API is one indexed read of a denormalised document. The price is the refresh: one rebuild took 3.1 s (measured once, in a smoke run, including the copy and index build) and results can be up to one refresh interval (10 minutes) old.
3. **Insert a review: a tie on a single insert, a clear cost on the real path.** PostgreSQL 0.48 to 0.59 ms, MongoDB 0.36 to 0.49 ms. MongoDB was faster in all three runs by about 0.1 ms, which is the size of the run-to-run noise, so call it a tie. The real path takes 2.1 to 2.7 ms, about 4 to 5 times a single insert, because it takes the title row lock, inserts the header, recomputes the title's average rating and count, then writes the body. That cost comes from the design (a locked transaction that keeps a denormalised average correct), not from either engine's insert speed.
4. **Replies of a review: a tie.** PostgreSQL 0.45 to 0.58 ms, MongoDB 0.41 to 0.56 ms. The SQL side is a throwaway table built from the Mongo replies, so it shows what a relational reply table would cost, not what the app does.
5. **Filtered browse (page plus total): a tie, and both are dominated by the count.** PostgreSQL 67 to 88 ms, MongoDB 69 to 73 ms. The EXPLAIN data shows the page query alone needs under 1 ms after the new indexes, so the remaining time is the `total` count over hundreds of thousands of matching titles. I did not time the two parts separately inside the harness. MongoDB's denormalised copy (genres embedded) avoids a join but pays the same counting cost.

**Overall.** For single-key reads and single inserts of this size the two stores are indistinguishable on this hardware. PostgreSQL did not win a scenario outright; it tied four of five. The differences that matter are design differences: precomputing (scenario 2) and the cost of keeping one entity in two stores (the real-path rows in scenarios 1 and 3). The case for each store here is the data model (documents, denormalised cards, relational integrity and joins) and not raw speed. One workload was measured on a single store only: the top-reviewers aggregation (MongoDB, 3.2 s before and 0.8 s after covering indexes); I did not write the SQL `GROUP BY` equivalent.

## API load tests

`autocannon@7.15.0`, 20 connections for 15 seconds per endpoint, against a second API instance on port 4100 pointed at the benchmark databases (trending timer off). A run with any non-2xx reply or error would be invalid; all three had none.

| Endpoint | Requests/s | p50 | p97.5 | p99 | Max |
| --- | --- | --- | --- | --- | --- |
| `GET /api/trending` | 2,033 | 9 ms | 14 ms | 17 ms | 62 ms |
| `GET /api/titles/bench-title-1/reviews` (the hottest title) | 1,228 | 15 ms | 24 ms | 27 ms | 53 ms |
| `GET /api/titles?type=MOVIE&sort=rating&page=1` | 478 | 40 ms | 66 ms | 73 ms | 106 ms |

Trending serves about four times the requests per second of browse because it reads precomputed cards. Browse is the slowest even after the index work, because of the pagination total: the page query is 0.06 ms and `COUNT(*)` is about 25 ms. A cached or approximate total is the obvious next step; it was not done. One run per endpoint, so these numbers carry the same laptop noise as above.

## Limits

- Synthetic data: reviews are skewed to a hot set of titles, but real traffic and real text distributions will differ.
- One machine shared with other processes; cold-cache behaviour was not measured.
- Single-instance databases with default settings; no replication or network latency.
- The 15% repeatability target was missed on sub-millisecond rows (see above).

## Reproduce

```
export BENCH_DATABASE_URL="postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public" BENCH_MONGO_URI="mongodb://localhost:27017/bingemate_bench"
npx tsx benchmarks/run.ts --scenario all --keep-setup   # run twice or more
npx tsx benchmarks/run.ts --drop-only                   # remove throwaway tables and inserted rows
```
