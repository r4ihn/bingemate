# ETL (TASKS.md section 2, JW + HS)

Cleaning scripts for the dev dataset. Raw inputs go in `../raw/`, cleaned outputs and logs in
`../processed/` (both gitignored).

```
npx tsx data/etl/clean-all.ts      # run every step in order, then verify.ts
npx tsx data/etl/clean-reviews.ts  # or any single step (clean-lists needs clean-reviews first)
```

No dependencies were added: a small CSV reader/writer lives in `lib/csv.ts`. Each step is
idempotent and reads only `../raw/` (except `clean-lists`, which reads the reviews that survived).

Still to write: `load-postgres.ts`, `load-mongo-reviews.ts`, `id-mapping.ts` (dataset id -> `titles.id`).

## What each script does

| Script             | Reads                               | Writes (`../processed/`)                                            |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------- |
| `clean-movies.ts`  | `titles.csv`, `movie_details.csv`   | `movies.csv`                                                        |
| `clean-tvshows.ts` | `titles.csv`, `tv_details.csv`      | `tv_shows.csv`                                                      |
| `clean-books.ts`   | `titles.csv`, `book_details.csv`    | `books.csv`                                                         |
| `clean-genres.ts`  | `genres.csv`, `title_genres.csv`    | `genres.csv`, `title_genres.csv`                                    |
| `clean-people.ts`  | `people.csv`, `title_people.csv`    | `people.csv`, `title_people.csv`                                    |
| `clean-users.ts`   | `users.csv`, `roles.csv` (ids only) | `users.csv`                                                         |
| `clean-reviews.ts` | `reviews.csv`, `reviews_mongo.json` | `reviews.csv` (Postgres header), `review_bodies.jsonl` (Mongo body) |
| `clean-lists.ts`   | `user_lists.csv`                    | `user_lists.csv`                                                    |
| `verify.ts`        | everything in `../processed/`       | nothing; exits non-zero on a failed check                           |

Dataset ids (`title_id`, `person_id`, ...) are kept as they are. Mapping them to database ids is the
loader's job.

## Normalisation applied

**Titles (all media)**

- Text: Unicode NFC, non-breaking and zero-width characters removed, runs of whitespace collapsed
  to one space, trimmed; empty becomes `NULL`. (Fixed 2 names: `The Jay Leno Show ` and `Black.  White.`.)
- `media_type` mapped to the Prisma enum: `movie` -> `MOVIE`, `tv` -> `TV_SHOW`, `book` -> `BOOK`.
- `release_year` must be 1000 to next year, else blanked. Missing years stay `NULL` (39 titles).
  (The floor is 1000, not 1800: the dataset has a real 1661 book.)
- Missing descriptions stay `NULL` (101 books). `created_by` is empty for every row, so all imported
  titles are `status = APPROVED`, `created_by = NULL` as TASKS.md section 2 says.
- Each media file joins that type's `*_details.csv` on `title_id`. Detail numbers are range-checked and
  blanked if out of range: `num_seasons` 0 (29 shows, almost certainly "unknown"), `letterboxd_rating`
  0 to 5, `metascore`/`userscore` 0 to 100, `runtime_min`/`duration` 1 to 1000.

**Genres**

- Case variants merged (`Fiction` + `FICTION` -> `Fiction`, the most-used spelling wins).
- Alias merged: `Sci-Fi` -> `Science Fiction` (movie and TV used both).
- Placeholder `Unknown` dropped.
- Rare genres are **kept** (181 raw -> 178: one `Unknown`, two merges). Many are one-off book subject headings
  (`Bears`, `Denmark`), so the genre filter should show only common ones through a SQL view
  (`HAVING COUNT(*) >= N`) rather than the cleaner deleting data.
- The link to a dropped genre is removed (1 row) and links duplicated by a merge are collapsed.

**People**

- Names cleaned as above and de-duplicated on a case- and accent-insensitive key (none found in this data).
- Roles upper-cased to enum values. Dataset roles are `actor`, `writer`, `director`, `author`.
- Duplicate `(title, person, role)` rows collapsed; people with no title link dropped (none).

