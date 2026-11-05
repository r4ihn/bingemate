# Creator Upload and Admin Approval Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A creator can upload a title (with an optional image), edit and delete their own titles, and see their submissions with status; an admin can list pending titles and approve or reject them, so an approved title appears in browse.

**Architecture:** Approval stays (WH's choice on 2026-11-02): a creator's title is saved `PENDING` and hidden from the public reads, which already filter on `APPROVED`. New API modules sit beside the existing ones: `titles/submissions.*` for the creator's writes, `creator.routes.ts` gains `GET /creator/titles`, and `admin/adminTitles.*` for the admin queue. The web client's mock-only methods get real branches in the same style as the earlier wiring.

**Tech Stack:** Express, Prisma (PostgreSQL), Mongoose (MongoDB), Zod, Vitest + Supertest with Prisma and Mongoose stubbed (see `apps/api/tests/integration/creatorStats.test.ts` and `reviews.test.ts`), React.

**Spec:** `TASKS.md` §0 (creator privileges, creator-uploaded titles), §2 (creator title endpoints), §4 (approval queue), §8 (creator upload flow), §12 (Mongo leftovers on title delete).

## Global Constraints

- A creator's new title is saved with `status = PENDING`, `createdById` = the signed-in creator, and is hidden from `GET /api/titles` and `GET /api/titles/:id` (they already filter `APPROVED`; do not change them).
- Editing a title that is `APPROVED` or `REJECTED` sends it back to `PENDING` and clears `rejectionReason` (TASKS §0 extra (c)).
- Only `Role.CREATOR` creates and edits titles, and only their own. An admin never creates or edits a title; an admin or the owning creator may delete one.
- `mediaType` cannot change after a title exists: the review bodies in MongoDB carry a copy of it. The PATCH schema refuses it.
- Limits: `name` 1 to 200 characters after trimming; `description` up to 5000 characters, empty counts as none; `rejectionReason` up to 500 characters.
- Responses use the `{ "error": "..." }` shape through `HttpError`. Reuse `route`, `userOf`, `validate`, `authenticate`, `authorize` as the review and list modules do.
- Deleting a title removes its MongoDB leftovers (review bodies, replies, image) after the PostgreSQL delete; a MongoDB failure is logged and must not turn a successful delete into an error.
- Mock mode on the web stays exactly as today. No new dependencies. Conventional commits, no Claude attribution lines.
- Branch `feat/web-wire-writes` (already checked out). Codex cannot write to `.git`: it edits files and runs checks, the lead commits.

## Out of scope

- Admin users and moderation endpoints (`GET /admin/users`, `PATCH /admin/users/:id/role`, `GET /admin/reviews`): RA's, the queue here is only the title part.
- Showing a creator the image of their own `PENDING` title: the image route serves only approved titles (TASKS §12 gap), so a pending title's image stays hidden until approval.
- A delete button for creators in the web UI: the endpoint exists after Task 3, the page does not use it yet.

## Review Focus

1. **Nobody else can write.** A consumer, an admin, or an anonymous visitor creating or editing a title, and a creator editing or deleting another creator's title, must be refused (401 or 403) with nothing written. Pinned in Tasks 1 to 3.
2. **Approval state must move correctly.** Editing an approved or rejected title returns it to `PENDING` and clears the reason; an admin cannot set a title back to `PENDING`, and a rejection reason is stored only for `REJECTED`. Pinned in Tasks 2 and 5.
3. **Delete leaves nothing behind.** Review bodies, replies and the image go too, and a MongoDB error does not fail the delete. Pinned in Task 3.
4. **Bad input is refused, not stored.** A whitespace-only name, an oversize description, a `mediaType` in a PATCH, or an unknown key gives 400 and writes nothing. Pinned in Tasks 1 and 2.
5. **A half-finished upload says so.** If the title is saved but its image upload fails, the creator must be told the title exists and that only the image failed. Pinned in Task 6.

---

## File Structure

- Modify `packages/shared/src/dto/index.ts`: add `SubmissionDTO`.
- Create `apps/api/src/modules/titles/submissions.schema.ts`, `submissions.service.ts`, `submissions.routes.ts`: creator create, edit, delete and own list.
- Modify `apps/api/src/modules/creator/creator.routes.ts`: `GET /creator/titles`.
- Modify `apps/api/src/routes.ts`: mount the new routers.
- Create `apps/api/src/modules/admin/adminTitles.schema.ts`, `adminTitles.service.ts`, `adminTitles.routes.ts`.
- Create tests `apps/api/tests/integration/submissions.test.ts`, `adminTitles.test.ts`.
- Modify `apps/web/src/api/creator.ts`, `admin.ts`, `apps/web/src/pages/creator/SubmissionForm.tsx`, `apps/web/src/api/real.test.ts`.
- Modify `TASKS.md`, `docs/api.md`.

---

### Task 1: Create a submission

**Files:**
- Modify: `packages/shared/src/dto/index.ts`
- Create: `apps/api/src/modules/titles/submissions.schema.ts`, `submissions.service.ts`, `submissions.routes.ts`
- Modify: `apps/api/src/routes.ts`
- Test: `apps/api/tests/integration/submissions.test.ts`

**Interfaces:**
- Produces in shared: `interface SubmissionDTO extends TitleSummary { description: string | null; rejectionReason: string | null }`.
- Produces in `submissions.schema.ts`: `createSubmissionSchema` (strict `{ name: string, mediaType: MediaType, description?: string }`), type `CreateSubmissionInput`.
- Produces in `submissions.service.ts`: `toSubmission(row: SubmissionRow): SubmissionDTO` (also reused by Tasks 2 to 5), `createSubmission(user: AuthUser, input: CreateSubmissionInput): Promise<SubmissionDTO>`.
- Produces in `submissions.routes.ts`: `submissionsRouter` with `POST /` (authenticate, `authorize(Role.CREATOR)`, validate body, 201), mounted in `routes.ts` at `/titles` after the poster and review routers and before `titlesRouter`.

- [ ] **Step 1: Write failing tests** in `submissions.test.ts` (stub `prisma.title.create`, sign cookies with `signToken` as in `reviews.test.ts`):
  - `needs a signed-in user`: no cookie → 401, `title.create` not called.
  - `refuses a consumer and an admin`: both → 403, not called.
  - `creates a PENDING title owned by the creator`: creator `c1` posts `{ name: '  Dune  ', mediaType: 'MOVIE', description: 'Sand.' }` → 201; `title.create` called with `data` containing `name: 'Dune'`, `mediaType: 'MOVIE'`, `description: 'Sand.'`, `createdById: 'c1'` and **no `status` of APPROVED** (status is either omitted or `'PENDING'`); body has `status: 'PENDING'`, `rejectionReason: null`, `description: 'Sand.'`.
  - `stores an empty description as none`: `description: '   '` → `data.description` is `null`.
  - `rejects bad input with 400 and writes nothing`, `it.each`: whitespace-only name; name of 201 characters; description of 5001 characters; unknown `mediaType: 'PODCAST'`; an extra key `status: 'APPROVED'`; an extra key `createdById: 'x'`.
- [ ] **Step 2: Run** `cd apps/api && npx vitest run tests/integration/submissions.test.ts`. Expected: FAIL (404 for the route).
- [ ] **Step 3: Implement** the DTO, schema, `toSubmission`, `createSubmission` (Prisma `title.create`, selecting the summary fields plus `description` and `rejectionReason`), the router and the mount. `toSubmission` maps `posterUrl` to `undefined` when null, like `toSummary` in `titles.service.ts`.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`, `npx eslint src tests` in `apps/api`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(api): creators can submit a title for approval`.

---

### Task 2: Edit a submission

**Files:**
- Modify: `submissions.schema.ts`, `submissions.service.ts`, `submissions.routes.ts`
- Test: `apps/api/tests/integration/submissions.test.ts`

**Interfaces:**
- Consumes: `toSubmission`, `SubmissionRow` from Task 1.
- Produces: `updateSubmissionSchema` (strict `{ name?: string, description?: string }`, at least one key), type `UpdateSubmissionInput`; `updateSubmission(user: AuthUser, id: string, input: UpdateSubmissionInput): Promise<SubmissionDTO>`; route `PATCH /:id` (authenticate, `authorize(Role.CREATOR)`).

- [ ] **Step 1: Write failing tests**:
  - `refuses a consumer and an admin` (403), `404 for a missing title`.
  - `refuses a creator who is not the owner`: `findUnique` returns `createdById: 'someone-else'` → 403, `title.update` not called.
  - `an imported title (no owner) cannot be edited`: `createdById: null` → 403.
  - `editing an APPROVED title sends it back to PENDING`: `update` called with `status: 'PENDING'` and `rejectionReason: null` plus the new `name`; response `status: 'PENDING'`.
  - `editing a REJECTED title resubmits it and clears the reason`: same assertions.
  - `editing a PENDING title keeps it PENDING and changes only what was sent`.
  - `refuses mediaType, status and empty bodies with 400`, `it.each`: `{ mediaType: 'BOOK' }`, `{ status: 'APPROVED' }`, `{}`, `{ name: '   ' }`.
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement** `updateSubmission`: load the title's `createdById` and `status`; 404 / 403 as above; always set `status: 'PENDING'` and `rejectionReason: null` on a write.
- [ ] **Step 4: Run** the three API check commands. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): creators can edit their own submission`.

---

### Task 3: Delete a title

**Files:**
- Modify: `submissions.service.ts`, `submissions.routes.ts`
- Test: `apps/api/tests/integration/submissions.test.ts` (stub `ReviewBody`, `Reply`, `TitlePoster` as `reviews.test.ts` does)

**Interfaces:**
- Produces: `deleteTitle(user: AuthUser, id: string): Promise<void>`; route `DELETE /:id` (authenticate, no `authorize`: the service allows the owning creator and any admin) → 204.

- [ ] **Step 1: Write failing tests**:
  - `refuses a consumer` (403), `404 for a missing title`, `refuses a creator who does not own it`, `refuses an imported title to a creator`.
  - `lets the owner delete`: PostgreSQL delete called once, response 204.
  - `lets an admin delete any title`.
  - `removes the MongoDB leftovers after the PostgreSQL delete`: the review ids are read first (`review.findMany` selecting `id` for the title); then, in this order, `title.delete`, then `ReviewBody.deleteMany({ titleId })`, `Reply.deleteMany({ reviewId: { $in: ids } })`, `TitlePoster.deleteOne({ _id: id })`; assert the order with a shared `calls` array.
  - `a MongoDB failure does not fail the delete`: `ReviewBody.deleteMany` rejects → still 204, error logged.
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement** `deleteTitle` (PostgreSQL cascades the review and list rows; the MongoDB steps are each wrapped so one failure does not stop the others).
- [ ] **Step 4: Run** the three API check commands. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): delete a title and clear its MongoDB leftovers`.

