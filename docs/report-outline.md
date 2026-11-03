# Report outline (10 pages maximum)

The grade is 25% relational and 25% NoSQL, so about half of the page budget should be evidence for those two. Each section has one named author who writes it in their own words (the project asks for each member's component). Page budgets add up to 9.75, leaving a quarter page for layout.

| #   | Section                                    | Pages | Author |
| --- | ------------------------------------------ | ----- | ------ |
| 1   | Problem and requirements                   | 0.5   | WH     |
| 2   | Architecture and why two databases         | 1.0   | WH     |
| 3   | Relational design (PostgreSQL)             | 1.75  | JW     |
| 4   | Document design (MongoDB)                  | 1.5   | HS     |
| 5   | Keeping two stores consistent              | 0.75  | HS, JW |
| 6   | Roles, security and the approval workflow  | 0.75  | RA     |
| 7   | Performance: plans, indexes and benchmarks | 2.0   | SJ     |
| 8   | Testing and CI                             | 0.5   | WH     |
| 9   | Limitations and what we would do next      | 0.5   | ALL    |
| 10  | Contributions                              | 0.25  | ALL    |

## What each section must contain, and where the evidence is

### 1. Problem and requirements (WH)

The product in three sentences, the three user roles (reader, creator, admin), and what the project spec requires of the data layer. Source: `README.md`, the project description PDF.

### 2. Architecture and why two databases (WH)

Figure: `docs/architecture.svg`. Say what lives where and why: PostgreSQL for entities with integrity and joins (titles, users, ratings, lists, moderation status); MongoDB for review text, flat replies, precomputed trending cards and poster bytes. Include the one sentence that a review is a rating (PostgreSQL) plus text (MongoDB) sharing one id. Source: `ARCHITECTURE.md`.

### 3. Relational design (JW; SJ writes the window-function paragraph)

- ER diagram (Eraser link in `docs/eraser-diagrams.md`; the Eraser file does not yet show the rank view or the two new `Title` indexes).
- Normalisation and the choice of per-media-type details tables with a composite key that stops a title changing type while it has details (`schema.prisma`, migration `title_details`).
- Constraints that carry the rules: `CHECK (rating BETWEEN 1 AND 5)`, unique `(userId, titleId)` on reviews and list entries, foreign keys with cascades.
- The four views (`title_rating_stats`, `genre_filter_options`, `trending_titles`, `creator_title_stats`) and the materialized view `title_rank_in_type` with `RANK()` and `PERCENT_RANK()`, refreshed concurrently; why materialized (a plain view would re-rank every title per page request).
- Transactions and locking: the title row lock (`lockTitle`) shared by add-to-list, create-review and delete; the real concurrent test that fails when the lock is removed. Source: `apps/api/tests/real/submissions.real.ts`.

### 4. Document design (HS)

- Collections and shapes: `reviewbodies` (`_id` equals the PostgreSQL review id; text plus a `mediaType` copy), `replies` (flat, one document per reply), `trendingcards` (denormalised card), `titleposters`.
- Why flat replies, why a `mediaType` copy, why trending cards are denormalised and refreshed by a job.
- Aggregation pipelines: review activity (`$match`, `$group`, `$dateToString`), top reviewers (`$group`, nested `$lookup`, hidden-title filter), recent counts. Show one pipeline and its explain output.
- Indexes and the measured effect: top reviewers 3.2 s to 0.8 s with `{titleId, userId}`; 1.4 s to 0.27 s with `{mediaType, titleId, userId}`; a rejected index and why. Source: `docs/benchmarks/explain.md`.

### 5. Keeping two stores consistent (HS and JW)

The write order (PostgreSQL transaction, then MongoDB, then undo the header if the second step fails), what is not atomic, the orphan cleanup job, and the tests that show it. Be explicit that compensation is best effort and failures are logged.

### 6. Roles, security and approval (RA)

Authentication (bcrypt, JWT in an httpOnly cookie), role checks per route, the rules (admins never write reviews, creators cannot review their own title), the approval workflow with the optimistic `updatedAt` version check, re-moderation on edit or image change. Say plainly that admin user management and review moderation are not finished.

### 7. Performance (SJ)

- Method and honesty: synthetic 950,000-title and 999,372-review data, one laptop, warm cache, noise up to about 35% on sub-millisecond rows, the 15% repeatability target missed and why that matters.
- Table: before and after plans (browse by rating 22.6 ms to 0.07 ms; reviews sort 51.7 ms to 0.02 ms; year sort left alone because Prisma 5.20 cannot declare `NULLS LAST`). Finding: a partial index on `status` was never used by Prisma's bound-parameter queries; the likely cause is a hypothesis, the behaviour is measured.
- SQL against NoSQL: five scenarios, one conclusion each (four ties; trending precompute about 900 times faster, a design result; the two-store path costs about 6 to 9 times a single-store read). Do not write that MongoDB is faster for reads: the data does not say that.
- Load tests (autocannon): trending 1,960 req/s, reviews 1,194, browse 496; browse limited by the `COUNT(*)` for the page total (about 25 ms). Mention that the load tests were run twice, once before and once after an extra every-minute trending scheduler was removed, and agreed within 5%.
- Source: `docs/benchmarks/explain.md`, `docs/benchmarks/results.md`.

### 8. Testing and CI (WH)

540 API tests with the stores stubbed, 492 web tests, 14 real-database tests, each rule checked by breaking the code on purpose; the CI jobs. State that the real-database CI job needs a green GitHub run before it is claimed.

### 9. Limitations and next steps (ALL)

Admin user and role management and review moderation; `pg_trgm` for rare-term search (95 to 101 ms on 950,000 titles); cached or approximate page totals; the missing year-sort index; Eraser diagrams to refresh; cold-cache benchmarks; browser checks of the creator and admin flows.

### 10. Contributions (ALL)

One line per member, matching `TASKS.md` owners: WH frontend and integration, JW schema, data load and lists, HS MongoDB reviews, replies and pipelines, SJ search, trending, window functions and benchmarks, RA authentication, roles and approval.

## Figures and tables (budget: five)

1. Architecture (`docs/architecture.svg`), 2. relational ER, 3. MongoDB collections, 4. before and after plan table, 5. benchmark conclusions table. Charts are not made yet (`TASKS.md` section 9).

## Things not to write

- That the creator or admin screens were tested with every browser or with assistive technology (only headless Chromium was used; see `docs/manual-test-checklist.md`).
- That MongoDB beat PostgreSQL on single reads or inserts (they tied).
- That the Prisma partial-index mechanism is proven (it is a hypothesis).
- That the benchmark data is real (it is synthetic and labelled so).