**Users**

- `role_id` 1/2/3 -> `CONSUMER`/`CREATOR`/`ADMIN`. Usernames cleaned. Repeated usernames are kept: they
  are reviewers' display names, not logins (10 repeats).

**Reviews (split across the two stores, TASKS.md section 0 option B)**

- **Rating 0 to 10 -> whole stars 1 to 5**: `ceil(score / 2)`, floored at 1 (so 0 to 2 -> 1, 2.1 to 4 -> 2,
  ..., 8.1 to 10 -> 5). The original is kept in `original_score`. 155 scores of 0 became 1 star.
  Distribution: 1★ 600, 2★ 1,234, 3★ 2,625, 4★ 4,366, 5★ 4,665.
- **One review per (user, title)**: 322 duplicate pairs; the newest by `review_date` is kept (undated counts
  as oldest, then highest id). The dropped ones are listed in `clean-reviews.rejects.csv`.
- `review_date` must be a real `YYYY-MM-DD`. 965 TV reviews have none and stay empty (`created_at` blank);
  the loader should fall back to the load time.
- Postgres header (`reviews.csv`) and Mongo body (`review_bodies.jsonl`) contain exactly the same
  `review_id`s; a body is only written if its user and title match the header.
- Body text: CRLF -> LF, each line trimmed (removes the hard-wrap indentation in old movie reviews),
  3+ blank lines capped at one, NEL/line-separator characters turned into spaces. Line breaks are kept,
  so render with `white-space: pre-line`. 3,845 texts changed.
- Body drops `score`, `username`, `title_name` (rating lives in Postgres; the others are joins). Kept:
  `media_type`, `text`, `details` (movie `review_year`; TV `review_type`, `publication_name`; book
  `summary`, `amazon_id`, `helpfulness`) and an empty `comments` array.

**User lists**

- The dataset has no status. Every entry is a title the user also reviewed, so entries are set to
  `COMPLETED` (an entry without a review would be `PLAN_TO`). All 13,490 became `COMPLETED`.

## Results of the last run

| Output                                     | Rows            |
| ------------------------------------------ | --------------- |
| movies / tv_shows / books                  | 500 / 500 / 500 |
| genres / title_genres                      | 53 / 2,903      |
| people / title_people                      | 12,758 / 15,798 |
| users                                      | 5,478           |
| reviews (Postgres) / review_bodies (Mongo) | 13,490 / 13,490 |
| user_lists                                 | 13,490          |

`verify.ts`: 27 checks, 0 failed (unique keys, foreign keys, enum values, rating 1 to 5, one review
per user per title, Postgres and Mongo ids identical, no orphans). The outputs were also compared
against the raw files with separate code: rating mapping 0 mismatches, no dropped duplicate newer
than its survivor, title ids identical, no text left untrimmed.

## Logs

Every run writes to `../processed/logs/`:

- `etl.log`: timestamped history of every step, appended across runs.
- `summary.json`: counts and warnings per step for the latest run.
- `<step>.rejects.csv`: each row a step dropped or blanked, with the reason.

## Open decisions for the team (the data does not fit the schema)

1. **`WRITER` role**: 2,810 `title_people` rows are writers; `PersonRole` has no `WRITER`. Add it or skip them. (JW)
2. **`Title.description`**: the schema has no description column; 1,399 titles have one. Add it or drop it. (JW)
3. **`User.username`**: the schema has no username column (reviewer display names), and the dataset has no
   emails. `users.csv` has a placeholder `user<id>@seed.bingemate.local` email; the loader must set `passwordHash`. (JW, RA)
4. **Detail columns** (runtime, tagline, ratings, publisher, price, ...) have no Postgres column. Put them in
   Mongo or drop them. (JW, HS)
5. **Genre filter**: all genres are in the data; decide the view/query that limits the browse filter to common ones. (SJ)
6. **Derived values**: list status `COMPLETED`, the 0 to 10 -> 1 to 5 rule, and the 155 zero scores mapped to 1 star
   were my calls; confirm with the team.
7. `reviews.avg_rating` / `review_count` on `titles` are not in the data: the loader must compute them.
