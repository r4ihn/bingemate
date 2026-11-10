# ETL (TASKS.md section 2, JW + HS)

Cleaning scripts for the dev dataset. Raw inputs in `../raw/` and cleaned CSV/JSONL datasets in
`../processed/` are committed to Git. Logs and the load-specific `id-map.json` stay gitignored.
Group members can load the committed cleaned dataset directly; cleaning is only needed when
updating the inputs or cleaning rules.

```
npx tsx data/etl/clean-all.ts      # run every step in order, then verify.ts
npx tsx data/etl/clean-reviews.ts  # or any single step (clean-lists needs clean-reviews first)
```

To load the cleaned data (Docker running, `apps/api/.env` copied from `.env.example`):

```
docker compose up -d
npm run prisma:migrate                           # tables, CHECK constraint, views
npx tsx data/etl/load-all.ts --reset             # both stores in order; --reset is needed on a new database (see below)
npx tsx data/etl/verify-load.ts                  # counts, ids, constraint, aggregates, views
```

Ids change on every load, so rebuild the trending cards afterwards, from the repo root:
`npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts`.

Ids are random per run and the Mongo bodies are keyed by the PostgreSQL review ids, so always load (and
`--reset`) both stores together with `load-all.ts`. Running `load-postgres.ts --reset` alone orphans the Mongo bodies until
`load-mongo-reviews.ts --reset` is run too. `load-postgres` runs in one transaction: a failed load leaves the database as it was and writes no
`id-map.json`.

Both loaders refuse a database that is not on this machine (`DATABASE_URL`/`MONGO_URI` host other than
localhost) unless you pass `--allow-remote`.

Skip `npm run seed`: the dataset already contains `admin@bingemate.dev` and `creator@bingemate.dev`
(password `Password123!`, same as the seed). **Use `--reset` the first time.** On a newly created database,
`npm run prisma:migrate` (`prisma migrate dev`) runs the demo seed by itself, so the database is not empty and
the loaders refuse it without `--reset`; the reset replaces the seeded demo accounts and sample titles with the dataset.

No dependencies were added: a small CSV reader/writer lives in `lib/csv.ts`. Each step is
idempotent and reads only `../raw/` (except `clean-lists`, which reads the reviews that survived).

## What each script does

| Script             | Reads                                                                | Writes (`../processed/`)                                            |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `clean-movies.ts`  | `titles.csv`, `movie_details.csv`                                    | `movies.csv`                                                        |
| `clean-posters.ts` | poster sources (optional), `movies.csv`, `tv_shows.csv`, `books.csv` | `title_posters.csv` (`title_id`, `poster_url`)                      |
| `clean-tvshows.ts` | `titles.csv`, `tv_details.csv`                                       | `tv_shows.csv`                                                      |
| `clean-books.ts`   | `titles.csv`, `book_details.csv`                                     | `books.csv`                                                         |
| `clean-genres.ts`  | `genres.csv`, `title_genres.csv`                                     | `genres.csv`, `title_genres.csv`                                    |
| `clean-people.ts`  | `people.csv`, `title_people.csv`                                     | `people.csv`, `title_people.csv`                                    |
| `clean-users.ts`   | `users.csv`, `roles.csv` (ids only)                                  | `users.csv`                                                         |
| `clean-reviews.ts` | `reviews.csv`, `reviews_mongo.json`                                  | `reviews.csv` (Postgres header), `review_bodies.jsonl` (Mongo body) |
| `clean-lists.ts`   | `user_lists.csv`                                                     | `user_lists.csv`                                                    |
| `verify.ts`        | everything in `../processed/`                                        | nothing; exits non-zero on a failed check                           |

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

- `role_id` 1/2/3 -> `MEMBER`/`MEMBER`/`ADMIN` (5,477 members, 1 admin). Usernames cleaned.
- Usernames are unique ignoring case: keep the first in input order and append ` (2)`, ` (3)`, ...
  to later collisions, probing suffixes until each name is unique, including occupied suffixed names.

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
  `media_type`, `text` and an empty `comments` array. Imported review extras are discarded (2026-11-03).

**User lists**

- The dataset has no status. Every entry is a title the user also reviewed, so entries are set to
  `COMPLETED` (an entry without a review would be `PLAN_TO`). All 13,490 became `COMPLETED`.

## Results of the last run

