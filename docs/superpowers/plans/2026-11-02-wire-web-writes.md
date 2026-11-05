# Wire the Website's Writes to the Real API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With `VITE_USE_MOCKS=false`, a signed-in user can write, edit and delete reviews and replies, use My Lists, and see their creator stats, all against the real API, instead of getting "Real API not wired yet".

**Architecture:** Every web API method already follows `if (!useMock) { real call } await delay(); mock behaviour`, as `titlesApi` and the read methods do. Each task fills in the real branch of one client module with `apiFetch`, which already sends the session cookie and clears the session on a 401. A first task fixes how `apiFetch` reads error bodies, because the API sends `{ "error": "..." }` and the client reads `message`.

**Tech Stack:** React, TypeScript, Vitest (fetch stubbed, as in `apps/web/src/api/real.test.ts`), the Express API on `localhost:4000` behind the Vite `/api` proxy.

**Spec:** `TASKS.md` section 8 ("Wire the writes to the real API") and `docs/api.md`. The endpoint shapes below were read from `apps/api/src/modules/*/`.

## Global Constraints

- Mock mode (the default in dev, `useMock === true`) must behave exactly as today. Never change the mock half of a method.
- Real calls go through `apiFetch` from `apps/web/src/api/client.ts` only. No direct `fetch`, so cookies (`credentials: 'include'`) and the 401 handler keep working.
- Path segments built from ids use `encodeURIComponent`, as the existing read methods do.
- A review is a star rating (whole number `RATING_MIN` to `RATING_MAX` from `apps/web/src/rating.ts`) and text. The API refuses a `fields` key with 400. Send only `{ rating, body }`.
- Admins never write reviews or replies. The UI already hides the forms; the API's 403 must still surface as its own message if it happens.
- No new dependencies. Conventional commit messages. No Claude attribution lines in commits (the user's rule).
- Work on a new branch `feat/web-wire-writes`, created from `refactor/review-body-details` (it needs the review changes in that branch).

## Out of scope (their endpoints do not exist yet)

- Creator title create, edit and delete, and the image upload (`creatorApi.submissions`, `submit`, `update`): JW has not built `POST/PATCH/DELETE /titles`. The image `PUT /titles/:id/poster` exists but has no title to attach to until then. These stay `notWired`.
- Admin pages (`adminApi.*`): RA's endpoints are not built. They stay `notWired`.
- Sign-in, register, `me` and logout already call the real `/auth/*`.

## Review Focus

1. **A server message must reach the user.** A 409 "You have already reviewed this title" or a 403 "Admins cannot write reviews or replies" must show as written, not as "Conflict". Pinned in Task 1.
2. **A validation failure must read like a sentence.** The API answers `{ error: 'ValidationError', details: { formErrors, fieldErrors } }`; showing "ValidationError" would be a bug. Pinned in Task 1.
3. **A write that gets a 401 must clear the session**, so the user is sent to log in with their draft kept. Pinned in Task 2.
4. **"No review yet" is a `null` body, not an error.** `GET /titles/:id/reviews/mine` returns `null` with status 200; the form must show. Pinned in Task 2, and the same for `GET /me/lists/by-title/:id` in Task 4.
5. **Deletes return 204 with no body.** `apiFetch` must resolve to `undefined`, and ids with `/` or spaces must be encoded. Pinned in Tasks 2 to 4.

---

## File Structure

- Modify `apps/web/src/api/client.ts`: error message extraction.
- Create `apps/web/src/api/client.test.ts`: tests for it.
- Modify `apps/web/src/api/reviews.ts`: real branches for `reviewsApi.mine/create/update/remove` and `repliesApi.create/update/remove`.
- Modify `apps/web/src/api/lists.ts`: real branches for all five `listsApi` methods.
- Modify `apps/web/src/api/creator.ts`: real branch for `creatorApi.stats` only.
- Modify `apps/web/src/api/real.test.ts`: real-mode tests; shrink the "methods that stay mock-only" list as methods get wired.
- Modify `README.md`, `TASKS.md`: run instructions and status.

---

### Task 1: Read the API's error bodies

**Files:**
- Modify: `apps/web/src/api/client.ts` (the `if (!res.ok)` block)
- Create: `apps/web/src/api/client.test.ts`

**Interfaces:**
- Consumes: the API's error bodies, `{ "error": string }` for `HttpError`, and `{ "error": "ValidationError", "details": { "formErrors": string[], "fieldErrors": Record<string, string[]> } }` for a Zod failure.
- Produces: `apiFetch` rejects with `ApiError(status, message)` where `message` is, in order: the first `formErrors` entry or the first entry of any `fieldErrors` array when `error === 'ValidationError'`; else the `error` string; else a legacy `message` string (existing test fixtures use it); else `res.statusText`. A `ValidationError` with no entries uses `'Please check what you entered'`.

- [ ] **Step 1: Write failing tests in `client.test.ts`** (fetch stubbed with `vi.stubGlobal`, the same `json()` helper as `real.test.ts`):
  - `uses the error text the API sends`: body `{ error: 'You have already reviewed this title' }`, status 409 → rejects with `{ status: 409, message: 'You have already reviewed this title' }`.
  - `turns a validation error into its first message`: body `{ error: 'ValidationError', details: { formErrors: [], fieldErrors: { body: ['Write something about this title'] } } }`, status 400 → message `'Write something about this title'`.
  - `falls back to a plain sentence for a validation error with no entries`: `{ error: 'ValidationError', details: { formErrors: [], fieldErrors: {} } }` → `'Please check what you entered'`.
  - `still reads a message field`: `{ message: 'Bad id' }`, 400 → `'Bad id'`.
  - `falls back to the status text when the body is not JSON`: a 502 `Response` with text body and `statusText: 'Bad Gateway'` → `'Bad Gateway'`.
  - `resolves undefined for a 204`.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/api/client.test.ts`. Expected: the first three FAIL.
- [ ] **Step 3: Implement** the message extraction in `apiFetch` as a small exported-for-test-free helper `errorMessage(body: unknown, fallback: string): string` in `client.ts`; keep the existing `/auth/` 401 rule unchanged.
- [ ] **Step 4: Run** `npx vitest run src/api` in `apps/web`. Expected: all PASS (the existing `{ message: ... }` fixtures still work).
- [ ] **Step 5: Commit** `fix(web): show the error text the API sends`.

---

### Task 2: Review writes

**Files:**
- Modify: `apps/web/src/api/reviews.ts` (`reviewsApi.mine`, `create`, `update`, `remove`)
- Modify: `apps/web/src/api/real.test.ts`

**Interfaces:**
- Consumes: `apiFetch<T>(path, init?)`; `mapReview(r: ReviewDTO): Review` from `./mappers.js`; `ReviewInput { rating: number; body: string }` from `../types/review.js`.
- Produces (signatures unchanged): `mine(titleId: string): Promise<Review | null>`, `create(titleId: string, input: ReviewInput): Promise<Review>`, `update(id: string, input: ReviewInput): Promise<Review>`, `remove(id: string): Promise<void>`.
- Endpoints: `GET /titles/:titleId/reviews/mine` → `ReviewDTO | null`; `POST /titles/:titleId/reviews` body `{ rating, body }` → 201 `ReviewDTO`; `PATCH /reviews/:id` body `{ rating, body }` → `ReviewDTO`; `DELETE /reviews/:id` → 204.

- [ ] **Step 1: Write failing tests** in a new `describe('reviewsApi writes (real)')` in `real.test.ts`:
  - `mine returns null when the user has no review`: fetch returns JSON `null` → `await reviewsApi.mine('t1')` is `null`; URL `/api/titles/t1/reviews/mine`.
  - `mine maps the review`: returns a `ReviewDTO` → result has `{ id, rating, body }` and no `fields` key.
  - `create posts only rating and body`: after `create('a/b c', { rating: 5, body: 'Loved it' })`, `lastCall()` is URL `/api/titles/a%2Fb%20c/reviews`, `init.method === 'POST'`, `JSON.parse(init.body)` equals `{ rating: 5, body: 'Loved it' }`.
  - `update patches the review`: method `PATCH`, URL `/api/reviews/r1`, same body shape.
  - `remove sends DELETE and resolves undefined on 204`: fetch returns `new Response(null, { status: 204 })`.
  - `a 409 on create carries the server message`: `{ error: 'You have already reviewed this title' }` → rejects `{ status: 409, message: 'You have already reviewed this title' }`.
  - `a 401 on create calls the unauthorized handler`: `setUnauthorizedHandler(spy)` before; response 401 `{ error: 'Unauthorized' }` → `spy` called once; reset the handler to `null` afterwards.
- [ ] **Step 2: Run** `npx vitest run src/api/real.test.ts`. Expected: the new tests FAIL with "not wired".
- [ ] **Step 3: Implement** the four real branches in `reviews.ts`, replacing each `notWired('review endpoints (HS)')` with the `apiFetch` call above, in the same `if (!useMock) { ... }` shape `listByTitle` uses. Build the request body from `{ rating: input.rating, body: input.body }` explicitly so nothing else is ever sent.
- [ ] **Step 4: Remove** the four `reviewsApi.*` rows from `'methods that stay mock-only'` in `real.test.ts`. Run `npx vitest run src/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): write, edit and delete reviews through the real API`.

---

### Task 3: Reply writes

**Files:**
- Modify: `apps/web/src/api/reviews.ts` (`repliesApi.create`, `update`, `remove`)
- Modify: `apps/web/src/api/real.test.ts`

**Interfaces:**
- Consumes: `apiFetch`; `mapReply(r: ReplyDTO): Reply`.
- Produces (signatures unchanged): `create(reviewId: string, body: string): Promise<Reply>`, `update(id: string, body: string): Promise<Reply>`, `remove(id: string): Promise<void>`.
- Endpoints: `POST /reviews/:reviewId/replies` body `{ body }` → 201 `ReplyDTO`; `PATCH /replies/:id` body `{ body }` → `ReplyDTO`; `DELETE /replies/:id` → 204.

- [ ] **Step 1: Write failing tests** in `describe('repliesApi writes (real)')`:
  - `create posts the text and maps the reply`: URL `/api/reviews/r1/replies`, method `POST`, body `{ body: 'hi' }`; result `{ id, reviewId, body }`.
  - `update patches the text`: URL `/api/replies/p%2F1`, method `PATCH`, body `{ body: 'edited' }`; a DTO with `editedAt` maps to a reply with `editedAt`.
  - `remove sends DELETE and resolves undefined`.
  - `an admin reply attempt shows the server's 403 message`: `{ error: 'Admins cannot write reviews or replies' }`, 403 → rejects with that message.
