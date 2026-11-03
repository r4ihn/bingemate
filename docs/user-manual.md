# BingeMate user manual

## 1. What BingeMate is

You use BingeMate to browse movies, TV shows and books, read and write reviews, reply to reviews, and keep personal lists. Creators submit titles. Admins approve or reject them. The source contains a React website and an Express API. This manual describes the current source, including features that are still incomplete.

- PostgreSQL holds accounts, password hashes and roles.
- PostgreSQL holds titles, approval status, genres, people and media details.
- PostgreSQL holds list entries, review ratings, rating totals and ranking views.
- MongoDB holds review text, replies, poster images and cached trending cards.
- A PostgreSQL review ID matches its MongoDB review-body ID; there is no transaction across both stores.

## 2. What you need

You need Node.js 20 or later, as declared in the root `package.json` engines, npm, and Docker with Docker Compose. Extract the source zip and open a terminal in the repository root.

Keep these local ports available:

| Port  | Service       |
| ----- | ------------- |
| 5173  | Vite website  |
| 4000  | Express API   |
| 5432  | PostgreSQL 16 |
| 27017 | MongoDB 7     |

The database ports bind to `127.0.0.1`. Docker volumes preserve their data between container restarts.

## 3. Set it up

Run these commands in order from the repository root:

```sh
npm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
npm run prisma:migrate
npm run prisma:generate
```

Before you start the API, replace the example `JWT_SECRET` in `apps/api/.env` with a long random string. The API requires at least 16 characters. The example database URLs match Compose: PostgreSQL uses database, user and password `bingemate`; MongoDB uses database `bingemate`.

Choose **one** data option below. Do not seed before loading the dataset.

### Option A: load the dataset

You need the raw inputs described in [the ETL README](../data/etl/README.md) in `data/raw/`. Raw and processed data are gitignored. If your zip does not include the inputs, use Option B.

```sh
npx tsx data/etl/clean-all.ts
npx tsx data/etl/load-all.ts
npx tsx data/etl/verify-load.ts
npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts
```

The loader reads `apps/api/.env`. It loads PostgreSQL headers and MongoDB bodies together. It refuses non-empty stores without `--reset`. That flag wipes and reloads data, so use it only when you intend to replace your local dataset. Do not reset just one store; their IDs must agree.

You get `admin@bingemate.dev`, `creator@bingemate.dev` and imported users. Every loaded user has password `Password123!`. There is **no `consumer@bingemate.dev`** after this option. Use an imported reader such as `user4@seed.bingemate.local`, as listed in the root README. Imported titles are approved and have no creator owner.

### Option B: use the small demo seed

```sh
npm run seed
```

On a fresh database, you get these accounts. Each has password `Password123!`.

| Email                  | Role     |
| ---------------------- | -------- |
| admin@bingemate.dev    | Admin    |
| creator@bingemate.dev  | Creator  |
| consumer@bingemate.dev | Consumer |

You also get approved sample titles `Inception`, `Dune` and `Breaking Bad`, plus the creator's pending `My Indie Film`. This seed does not create reviews or MongoDB review bodies. Existing accounts are kept by the seed; it does not reset their passwords.

### Start the API and website

In one terminal at the repository root:

```sh
npm run dev:api
```

In another terminal at the repository root:

```sh
VITE_USE_MOCKS=false npm run dev:web
```

Open `http://localhost:5173`. The API is at `http://localhost:4000/api`.

**Mocks off means the real API.** In development, page data uses mocks by default. Keep `VITE_USE_MOCKS=false` for your real-data demonstration. Authentication calls the API independently of that page-data switch.

For a persistent web setting, optionally run `cp apps/web/.env.example apps/web/.env.local`, then set `VITE_USE_MOCKS=false` there. Remove any `VITE_MOCK_ROLE` override when checking real sign-in. Restart Vite after changing its environment settings. Leave `VITE_API_URL` empty to use the development proxy to port 4000. If you use an absolute API base, include `/api`, for example `http://localhost:4000/api`.

## 4. Using the site

The steps below come from routes, components and API rules in the source. Creator and admin flows have not been clicked through in a real browser. Do not treat these instructions as evidence of browser testing.

### Visitor

Open **Browse**, or use **Menu** on a narrow screen. Choose **All**, **Movies**, **TV** or **Books** to filter by type. Use the page controls below the results to move between pages. Public browsing returns approved titles only.