---

### Task 4: A creator's own submissions

**Files:**
- Modify: `submissions.service.ts`, `apps/api/src/modules/creator/creator.routes.ts`
- Test: `apps/api/tests/integration/submissions.test.ts`

**Interfaces:**
- Produces: `listOwnSubmissions(user: AuthUser): Promise<SubmissionDTO[]>` (all statuses, newest first, ties on `id`); route `GET /api/creator/titles` (the router already requires `CREATOR`).

- [ ] **Step 1: Write failing tests**: `needs a creator` (401 anonymous, 403 admin and consumer); `lists only the signed-in creator's titles, newest first` (assert `findMany` is called with `where: { createdById: 'c1' }` and `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, and a `?createdById=other` query is ignored); `returns status and rejection reason for every status`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** the three API checks.
- [ ] **Step 5: Commit** `feat(api): list a creator's own submissions`.

---

### Task 5: Admin approval queue

**Files:**
- Create: `apps/api/src/modules/admin/adminTitles.schema.ts`, `adminTitles.service.ts`, `adminTitles.routes.ts`
- Modify: `apps/api/src/routes.ts` (mount `adminTitlesRouter` at `/admin/titles`)
- Test: `apps/api/tests/integration/adminTitles.test.ts`

**Interfaces:**
- Consumes: `toSubmission` from Task 1.
- Produces: `listTitlesForReview(query: { status?: TitleStatus; page: number; pageSize: number }): Promise<Paginated<SubmissionDTO>>` (defaults `status` PENDING, `page` 1, `pageSize` 20, max 50, oldest first so the queue is first-come); `setTitleStatus(id: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string): Promise<SubmissionDTO>`. Routes: `GET /` and `PATCH /:id/status` with body strict `{ status: 'APPROVED' | 'REJECTED', rejectionReason?: string }`, both `authenticate, authorize(Role.ADMIN)`.

- [ ] **Step 1: Write failing tests**: anonymous 401, consumer and creator 403 on both routes; `GET` defaults to PENDING and is paginated oldest first; `GET ?status=REJECTED` filters; `GET ?status=bogus` and `?pageSize=500` give 400; `PATCH` to APPROVED sets `rejectionReason: null` even if one is sent; `PATCH` to REJECTED stores the trimmed reason; `PATCH` with `status: 'PENDING'` or an unknown status gives 400 and writes nothing; `PATCH` of a missing title gives 404; a reason of 501 characters gives 400.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** the three API checks.
- [ ] **Step 5: Commit** `feat(api): admins approve or reject submitted titles`.

---

### Task 6: Web: creator submissions through the real API

**Files:**
- Modify: `apps/web/src/api/creator.ts` (`submissions`, `submit`, `update`)
- Modify: `apps/web/src/api/real.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `summaryToTitle(s: TitleSummary): TitleDetail` from `./mappers.js`, `SubmissionDTO`.
- Produces (signatures unchanged): `submissions(): Promise<Submission[]>`, `submit(input: SubmissionInput): Promise<Submission>`, `update(id: string, input: Partial<SubmissionInput>): Promise<Submission>`. A `Submission` is `{ title: TitleDetail, rejectionReason?: string }`; map `description` to `title.synopsis` (empty string when null) and `rejectionReason` null to `undefined`.
- Endpoints: `GET /creator/titles`; `POST /titles` body `{ name, mediaType, description }`; `PATCH /titles/:id` body of only the defined `name` and `synopsis` (as `description`), never `mediaType`; image: `PUT /titles/:id/poster` with the `Blob` as the raw body and `Content-Type` set to `blob.type` (response `{ posterUrl }`), and `DELETE /titles/:id/poster` for `removePoster`.

- [ ] **Step 1: Write failing tests** (fetch stubbed, mocks off): `submissions maps rows and the rejection reason`; `submit posts the title, then puts the image as the raw file` (two calls in order, second has `method: 'PUT'`, a `Blob` body and the blob's content type); `submit without an image makes one call`; `submit tells the user the title exists when only the image fails` (the `PUT` returns 415 `{ error: 'Use a JPEG, PNG or WebP image' }` → rejects with a message that contains both "saved" and the image error); `update sends only what changed and never mediaType`; `update with removePoster sends DELETE`; `a 403 shows the server message`.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/api/real.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three real branches. Remove the now-obsolete test that asserted `creatorApi.submissions()` stays unwired.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`, `npx eslint src` in `apps/web`. Expected: pass.
- [ ] **Step 5: Commit** `feat(web): creator submissions through the real API`.

---

### Task 7: Web: admin queue, edit form, docs

**Files:**
- Modify: `apps/web/src/api/admin.ts` (`pendingTitles`, `setTitleStatus`), `apps/web/src/pages/creator/SubmissionForm.tsx`, `apps/web/src/api/real.test.ts`, `TASKS.md`, `docs/api.md`

**Interfaces:**
- Produces (signatures unchanged): `pendingTitles(): Promise<TitleDetail[]>` via `GET /admin/titles?status=PENDING&pageSize=50`, mapping each row with `summaryToTitle` and `synopsis = description ?? ''`; `setTitleStatus(id: string, status: TitleStatus, reason?: string): Promise<void>` via `PATCH /admin/titles/:id/status` body `{ status, rejectionReason: reason }` (omit the key when `reason` is undefined).

- [ ] **Step 1: Write failing tests**: `pendingTitles asks for PENDING and maps rows`; `setTitleStatus patches status and reason`; `setTitleStatus omits the reason key when none is given`; a component test in `SubmissionForm`'s existing test file that **the media type select is disabled while editing** and enabled on a new submission.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the two admin methods, and disable the media type control in the edit form with a short hint ("The type cannot change after a title is created").
- [ ] **Step 4: Update docs**: `TASKS.md` §2 (creator title endpoints), §4 (approval queue), §8 (creator upload flow) with what is now done and what is not (image of a pending title, delete button, the other admin endpoints); `docs/api.md` with the new endpoints.
- [ ] **Step 5: Run the whole suite** from the repo root: `npm run typecheck && npm run lint && npm test`. Expected: pass. Then verify live against the running API: as `creator@bingemate.dev` POST a title, PATCH it, `GET /api/creator/titles`; as `admin@bingemate.dev` list the queue and approve; `GET /api/titles/:id` as anonymous goes from 404 to 200; delete it and check no leftovers.
- [ ] **Step 6: Commit** `feat(web): admin approval queue and creator edit rules, docs`.

---

## Self-review

- **Spec coverage:** create, edit, delete, own list, queue and approve each have an API task and a web path; the TASKS §12 delete leftovers are Task 3.
- **Type consistency:** `SubmissionDTO` and `toSubmission` are defined in Task 1 and reused unchanged in Tasks 2 to 6; `summaryToTitle` already exists in `mappers.ts`.
- **Review Focus:** each of the five lines has its test in the task named.