- [ ] **Step 2: Run** `npx vitest run src/api/real.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three real branches, same pattern as Task 2.
- [ ] **Step 4: Delete** the `'methods that stay mock-only'` describe block from `real.test.ts` entirely (it is now empty). Run `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): reply, edit and delete replies through the real API`.

---

### Task 4: My Lists

**Files:**
- Modify: `apps/web/src/api/lists.ts` (all five methods)
- Modify: `apps/web/src/api/real.test.ts`

**Interfaces:**
- Consumes: `apiFetch`; `ListItem` and `ListQuery` from `../types/list.js` (`ListItem` is structurally `ListItemDTO`, so no mapper is needed); `ListStatus`, `Paginated` from `@bingemate/shared`.
- Produces (signatures unchanged): `list(q: ListQuery): Promise<Paginated<ListItem>>`, `forTitle(titleId: string): Promise<ListItem | null>`, `add(titleId: string, status: ListStatus): Promise<ListItem>`, `setStatus(entryId: string, status: ListStatus): Promise<ListItem>`, `remove(entryId: string): Promise<void>`.
- Endpoints: `GET /me/lists?status=&mediaType=&page=&pageSize=` → `Paginated<ListItemDTO>`; `GET /me/lists/by-title/:titleId` → `ListItemDTO | null`; `POST /me/lists` body `{ titleId, status }` → 201 `ListItemDTO`; `PATCH /me/lists/:id` body `{ status }` → `ListItemDTO`; `DELETE /me/lists/:id` → 204.

- [ ] **Step 1: Write failing tests** in `describe('listsApi (real)')`:
  - `list sends only the filters that are set`: `list({ page: 2 })` → URL is `/api/me/lists?page=2&pageSize=12`; `list({ status: 'PLAN_TO', mediaType: 'BOOK', page: 1 })` → the query string contains `status=PLAN_TO`, `mediaType=BOOK`, `page=1`, `pageSize=12`.
  - `list returns the page as sent`: the `Paginated` body comes back with `total` intact.
  - `forTitle returns null when the title is not on the list` (200 with JSON `null`); URL `/api/me/lists/by-title/a%2Fb`.
  - `add posts titleId and status`: method `POST`, body `{ titleId: 't1', status: 'COMPLETED' }`.
  - `a second add shows the server's 409 message`: `{ error: 'This title is already on your list' }`.
  - `setStatus patches only the status` and `remove sends DELETE and resolves undefined on 204`.