Choose **Search** in the top bar and enter part of a title's name. Search ignores case. You can choose a media type in the search scope. Choose a suggestion to open its title page. Press Enter without a selected suggestion, or choose **See all results for…**, to open Browse results. The real API client limits search text to 100 characters.

Browse currently has no genre filter or sort control. Adding `genre` or `sort` to the website's Browse URL does not enable those controls. You can inspect the API directly in your browser instead:

```text
http://localhost:4000/api/genres?type=MOVIE
http://localhost:4000/api/titles?type=MOVIE&genre=Drama&sort=rating
```

The API accepts genre names without regard to case. Its sorts are `name` (alphabetical, default), `rating` (highest first), `year` (newest first, missing years last) and `reviews` (most first). It also accepts `minRating` and an exact `year`. These API options are not yet exposed by Browse.

Choose a title card to open `/titles/:id`. You can read the synopsis, available facts, average rating out of 5, and reviews. Reviews are newest first. Long review text has a **Read more** control. Missing optional facts are hidden.

When ranking data exists, you see a line such as `#3 in Movies · top 1%`. This is the requested “#N in Movies - top X%” rank line; the screen uses a middle dot. The media label changes for books and TV shows. The line is hidden when the title is unranked or its rank lookup fails. Ranks refresh with the trending job.

There is no dedicated trending page or `/trending` website route yet. Home has a **Trending now** strip, but its hero, strip and media rails use the first approved titles from the titles API, in name order. They do not use the trending API.

To inspect actual cached trending data, open `http://localhost:4000/api/trending`. You receive JSON, not a website page. The API supports `type=MOVIE|TV_SHOW|BOOK`, `limit=1` through `50`, and `sort=score|recent`. Score is the default. Recent sorting uses counts over a fixed 1460-day window calculated during refresh. You cannot change that window with a `days` parameter. The candidates remain the SQL score view's top 50 per type. Deleted or unapproved titles are excluded from the response.

### Signed-in reader

Choose **Sign in**, then **Create an account**, or open `/register`. Enter an email and password and choose **Create account**. Your password needs at least eight characters, a letter and a digit. Registration creates a consumer account. You cannot select a creator or admin role here. To use an existing account, enter its credentials at `/login` and choose **Log in**. Choose **Log out** in the top bar to end the session.

On an approved title page, use **Write a review**. Choose 1 to 5 whole stars, enter text in **Your review**, and choose **Post review**. You can have only one review per title. Half stars are refused. Review text must be non-empty and at most 10,000 characters.

If you already reviewed the title, choose **Edit review** above the reviews or **Edit** on your own review card. Change your stars or text and save. Use **Delete** on your review and confirm **Delete** to remove it and its replies. You can edit only your own review. An admin can also delete it.

Choose **Reply** under a review, enter text, and choose **Post reply**. Replies form one flat list, oldest first. Longer threads have a control to show more replies. You can **Edit** your own reply and choose **Save changes**, or **Delete** it with confirmation. Reply text must be non-empty and at most 2,000 characters. A changed reply shows an edited mark. An admin can delete replies too.

Creators can review other people's titles, but cannot review a title they created. They can reply under their own titles. Admins never write or edit reviews or replies. Reviews and replies are available only under approved titles.

On a title page, use **Add to list** and choose **Completed**, **In progress** or **Plan to**. These correspond to `COMPLETED`, `IN_PROGRESS` and `PLAN_TO`. Use the same control to change status or choose **Remove from list**. A title can appear only once in your list.

Open **My Lists** or **Save** to see your entries at `/me/lists`. Choose a status tab and media type. Change an entry's status with its dropdown. Choose **Remove** and confirm **Remove** to take it out. Entries for titles that are no longer approved are hidden. You see only your own list.

### Creator

Sign in with the creator account. Open **Creator** at `/creator`. You see **My submissions**, with status and a **Note** column for the rejection reason.

Choose **New submission**. Enter **Title**, choose **Type**, and enter **Synopsis** if needed. You may choose a **Poster image (optional)**. The form accepts JPEG, PNG or WebP and rejects files over 8 MB. It shrinks the image before uploading; the API accepts at most 1 MB. Wait for image preparation to finish, then choose **Submit for approval**.

The title is saved before the optional image is uploaded. If creation succeeds but image upload fails, the message says the title was saved. Return to your submissions and edit that title to retry the image.

| Stored status | Meaning for you                                                                    |
| ------------- | ---------------------------------------------------------------------------------- |
| PENDING       | Waiting for approval. Hidden from public Browse and title detail.                  |
| APPROVED      | Publicly available. Readers can review and list it.                                |
| REJECTED      | Not public. Read the reason in Note, if the admin supplied one. Edit and resubmit. |