| Output                                     | Rows            |
| ------------------------------------------ | --------------- |
| movies / tv_shows / books                  | 500 / 500 / 500 |
| genres / title_genres                      | 178 / 3,060     |
| people / title_people                      | 12,758 / 15,798 |
| users                                      | 5,478           |
| reviews (Postgres) / review_bodies (Mongo) | 13,490 / 13,490 |
| user_lists                                 | 13,490          |

`verify.ts` now checks case-insensitive username uniqueness and the two allowed user roles as well.
Previous run: 27 checks, 0 failed (unique keys, foreign keys, enum values, rating 1 to 5, one review
per user per title, Postgres and Mongo ids identical, no orphans). The outputs were also compared
against the raw files with separate code: rating mapping 0 mismatches, no dropped duplicate newer
than its survivor, title ids identical, no text left untrimmed.

## Loading

For the 947 undated reviews already loaded locally with the old `1900-01-01` placeholder, use `backfill-undated-dates.ts` to give them the same deterministic made-up 2022–2025 dates as a fresh load, without reloading either store. From the repo root, preview with `npx tsx --env-file=apps/api/.env data/etl/backfill-undated-dates.ts`, then write with `npx tsx --env-file=apps/api/.env data/etl/backfill-undated-dates.ts --apply`. It requires the existing `data/processed/reviews.csv` and `id-map.json`, refuses remote databases, and only updates matching placeholder dates, so reruns are safe; apply verifies that no targeted placeholders remain and both stores agree.

Remove orphan Mongo review bodies and replies whose PostgreSQL review is gone (from the repo root): `npx tsx --env-file=apps/api/.env apps/api/src/jobs/cleanupOrphans.ts`.

- Ids: the loaders generate UUIDs (`crypto.randomUUID`, no dependency) and keep the dataset-id map in
  `id-map.json`, which the Mongo loader needs.
- Everyone gets the dev password `Password123!` (one bcrypt hash, cost 12). Dataset users have placeholder emails.
- Imported titles are `APPROVED` with `createdById` NULL. Undated reviews get a made-up `createdAt` between 2022 and 2025.
- `Title.avgRating` / `reviewCount` are filled by the `review_rating_insert` trigger as the reviews go in (one recompute per batch, from the `title_rating_stats` view). `verify-load.ts` checks that they match the view and probes the triggers in a rolled-back transaction.
- Mongo body: `body` = cleaned text, `mediaType` = a copy of the title's type,
  `createdAt` = the Postgres review date. Imported review extras are not written. Comments stay in their own collection.
- Last load (3 seconds for Postgres): 5,478 users, 1,500 titles, 178 genres, 3,060 title_genres, 12,758 people,
  15,798 title_people, 13,490 reviews, 13,490 list entries, 13,490 Mongo bodies. `verify-load.ts`: 17 checks, 0 failed.

## Schema changes made for the data (migrations `20261027075529_initial_bingemate`, `20261027075538_rating_check_and_views`)

- `PersonRole.WRITER`, `Title.description` (Text), `User.username` (optional).
- `CHECK ("rating" BETWEEN 1 AND 5)` on `Review`.
- Views: `title_rating_stats` (recomputed aggregates), `genre_filter_options` (genres on at least 5 approved
  titles, per media type), `trending_titles` (weighted rating, `m = 10`, titles with no reviews excluded), `creator_title_stats` (for `/creator/stats`).
- The `detail` columns were not loaded at first; since migration `20261030120000_title_details` they go into `MovieDetails`, `TvDetails` and `BookDetails` (see "Media details" below).

## Logs

Every run writes to `../processed/logs/`:

- `etl.log`: timestamped history of every step, appended across runs.
- `summary.json`: counts and warnings per step for the latest run.
- `<step>.rejects.csv`: each row a step dropped or blanked, with the reason.

## Open decisions for the team (the data does not fit the schema)

1. ~~`WRITER` role~~ added to the schema. ~~`Title.description`~~, ~~`User.username`~~ added.
2. **Emails and passwords**: dataset users have placeholder emails and share the dev password. (RA)
3. ~~**Detail columns** (runtime, tagline, ratings, publisher, price, ...) are not stored~~: stored in the PostgreSQL details tables since PR #17 (book `price` excepted; see "Media details"). (JW, HS)
4. **Review form fields**: dropped (WH, 2026-11-02). A review is only a star rating and text, so the old `runtimeMinutes`, `chaptersRead`, `season`, `episodes` fields and the per-type discriminators are gone; imported review extras were also removed from the ETL and model on 2026-11-03. (HS)
5. **Genre filter**: all genres are in the data; decide the view/query that limits the browse filter to common ones. (SJ)
6. **Derived values**: list status `COMPLETED`, the 0 to 10 -> 1 to 5 rule, and the 155 zero scores mapped to 1 star
   were my calls; confirm with the team.