- [ ] **Step 2: Run** `npx vitest run src/api/real.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the five real branches. Build the `list` query with `URLSearchParams`, adding `status` and `mediaType` only when defined, and `pageSize` from the file's existing `PAGE_SIZE` (12).
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): My Lists through the real API`.

---

### Task 5: Creator stats

**Files:**
- Modify: `apps/web/src/api/creator.ts` (`creatorApi.stats` only)
- Modify: `apps/web/src/api/real.test.ts`

**Interfaces:**
- Consumes: `apiFetch`; `CreatorTitleStatsDTO` from `@bingemate/shared` (`{ titleId, name, status, reviewCount, avgRating, listAdds }`); `TitleStatus`.
- Produces: `stats(): Promise<CreatorStat[]>` (`CreatorStat` in `../types/creator.js` has no `status`). Decision: keep only rows whose `status` is `TitleStatus.APPROVED`, as the mock does, and drop the `status` field.
- Endpoint: `GET /creator/stats` → `CreatorTitleStatsDTO[]` (a bare array, not paginated), CREATOR only.

- [ ] **Step 1: Write failing tests** in `describe('creatorApi.stats (real)')`:
  - `maps rows and keeps only approved titles`: a response with one APPROVED and one PENDING row → exactly the approved one, shaped `{ titleId, name, avgRating, reviewCount, listAdds }`, with no `status` key.
  - `an empty array gives an empty list`.
  - `a 403 for a non-creator shows the server message`.
  - Also assert that `creatorApi.submissions()` still rejects with `/not wired/i` against the real API, so the out-of-scope methods stay honest.