Choose **Edit** on a submission and **Save changes** after editing. The type cannot change after creation. Saving an approved or rejected submission sends it back to `PENDING` and clears the rejection reason. For an approved title, confirm **Save and re-submit**. It stays hidden until an admin approves it again.

Replacing or uploading an approved title's image as its creator also sends it to `PENDING`. Removing an image through the image DELETE endpoint alone does not change status. Saving through the edit form still resubmits the title because that form also saves its text fields. **Remove image** first discards a newly chosen replacement; a second press removes the existing image.

Choose **Delete** on a submission or approved-title stats row. Read **Delete this title? This cannot be undone.** Choose **Confirm** to delete or **Cancel** to keep it. You can delete your own title only while no other user has reviewed or listed it. Otherwise the API refuses deletion and tells you to ask an admin. An admin can delete through the title DELETE API; the approval queue has no title-delete button.

Choose **Stats** at `/creator/stats`. You see your approved titles with **Avg rating**, **Reviews** and **List adds**. Pending and rejected titles do not appear on this screen. Imported titles have no creator owner, so they do not populate the demo creator's stats.

### Admin

Sign in with the admin account and open **Admin**, then **Approval queue** at `/admin/queue`. The queue lists pending titles oldest first. The web client requests up to 50 titles at once. After decisions, it reloads the queue.

Choose **Approve** to publish a title. To reject it, enter a reason in **Rejection reason**, then choose **Reject**. You should give the creator a useful reason. The field is optional in the code, with a limit of 500 characters; it is not mandatory. A rejection hides the title and makes the reason available to its creator.

If two admins act on the same version of a title, the later request receives HTTP 409: **This title changed after you opened it. Reload the queue and review it again.** The screen displays this message and reloads. Review the current title before deciding again.

Admin user/role management and review moderation are not built yet as working real-API screens. **Users** and **Moderation** have mock UI, but their admin endpoints and real wiring are missing. With mocks off, those screens fail to load. Existing review and reply DELETE endpoints already allow admins to delete, including through controls on public title pages. This does not provide a complete admin moderation dashboard.

## 5. Background jobs and maintenance commands

Run maintenance commands from the repository root with your local databases running and `apps/api/.env` configured.

The trending refresh copies the SQL view's top 50 reviewed, approved titles per media type into MongoDB cards. It adds recent-review counts, upserts cards before deleting stale cards, and attempts to refresh the title-rank materialized view. An empty SQL result keeps existing cards and skips the rank refresh. A recent-count aggregation failure prevents card writes.

```sh
npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts
```

