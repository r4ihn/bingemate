# Benchmarks (TASKS.md section 9, SJ)

SQL vs NoSQL comparison harness.

- `scenarios/` — one file per workload (fetch reviews for a title, top-N trending, insert review, nested comment read, filtered browse)
- `run.ts` — runs the same workload against PostgreSQL and MongoDB and records timings
- `results/` — output tables/charts for the final report