- [ ] **Step 2: Run** `npx vitest run src/api/real.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the real branch of `stats`.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit` and `npx eslint src` in `apps/web`. Expected: all clean.
- [ ] **Step 5: Commit** `feat(web): creator stats through the real API`.

---

### Task 6: Run it live, and write it down

**Files:**
- Modify: `README.md` (a "Run with real data" section)
- Modify: `TASKS.md` (section 8 write-wiring item, the sign-in note that is out of date)

**Interfaces:** none.

- [ ] **Step 1: Document the live run** in `README.md`: `npm run db:up`, `cd apps/api && npm run dev`, `cd apps/web && VITE_USE_MOCKS=false npm run dev`; the dataset accounts (`admin@bingemate.dev`, `creator@bingemate.dev`, `user4@seed.bingemate.local`, password `Password123!`); that the website is always on port 5173, and that mocks are the dev default so a plain `npm run dev` shows fake data.
- [ ] **Step 2: Update `TASKS.md` section 8**: mark the review, reply and My Lists write wiring and creator stats as done on this branch; list the creator title endpoints and admin pages as the only reads-only gaps and name their owners; correct the line saying sign-in still uses mock data.
- [ ] **Step 3: Verify in the real stack** (the API and the web app started as in the README, signed in as `user4@seed.bingemate.local`), and tick each:
  - open a title the user has not reviewed, post a 4-star review: it appears, the average and count change
  - reload: the form shows "You have already reviewed this title"; edit the review to 2 stars: it saves
  - reply to it, edit the reply, delete the reply, delete the review: the title returns to its original average and count
  - post a review twice quickly: the second shows the server's "already reviewed" message
  - add a title to My Lists, change its status, remove it
  - sign in as `creator@bingemate.dev`: the creator stats page loads (empty is correct, the demo creator owns no titles)
  - sign in as `admin@bingemate.dev`: no review form is shown
- [ ] **Step 4: Run the whole suite**: `npm run typecheck && npm run lint && npm test` from the repo root. Expected: all pass.
- [ ] **Step 5: Commit** `docs: run the website on real data, update the task list`.

---

## Self-review

- **Spec coverage:** every write method in `reviewsApi`, `repliesApi`, `listsApi` and `creatorApi.stats` has a task; the out-of-scope methods are named with their owners.
- **Type consistency:** every signature above matches the existing declarations in `reviews.ts`, `lists.ts` and `creator.ts`; `ReviewInput` is `{ rating, body }` after the stars-and-text change.
- **Review Focus:** each of the five lines has its test in the task named.