The API performs an empty-collection startup check. Its configurable timer defaults to 10 minutes and accepts `TRENDING_REFRESH_MINUTES` from 0 to 1440. **Setting 0 does not currently switch refreshing off.** An older scheduler also runs immediately and every minute. Both run independently and can overlap. See [TASKS.md section 6](../TASKS.md#6-search-filtering-trending-queries-sj-week-910).

Orphan cleanup removes MongoDB review bodies and replies whose PostgreSQL review no longer exists, in bounded batches. It covers a reply posted during review deletion. It is not scheduled automatically.

```sh
npx tsx --env-file=apps/api/.env apps/api/src/jobs/cleanupOrphans.ts
```

For older imports with undated reviews stored as `1900-01-01`, preview the backfill, then apply it:

```sh
npx tsx --env-file=apps/api/.env data/etl/backfill-undated-dates.ts
npx tsx --env-file=apps/api/.env data/etl/backfill-undated-dates.ts --apply
```

You need the existing `data/processed/reviews.csv` and `id-map.json`. The script refuses remote databases and updates only matching placeholder dates. It uses deterministic, made-up dates from 2022–2025 in both stores. These are not real review dates. Fresh dataset loads already use these dates. See [the ETL README](../data/etl/README.md).

## 6. Running the tests

Run the normal suite from the root:

```sh
npm test
```

This suite uses stubbed database access and needs no running databases. It does not establish that creator or admin screens work in a real browser.

For the separate real-database suite, start Docker and use isolated databases whose names end in `_test`:

```sh
docker exec bingemate-postgres createdb -U bingemate bingemate_test
export TEST_DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_test?schema=public'
export TEST_MONGO_URI='mongodb://localhost:27017/bingemate_test'
npm run test:real --workspace apps/api
```

Skip `createdb` if that test database already exists. Global setup applies migrations. **The suite truncates every app table and drops MongoDB collections in those test databases.** Never point these variables at data you want to keep. MongoDB creates its database when data is written.

Run the code checks from the root:

```sh
npm run lint
npm run typecheck
```

## 7. Benchmarks

You can find the seed, runner and five workload scenarios in `benchmarks/`. The scale data is **synthetic**, not 950,000 real films. The seed generates titles across all three media types and reuses processed review text for document sizes. Prepare `data/processed/review_bodies.jsonl` through ETL first.

Follow [benchmarks/README.md](../benchmarks/README.md) to create `bingemate_bench` in PostgreSQL and deploy the schema there. Both benchmark database names must end in `_bench`. Set the dedicated variables, then use these three commands to seed, run workloads and inspect query plans:

```sh
export BENCH_DATABASE_URL='postgresql://bingemate:bingemate@localhost:5432/bingemate_bench?schema=public'
export BENCH_MONGO_URI='mongodb://localhost:27017/bingemate_bench'
npx tsx benchmarks/seed-bench.ts --titles 950000 --reviews 1000000 --users 100000 --replies 300000
npx tsx benchmarks/run.ts --scenario all --runs 200 --warmup 20
npx tsx benchmarks/explain.ts --label mine
```

The seed refuses non-empty targets unless you request `--reset`, which deletes benchmark data. Recorded workload and query-plan write-ups are in [docs/benchmarks/](benchmarks/), especially [results.md](benchmarks/results.md) and [explain.md](benchmarks/explain.md). Raw workload output goes in `benchmarks/results/`.

## 8. Troubleshooting

| Problem                                                                                      | What you can do                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker cannot start the database containers                                                  | Start Docker, then retry `docker compose up -d`. Use `docker compose ps` to check the containers and their health.                                                                                                                                          |
| A port is already in use                                                                     | Stop the conflicting local service or earlier BingeMate process. The expected ports are 5173, 4000, 5432 and 27017. Keep 5173 free so the web origin matches `WEB_ORIGIN`.                                                                                  |
| API fails to connect, or PostgreSQL authentication fails                                     | Check `DATABASE_URL` in `apps/api/.env` and any exported override. For the supplied Compose setup use `postgresql://bingemate:bingemate@localhost:5432/bingemate?schema=public`. Check `MONGO_URI` too, then restart the API.                               |
| Tables or SQL views are missing                                                              | Run `npm run prisma:migrate` and `npm run prisma:generate` against your local application database, then restart the API.                                                                                                                                   |
| API reports invalid environment configuration                                                | Copy the API env example, fill required values, and ensure `JWT_SECRET` has at least 16 characters. `TRENDING_REFRESH_MINUTES` must be an integer from 0 to 1440.                                                                                           |
| You still see fake titles after importing                                                    | Restart the website with `VITE_USE_MOCKS=false`. Check `.env.local` for overrides and remove `VITE_MOCK_ROLE` when checking real accounts.                                                                                                                  |
| `consumer@bingemate.dev` cannot log in after dataset loading                                 | Use `user4@seed.bingemate.local` with `Password123!`, or register an account. The dataset does not create the demo consumer.                                                                                                                                |
| Trending JSON is empty                                                                       | Run the refresh CLI in section 5. The small seed has no reviews, so the trending SQL view has no candidates until approved titles receive reviews. Home's strip is separate and does not show this cache.                                                   |
| Images do not show with an absolute `VITE_API_URL`                                           | Use a reachable API base including `/api`, such as `http://localhost:4000/api`, and restart Vite. Root-relative poster URLs resolve against that API host. Check that the image exists; pending/rejected images are visible only to their owner and admins. |
| HTTP 401 `Invalid email or password`                                                         | Check your email, password and chosen data option. Both an unknown email and a wrong password produce this message.                                                                                                                                         |
| HTTP 401 `Not authenticated` or `Invalid or expired token`                                   | Log in again. Protected requests require the session cookie. Keep the browser host consistent with your API and configured web origin.                                                                                                                      |
| HTTP 403 `Forbidden`                                                                         | Use the account role required by that route. Registration gives you a consumer account.                                                                                                                                                                     |
| HTTP 403 `You cannot review a title you created` or `Admins cannot write reviews or replies` | Reply as the owning creator, or use a consumer to review. Admin accounts cannot write reviews or replies.                                                                                                                                                   |
| HTTP 409 `You have already reviewed this title`                                              | Edit your existing review, or delete it before posting a new one.                                                                                                                                                                                           |
| HTTP 409 `This title is already on your list`                                                | Reload the title/list and change its existing status instead of adding a duplicate entry.                                                                                                                                                                   |
| HTTP 409 `Email already in use`                                                              | Log in with that email or register a different email. Email is trimmed and lowercased.                                                                                                                                                                      |
| HTTP 409 while deleting your title                                                           | Other users have reviewed or listed it. Ask an admin to remove it. Retrying as the creator cannot bypass this restriction.                                                                                                                                  |
| HTTP 409 while deciding an approval                                                          | Reload and review the current title. The exact stale-version message is in the admin instructions above.                                                                                                                                                    |
| Creator image upload fails after title creation                                              | Return to My submissions and edit the saved title. Retry with JPEG, PNG or WebP. Do not submit a duplicate title.                                                                                                                                           |
| Users or Moderation fails to load with mocks off                                             | Those real admin endpoints are missing. Use the implemented Approval queue; there is no setup command that enables the missing screens.                                                                                                                     |

## Known gaps

The following tracker entries are copied from [TASKS.md section 12](../TASKS.md#12-known-gaps-and-follow-ups-found-in-code-review-2930-oct). Their test-status statements are the tracker's record, not tests performed for this manual. The final entry's separate-poster-query claim is stale: `apps/api/src/jobs/refreshTrending.ts` now joins poster URLs in its ranking SQL.

- [x] **500 on malformed JSON** — fixed on 3 Nov: parser errors return fixed 400/413 JSON responses; unknown routes return 404 `{error: 'Not found'}`. Unexpected errors still log `Unhandled error:` and return only 500 `{error: 'InternalServerError'}`. Regression tests added; API Supertest execution remains pending outside the sandbox (listen EPERM) _(WH)_

- [~] **A reply posted while its review is being deleted can be left behind.** The reply check passes, the review and its replies are deleted, then the reply is saved. `cleanupOrphans` covers this race by removing Mongo review bodies and replies whose PostgreSQL review is gone, in bounded batches. Run manually from the repo root: `npx tsx --env-file=apps/api/.env apps/api/src/jobs/cleanupOrphans.ts`. Unit tests use stubbed stores; real-database verification is pending. The job is not scheduled automatically _(HS)_

- [~] **Deleting a title leaves nothing behind in MongoDB** now (review bodies, replies and the image are removed after the PostgreSQL delete, and a MongoDB failure is logged without failing the delete). **Deleting a user still leaves its review bodies and replies behind**; whoever builds user delete must remove them too _(RA)_. The trending read now drops cards whose title is no longer approved, so a deleted, rejected or re-submitted title stops showing there at once
- [x] **A creator can change the image of an approved title with no re-moderation**: done on `main` (PR #11). A creator's image replacement sends an approved title back to `PENDING` before the stored bytes are overwritten, so the old public URL never serves an unreviewed image. Removing the image does not re-moderate, since nothing unreviewed is published _(WH, JW)_
- [x] **The owner cannot see the image of their own pending title**: done on `main` (PR #11). The owner and admins can fetch it; everyone else gets the same 404 as for a missing image _(WH)_
- [x] **An empty `trending_titles` view keeps existing cards.** The refresh job warns and returns `{upserted: 0, removed: 0}` without writes or deletion. Socket-free unit and existing job tests pass; non-empty upserts and stale-card deletion are unchanged. Live-database verification remains pending _(SJ)_
- [ ] Small shared helpers are repeated across modules (the title id param schema, the admin-cannot-write check, the page/pageSize schema), and `titles.routes.ts` still uses try/catch instead of the `route()` helper. The trending job also reads poster URLs with a second query that could be a JOIN in its ranking SQL. Tidy once the modules have merged _(WH)_

Additional open problems from the tracker and current code:

- Admin user/role and review-moderation endpoints are not built. Their screens have mock implementations only. Title approval endpoints are implemented.
- The older every-minute trending scheduler still runs alongside the configurable timer. Setting `TRENDING_REFRESH_MINUTES=0` does not stop it (section 6).
- Search uses `ILIKE`. Whether to add the `pg_trgm` extension is still a team decision after rare-term searches approached 100 ms on synthetic scale data (section 6).
- Browse still performs a total count for pagination. The tracker records about 25 ms on the synthetic benchmark data, now the largest part of a browse request (section 6).
- Genre/rating/sort controls and the real trending website view remain incomplete. Creator and admin browser walkthroughs, manual keyboard checks and the phone layout pass remain pending (section 8).
