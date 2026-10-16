# ETL (TASKS.md section 2, JW + HS)

Scripts to clean, normalise and load the datasets:

- `clean-movies.ts`, `clean-books.ts`, `clean-tvshows.ts` — clean nulls/duplicates, normalise genre names
- `load-postgres.ts` — load titles/genres/people into PostgreSQL (imported titles: status APPROVED, created_by NULL)
- `load-mongo-reviews.ts` — load review bodies into MongoDB
- `id-mapping.ts` — dataset title → PostgreSQL `titles.id` mapping

Raw inputs go in `../raw/`, cleaned outputs in `../processed/` (both gitignored).
