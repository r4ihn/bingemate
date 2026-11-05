# Title Details Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the media-specific facts the ETL already cleans (runtime, seasons, publisher and so on) in PostgreSQL and show them on the title page.

**Architecture:** `Title` stays the one table everything points at. Three new one-to-one tables (`MovieDetails`, `TvDetails`, `BookDetails`) hang off it through a composite foreign key on `(titleId, mediaType)`, so the database refuses details of the wrong type. The API adds a `details` object to the single-title response only; list endpoints do not change.

**Tech Stack:** PostgreSQL, Prisma, Express, Vitest + Supertest (Prisma mocked), React, `tsx` ETL scripts.

**Spec:** ER draft, https://claude.ai/artifact/1n77rDjKzYUVyPYHvYeXFU (version 3: `price` removed from `BookDetails`).

## Prerequisites (not tasks)

1. JW and HS agree the schema change. It is a locked-team area (TASKS.md section 2).
2. The poster work is committed. It is uncommitted on `demo/live-test` and edits `load-postgres.ts`, which Task 2 also edits.
3. PRs #9 to #13 are merged, because they edit `load-postgres.ts`, `verify-load.ts`, `titles.service.ts`, `dto/index.ts` and `mappers.ts`. Branch `feat/title-details` off `main` after that. To demo earlier, branch off `demo/live-test` and rebase later.

## Global Constraints

- No new dependencies.
- `price` is not stored. It stays in `books.csv`, unused.
- Commit messages carry no Claude attribution or Co-Authored-By line.
- Never run a loader against a remote database. `--reset` wipes the local database; confirm with WH before running it.
- API tests mock Prisma (no database in CI), so database rules are proved in `verify-load.ts`, not in Vitest.
- Column limits match the cleaners: `runtimeMin` and `duration` 1 to 1000, `numSeasons` 1 to 100, `metascore` and `userscore` 0 to 100, `letterboxdRating` 0 to 5, `ratingsCount` 0 or more.

## Review Focus

- A title whose details are all blank gets no row, `details` is `null`, and the page shows no empty label. Pinned in Tasks 2 and 3.
- A real `0` (`userscore`, `ratingsCount`) stays `0`, not `null`. Pinned in Tasks 2 and 3.
- The 59 hidden `REJECTED` movies keep their details rows, and their page still answers 404. Pinned in Tasks 2 and 3.
- A second `load-all --reset` empties and refills the new tables with no duplicate-key error. Pinned in Task 2.
- A TV show with one season reads "1 season", not "1 seasons". Pinned in Task 4.

---

### Task 1: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_title_details/migration.sql` (generated, then edited)

**Interfaces:**
- Produces: Prisma models `MovieDetails`, `TvDetails`, `BookDetails`; relations `Title.movieDetails`, `Title.tvDetails`, `Title.bookDetails`.

- [ ] **Step 1: Add the models**

On `Title`, add the three optional relations and `@@unique([id, mediaType])`. Add these models. The child `@@unique([titleId, mediaType])` looks redundant but is required: Prisma rejects the schema without it (checked).

```prisma
model MovieDetails {
  titleId          String    @id
  mediaType        MediaType @default(MOVIE)
  runtimeMin       Int?
  tagline          String?
  rated            String?
  letterboxdRating Float?
  title            Title     @relation(fields: [titleId, mediaType], references: [id, mediaType], onDelete: Cascade)

  @@unique([titleId, mediaType])
}
```

`TvDetails` is the same shape with default `TV_SHOW` and `numSeasons Int?`, `duration Int?`, `contentRating String?`, `metascore Int?`, `userscore Int?`. `BookDetails` has default `BOOK` and `publisher String?`, `ratingsCount Int?`.

- [ ] **Step 2: Generate without applying**

Run: `npx prisma migrate dev --create-only --name title_details` in `apps/api`
Expected: a new migration folder. If Prisma asks to reset the database, stop and ask WH.

- [ ] **Step 3: Append the rules Prisma cannot express to `migration.sql`**

Add one `ALTER TABLE ... ADD CONSTRAINT ... CHECK` per rule: `"MovieDetails_type"` (`"mediaType" = 'MOVIE'`), `"TvDetails_type"` (`= 'TV_SHOW'`), `"BookDetails_type"` (`= 'BOOK'`), plus the ranges in Global Constraints, the same way `20261027075538_rating_check_and_views` adds the rating check.