7. ~~Aggregates kept in sync when reviews are written through the API~~: done by database triggers on `Review` (migration `20261105120000_rating_triggers`, 2026-11-05), which also cover cascaded deletes and manual SQL. (HS)

## Posters

`clean-posters.ts` writes `title_posters.csv` (`title_id`, `poster_url`), and `load-postgres.ts` puts
it in `Title.posterUrl`. The links are hotlinked, and only https is kept.

- Movies: `MovieGenre_cleaned.csv` and `movielens_movies.csv`, matched on normalised name + release year.
- TV shows: `tv_series_data_cleaned.csv` (name + start year), then the saved lookups.
- Books: `books_data_cleaned.csv` (name + publication year), then the saved lookups.

`fetch-posters.ts` looks up the posters the files miss and saves the answers to
`data/raw/lookup_posters.csv`:

- TMDB, for every movie and TV show whose poster is missing or whose link is dead (the image host
  answers 404 or 410; most of the dataset's old IMDb links on Amazon now do). A TMDB answer replaces
  the link from the files. A TV special or TV film is looked up as a movie as well, and a name is also
  tried without a country tag (`The Traitors [UK]`) or a trailing "The Movie". The name must match, and
  so must the year or one either side; a title with no year only counts when TMDB has exactly one
  title of that name. This part needs `TMDB_API_KEY` in `apps/api/.env` (a v3 key or a v4 token) and is
  skipped without it.
- TVmaze (same year) and Open Library (title only, so some covers can be another edition), for TV
  shows and books that still have none.

It needs the network, so it is not part of `clean-all`. Run `clean-all`, then
`npx tsx --env-file=apps/api/.env data/etl/fetch-posters.ts`, then `clean-all` again. It can be stopped
and resumed; `--retry-misses` asks TMDB again about the titles it had no answer for.

To put new posters (and trailers, below) into a database that is already loaded without
`load-all --reset` (which replaces every user, review and list entry), run
`npx tsx data/etl/update-media.ts` (a dry run), then add `--apply`, then rebuild the trending cards. It
only touches imported titles, never an uploaded poster, and shows a movie again that was hidden only
for having no poster.

On 2026-11-05: 498 of 500 movies, 495 of 500 TV shows and 427 of 500 books have a poster. TMDB replaced
46 dead movie links and 17 dead TV links and filled 57 movies and 36 TV shows that had none.

A movie with no poster loads as `REJECTED`, which hides it, and is listed in
`processed/logs/clean-posters.rejects.csv`. TV shows and books are never hidden. Every source is
optional: with none in `data/raw/`, the step warns, writes an empty `title_posters.csv`, nothing is
hidden, and every title keeps the gradient.

## Trailers

`fetch-trailers.ts` finds each movie and TV show on TMDB with the same matching rules as the posters,
reads its videos, and keeps the best YouTube one: a trailer before a teaser, official before a fan
upload, English before other languages. It saves `data/raw/lookup_trailers.csv` (`title_id`, `name`,
`tmdb_id`, `youtube_key`; an empty key when TMDB has none) and can be stopped and resumed. Run it with
`npx tsx --env-file=apps/api/.env data/etl/fetch-trailers.ts`; it needs `TMDB_API_KEY`.

`clean-trailers.ts` (part of `clean-all`) writes `title_trailers.csv` (`title_id`, `youtube_key`),
keeping only 11-character YouTube ids for titles still in the dataset. `load-postgres.ts` puts it in
`Title.trailerKey`, and `update-media.ts` copies it into a loaded database. A CHECK on the column
(migration `20261105130000_title_trailer`) refuses anything that is not a YouTube id, because the web
app puts the key straight into a `youtube-nocookie.com/embed/<key>` URL. Books have no trailers.

On 2026-11-05, 761 of the 1,000 movies and TV shows have a trailer.

## Media details

`load-postgres.ts` fills `MovieDetails`, `TvDetails` and `BookDetails` from the detail columns in
`movies.csv`, `tv_shows.csv` and `books.csv` (mapping in `lib/details.ts`). A title with no detail
values gets no row. Book `price` is cleaned but not loaded: only 23% of books have one.
