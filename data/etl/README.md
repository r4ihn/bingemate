# ETL (TASKS.md section 2, JW + HS)

Cleaning scripts for the dev dataset. Raw inputs go in `../raw/`, cleaned outputs and logs in
`../processed/` (both gitignored).

```
npx tsx data/etl/clean-all.ts      # run every step in order, then verify.ts
npx tsx data/etl/clean-reviews.ts  # or any single step (clean-lists needs clean-reviews first)
```

To load the cleaned data (Docker running, `apps/api/.env` copied from `.env.example`):

```
docker compose up -d
npm run prisma:migrate                           # tables, CHECK constraint, views
npx tsx data/etl/clean-all.ts                    # data/raw -> data/processed
npx tsx data/etl/load-all.ts                     # both stores in order; add --reset to wipe and reload
npx tsx data/etl/verify-load.ts                  # counts, ids, constraint, aggregates, views
```

Ids are random per run and the Mongo bodies are keyed by the PostgreSQL review ids, so always load (and
`--reset`) both stores together with `load-all.ts`. Running `load-postgres.ts --reset` alone orphans the Mongo bodies until
`load-mongo-reviews.ts --reset` is run too. `load-postgres` runs in one transaction: a failed load leaves the database as it was and writes no
`id-map.json`.

Both loaders refuse a database that is not on this machine (`DATABASE_URL`/`MONGO_URI` host other than
localhost) unless you pass `--allow-remote`.

Skip `npm run seed`: the dataset already contains `admin@bingemate.dev` and `creator@bingemate.dev`
(password `Password123!`, same as the seed), and the loaders refuse a non-empty database without `--reset`.

No dependencies were added: a small CSV reader/writer lives in `lib/csv.ts`. Each step is
idempotent and reads only `../raw/` (except `clean-lists`, which reads the reviews that survived).

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
  Caveat: name is the only key, so two different people with the same name would be merged.
- Roles upper-cased to enum values. Dataset roles are `actor`, `writer`, `director`, `author`.
- Duplicate `(title, person, role)` rows collapsed; people with no title link dropped (none).

**Users**

- `role_id` 1/2/3 -> `CONSUMER`/`CREATOR`/`ADMIN`. Usernames cleaned. Repeated usernames are kept: they
  are reviewers' display names, not logins (10 repeats).

**Reviews (split across the two stores, TASKS.md section 0 option B)**

- **Rating 0 to 10 -> whole stars 1 to 5**: `round(score / 2)`, clamped to 1..5 (so below 3 -> 1, 3 to <5 -> 2,
  5 to <7 -> 3, 7 to <9 -> 4, 9 and above -> 5). Rounding rather than `ceil` keeps 8.1 at 4 stars, so 5 stars still means a score of
  9 or more. The original is kept in `original_score`. 155 scores of 0 became 1 star.
  Distribution: 1★ 719, 2★ 1,515, 3★ 3,107, 4★ 4,190, 5★ 3,959. The range comes from
  `RATING_MIN`/`RATING_MAX` in `@bingemate/shared`, which `verify-load` also uses to probe the CHECK.
- **One review per (user, title)**: 322 duplicate pairs; the newest by `review_date` is kept (undated counts
  as oldest, then highest id). The dropped ones are listed in `clean-reviews.rejects.csv`.
- `review_date` must be a real `YYYY-MM-DD`. 965 TV reviews have none (947 remain after duplicates are
  dropped) and stay empty in `reviews.csv` (`created_at` blank). Both loaders give each one a made-up date
  from 1 Jan 2022 to 31 Dec 2025 (`lib/dates.ts`). The day comes from a hash of the dataset review id, so
  PostgreSQL and MongoDB agree and a reload gives the same dates. They are not real dates.
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

## Loading

- Ids: the loaders generate UUIDs (`crypto.randomUUID`, no dependency) and keep the dataset-id map in
  `id-map.json`, which the Mongo loader needs.
- Everyone gets the dev password `Password123!` (one bcrypt hash, cost 12). Dataset users have placeholder emails.
- Imported titles are `APPROVED` with `createdById` NULL. Undated reviews get a made-up `createdAt` between 2022 and 2025.
- `Title.avgRating` / `reviewCount` are filled from the `title_rating_stats` view at the end of the load.
- Mongo body: `body` = cleaned text, `mediaType` = discriminator, `details` = the media-specific extras
  (a new `Mixed` field on `ReviewBody`), `createdAt` = the Postgres review date. Comments stay in their own collection.
- Last load (3 seconds for Postgres): 5,478 users, 1,500 titles, 178 genres, 3,060 title_genres, 12,758 people,
  15,798 title_people, 13,490 reviews, 13,490 list entries, 13,490 Mongo bodies. `verify-load.ts`: 17 checks, 0 failed.

## Schema changes made for the data (migrations `20261027075529_initial_bingemate`, `20261027075538_rating_check_and_views`)

- `PersonRole.WRITER`, `Title.description` (Text), `User.username` (optional).
- `CHECK ("rating" BETWEEN 1 AND 5)` on `Review`.
- Views: `title_rating_stats` (recomputed aggregates), `genre_filter_options` (genres on at least 5 approved
  titles, per media type), `trending_titles` (weighted rating, `m = 10`, titles with no reviews excluded), `creator_title_stats` (for `/creator/stats`).
- The `detail` columns (runtime, tagline, publisher, price ...) are still not loaded anywhere.

## Logs

Every run writes to `../processed/logs/`:

- `etl.log`: timestamped history of every step, appended across runs.
- `summary.json`: counts and warnings per step for the latest run.
- `<step>.rejects.csv`: each row a step dropped or blanked, with the reason.

## Open decisions for the team (the data does not fit the schema)

1. ~~`WRITER` role~~ added to the schema. ~~`Title.description`~~, ~~`User.username`~~ added.
2. **Emails and passwords**: dataset users have placeholder emails and share the dev password. (RA)
3. **Detail columns** (runtime, tagline, ratings, publisher, price, ...) are not stored. Put them in Mongo or drop them. (JW, HS)
4. **Mongo discriminator fields**: `runtimeMinutes`, `chaptersRead`, `season`, `episodes` on `ReviewBody` are not in the data; the imported extras live in `details`. (HS)
5. **Genre filter**: all genres are in the data; decide the view/query that limits the browse filter to common ones. (SJ)
6. **Derived values**: list status `COMPLETED`, the 0 to 10 -> 1 to 5 rule, and the 155 zero scores mapped to 1 star
   were my calls; confirm with the team.
7. Aggregates are computed by the loader through the view; keep that in sync when reviews are written through the API. (HS)