- [ ] **Step 4: Apply and confirm**

Run: `npx prisma migrate dev` in `apps/api`, then `npx prisma migrate status`
Expected: "Database schema is up to date", and `\d "MovieDetails"` in psql lists the checks.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(db): add movie, TV and book details tables"
```

### Task 2: Load and verify the details

**Files:**
- Create: `data/etl/lib/details.ts`
- Modify: `data/etl/load-postgres.ts`, `data/etl/verify-load.ts`, `data/etl/README.md`

**Interfaces:**
- Consumes: the Task 1 tables; `toInt`, `toNumber` from `lib/clean.ts`; `insertAll` and the `posters`/`titles` block in `load-postgres.ts`.
- Produces: `movieDetailsRow(row: Row, titleId: string)`, `tvDetailsRow(...)`, `bookDetailsRow(...)`. Each returns the insert object, or `null` when every detail value is blank.

- [ ] **Step 1: Add failing checks to `verify-load.ts`**

Add these, reusing the `RollbackProbe` transaction pattern for the probes:

- `MovieDetails` / `TvDetails` / `BookDetails` counts equal the number of cleaned rows with at least one non-blank detail column
- a book's id inserted into `MovieDetails` is refused
- a `MovieDetails` row with `mediaType = 'BOOK'` is refused
- at least one `REJECTED` movie has a `MovieDetails` row
- the number of `BookDetails` rows with `ratingsCount = 0` equals the number of `0` values in `books.csv` (zeros are not lost)

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx data/etl/verify-load.ts`
Expected: FAIL on the three count checks (the tables are empty).

- [ ] **Step 3: Implement `lib/details.ts`**

Map cleaned columns to the Task 1 fields with `toInt`, `toNumber` and `cleanText`, so blank becomes `null` and `0` stays `0`. Never use `||` on these values. Text columns: `tagline`, `rated`, `content_rating`, `publisher`.

- [ ] **Step 4: Load them in `load-postgres.ts`**

Build the three arrays from `readProcessed('movies.csv')`, `tv_shows.csv` and `books.csv` using `ids.titles`, drop `null`s, and call `insertAll` for each straight after the `titles` insert, inside the same transaction. `TRUNCATE "Title" ... CASCADE` already reaches the new tables through the foreign key.

- [ ] **Step 5: Reload twice and verify**

Confirm with WH first. Run `npx tsx data/etl/load-all.ts --reset`, then again, then `npx tsx data/etl/verify-load.ts`.
Expected: both loads finish and `checks failed = 0`.

- [ ] **Step 6: Document and commit**

Add the three tables to the load section of `data/etl/README.md`, and update the `lib/titles.ts` comment saying detail columns have no Postgres home.

```bash
git add data/etl
git commit -m "feat(etl): load media details into PostgreSQL"
```

### Task 3: API returns `details`

**Files:**
- Modify: `packages/shared/src/dto/index.ts`, `apps/api/src/modules/titles/titles.service.ts`, `apps/web/src/api/mappers.test.ts` (fixtures only)
- Test: `apps/api/tests/integration/titles.test.ts`

**Interfaces:**
- Consumes: the Task 1 relations.
- Produces:

```ts
export type TitleDetailsDTO =
  | { mediaType: 'MOVIE'; runtimeMin: number | null; tagline: string | null; rated: string | null; letterboxdRating: number | null }
  | { mediaType: 'TV_SHOW'; numSeasons: number | null; duration: number | null; contentRating: string | null; metascore: number | null; userscore: number | null }
  | { mediaType: 'BOOK'; publisher: string | null; ratingsCount: number | null };
```

`TitleDetailDTO` gains `details: TitleDetailsDTO | null`. `TitleSummary` does not change.

- [ ] **Step 1: Write the failing tests in `titles.test.ts`**

Using the existing `findFirst` mock and `row()` helper:

- `returns movie details`: row with `movieDetails: { runtimeMin: 109, tagline: null, rated: 'R', letterboxdRating: 4.32 }` gives `details` equal to those plus `mediaType: 'MOVIE'`
- `returns TV details and keeps a score of 0`: `userscore: 0` comes back as `0`
- `returns book details and keeps a ratings count of 0`
- `returns null details when the title has no row`
- `ignores a details row of another type`: `mediaType: 'BOOK'` with a `movieDetails` row gives `null`
- `asks for all three relations`: `firstArgs(findFirst).select` has `movieDetails`, `tvDetails`, `bookDetails`
- `a hidden title still answers 404`: `findFirst` resolves `null`, status is 404, and the query's `where.status` is `'APPROVED'`

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/titles.test.ts` in `apps/api`
Expected: FAIL, `details` is undefined.

- [ ] **Step 3: Implement**

In `titles.service.ts` add `toDetails(t)`, which reads only the relation matching `t.mediaType`, and add the three relations to the `getTitle` select. Leave `summarySelect` alone so lists do not join. Add `details` to `TitleDetailDTO`. Add `details: null` to fixtures that break the web typecheck.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`, `npm run typecheck` and `npm run lint` at the root
Expected: all pass.

- [ ] **Step 5: Restart and smoke test**

The running API holds the old Prisma client, so its title page answers 500 until restarted. Restart it, then:
`curl -s localhost:4000/api/titles/<id> | python3 -m json.tool`
Expected: a movie id shows `details.runtimeMin`; a hidden movie's id answers 404.

- [ ] **Step 6: Commit**

```bash
git add packages/shared apps/api/src apps/api/tests apps/web/src/api/mappers.test.ts
git commit -m "feat(api): return media details on the title endpoint"
```

### Task 4: Show the facts on the title page

**Files:**
- Modify: `apps/web/src/types/title.ts`, `apps/web/src/api/mappers.ts`, `apps/web/src/components/TitleOverview.tsx`, `STATE.md`, `TASKS.md`, `ARCHITECTURE.md`
- Test: `apps/web/src/api/mappers.test.ts`
- Create: `apps/web/src/components/TitleOverview.test.tsx` (render with `renderWithProviders` from `src/test/utils.js`)

**Interfaces:**
- Consumes: `TitleDetailsDTO` from Task 3.
- Produces: `TitleDetail` gains optional `rated?: string`, `seasons?: string`, `publisher?: string`. Existing `runtime?: string` is now filled.

Shown: movies Runtime and Rated; TV Seasons, Runtime and Rated; books Publisher. Stored but not shown yet: tagline and the third-party scores (WH can add them later).

- [ ] **Step 1: Write the failing tests**

In `mappers.test.ts`:

- movie `runtimeMin: 109`, `rated: 'R'` maps to `runtime: '109 min'`, `rated: 'R'`
- TV `numSeasons: 1`, `duration: 50`, `contentRating: 'TV-MA'` maps to `seasons: '1 season'`, `runtime: '50 min per episode'`, `rated: 'TV-MA'`
- TV `numSeasons: 5` maps to `seasons: '5 seasons'`
- book `publisher: 'NYU Press'` maps to `publisher: 'NYU Press'`
- `details: null` and all-null details leave `runtime`, `rated`, `seasons` and `publisher` undefined

In `TitleOverview.test.tsx`: a title with `seasons` and `publisher` shows both labels, and a title with neither shows no "Seasons" or "Publisher" label.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/api/mappers.test.ts src/components/TitleOverview.test.tsx` in `apps/web`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add `mapDetails(d: TitleDetailsDTO | null)` to `mappers.ts` and spread it in `detailToTitle`. Add `Rated`, `Seasons` and `Publisher` to the `facts` list in `TitleOverview.tsx`; the existing `.filter` hides empty ones. Remove the "runtime is, but is not loaded" comment in `types/title.ts`.

- [ ] **Step 4: Run all checks**

Run: `npm test`, `npm run typecheck`, `npm run lint` at the root
Expected: all pass.

- [ ] **Step 5: Check it in the browser**

With `VITE_USE_MOCKS=false`, open one movie, one TV show and one book.
Expected: the right facts appear, and a book with no publisher shows no Publisher label.

- [ ] **Step 6: Record it and commit**

In `TASKS.md`, close "Where do runtime and publisher live?" In `ARCHITECTURE.md`, add the tables to the PostgreSQL row. In `STATE.md`, add the decision: details tables over MongoDB, because the three shapes are fixed and need SQL filtering, and a second store for one entity adds a consistency problem.

```bash
git add apps/web/src TASKS.md ARCHITECTURE.md STATE.md
git commit -m "feat(web): show runtime, seasons and publisher on the title page"
```

## After the plan

Update the Eraser relational diagram from the ER draft once the PR is merged. The Eraser links are team-only.
