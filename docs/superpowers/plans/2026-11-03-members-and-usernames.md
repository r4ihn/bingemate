# Members and usernames Implementation Plan

> **For agentic workers:** work through the tasks in order. Each task ends with its own checks. The decisions below were agreed with the project owner (WH) on 3 Nov 2026 and are not open for redesign.

**Goal:** Merge the CREATOR and CONSUMER roles into one role, MEMBER, and collect a username at signup.

**Architecture:** One database migration (role enum, username de-duplication, a unique index on `lower(username)`), one shared username validator used by both the API and the web form, and a role rename through API, web, ETL, seed, tests and docs.

**Spec:** the INF2003 project description is silent on roles and usernames ("you are free to design your application"), so these are product decisions.

## Decisions (agreed)

- Roles are `ADMIN` and `MEMBER`. Every member can do what a creator could: submit titles (saved `PENDING`), edit and delete their own, upload images, see their own pending or rejected titles, use the Creator page and stats. Admins are not members and still cannot submit titles or write reviews or replies.
- Unchanged: a member cannot review a title they created (403 `You cannot review a title you created`); a member can reply under reviews of their own titles; the reply badge for the title owner stays; one review per member per title; delete of an own title is refused (409) while another user has reviewed or listed it; an edit or image change on an `APPROVED` title sends it back to `PENDING`.
- **Usernames:** required at signup. NFKC-normalised, trimmed and runs of whitespace collapsed to one space. 3 to 30 characters after normalising; may contain Unicode letters and digits, single spaces, `_`, `-` and `.`; must start and end with a letter or digit. Letters must belong to Latin, Cyrillic, Greek, Han, Hiragana, Katakana, Hangul, Arabic, Hebrew, Devanagari or Thai. Other alphabets return `Username contains letters from an unsupported alphabet`. A name may use one alphabet, any subset of {Han, Hiragana, Katakana} with or without Latin, or any subset of {Han, Hangul} with or without Latin. Thus Latin may accompany any of Han, Hiragana, Katakana or Hangul, but Hangul cannot mix with Hiragana or Katakana. All other combinations return `Username cannot mix letters from different alphabets`. Digits, spaces and `_ - .` do not count toward the alphabet set. After normalisation, invisible characters (`Default_Ignorable_Code_Point`, including Hangul fillers, soft hyphen and zero-width characters) are refused with `Username cannot contain invisible characters`. Validation order is length, allowed characters, invisible characters, start/end, alphabets, then reserved names. The reserved words `admin`, `administrator`, `moderator`, `bingemate`, `support` and `system` are refused with `This username is reserved` using a skeleton only for this check. The skeleton lower-cases the normalised name, applies NFKD, removes every Unicode mark (accents), removes spaces, underscores, hyphens and periods, then maps the supported Cyrillic, Greek and leetspeak lookalikes plus Latin small capitals and dotless forms to ASCII. Any remaining non-ASCII Latin-script letter becomes the wildcard `?`; other scripts never become wildcards. A reserved word matches only when the whole skeleton has the same length and every position is equal or a wildcard, with no substring or token matching. Thus `ádmin`, `admiń`, `ᴀᴅᴍɪɴ`, `admın`, `ꜱyꜱtem`, `ѕуѕтем` and `Supp0rt` are reserved, while `Padmini`, `Madmin`, `BingeMate Fan`, `Søren`, `Zoë`, `Łukasz`, `Müller`, `管理員` and `系统管理员账号` remain valid. This conservative wildcard rule can refuse a rare genuine name such as `Suppørt`, a deliberate false positive trade-off. This is a practical subset of Unicode confusable detection: there is no full TR39 table and no check across non-Latin scripts beyond the mapped Cyrillic and Greek letters. Uniqueness is exact ignoring case, so a lookalike of another member's name is not detected. Unique ignoring case, enforced by a database unique index on `lower("username")` (Prisma ignores expression indexes: verified `migrate diff` reports no drift). The column stays nullable for legacy rows; `toAuthor` keeps its `user-xxxxxx` fallback.
- **Existing data:** the migration turns every CONSUMER and CREATOR into MEMBER and de-duplicates usernames that collide ignoring case by adding " (2)", " (3)", ... to the later rows (ordered by `createdAt`, then `id`), looping until no collision remains (a suffixed name may collide with an existing one). The ETL does the same for future reloads.
- **Login tokens** carry the role. `verifyToken` maps the legacy values `CREATOR` and `CONSUMER` to `MEMBER` so sessions issued before the migration keep working until they expire (2 hours). Tokens now also carry `username`.
- **Pending cap:** a member may have at most 10 `PENDING` titles at once. Creating an eleventh answers 409 `You already have 10 titles waiting for approval. Wait for an admin to decide on some of them.` The check and the insert run in one transaction under `pg_advisory_xact_lock(hashtext(userId))` so concurrent submissions cannot exceed the cap. Edits do not count against the cap.
- **Errors:** registering with a taken email answers 409 `Email already in use`; with a taken username 409 `Username already taken`; an invalid username 400 with a clear message from the shared validator.
- Demo accounts keep their emails (`admin@`, `creator@`, `consumer@bingemate.dev`); both non-admin ones are members. The seed gives them usernames.
- The page and link are still called "Creator".

## Tasks

### Task A: shared, database, API, ETL, seed, API tests (Codex)

- `packages/shared`: `Role = { ADMIN, MEMBER }`; `AuthUser` gains `username: string | null`; `RegisterRequest` gains `username: string`; NEW `src/username.ts` exporting `USERNAME_MIN`, `USERNAME_MAX`, `RESERVED_USERNAMES`, `normalizeUsername(raw: string): string` and `usernameError(raw: string): string | null` (the single source of the rules above, with a test); export from the package index; `MAX_PENDING_SUBMISSIONS = 10` exported from the shared package too.
- `apps/api/prisma/schema.prisma`: `enum Role { ADMIN MEMBER }`, default `MEMBER`. NEW migration `20261103140000_members_and_usernames` (hand-written): de-duplicate usernames, replace the enum (`CREATE TYPE "Role_new"`, convert the column with a CASE, restore the default, drop the old type, rename), then `CREATE UNIQUE INDEX "User_username_lower_key" ON "User" (lower("username"))`.
- API: `authorize(Role.CREATOR)` becomes `authorize(Role.MEMBER)` in `creator.routes.ts` and `submissions.routes.ts`; owner checks in `posters.service.ts` and `submissions.service.ts`; `removedUser` role; `jwt.ts` (payload username, legacy role mapping); `auth.schemas.ts` (username via the shared validator, normalised); `auth.service.ts` register stores the username and maps the unique-violation to the right 409; login and `me` return the username; `createSubmission` enforces the pending cap as above.
- ETL (`clean-users.ts`, `load-postgres.ts`, `verify.ts`, `data/etl/README.md`): roles 1 and 2 map to MEMBER, 3 to ADMIN; case-insensitive username de-duplication; verify checks exactly one ADMIN and no username collision ignoring case.
- `prisma/seed.ts`: member accounts with usernames.
- Tests: update every test that names the old roles; add the new rules (register validation, normalisation, reserved names, 409s, legacy token mapping, MEMBER on creator routes, admin still refused, pending cap, usernames in responses). Real-database tests (`tests/real`): the role enum has exactly ADMIN and MEMBER, the unique index exists, two concurrent registrations of the same username (different case) give one 201 and one 409, twelve concurrent submissions by one member give exactly ten 201 and two 409.

### Task B: web (Codex)

- Role rename (`App.tsx` route guard, `MainLayout.tsx` nav, `UsersTable.tsx` label "Member", mocks, `AuthContext` comment and `VITE_MOCK_ROLE` values).
- Register form gets a **Username** field (label "Username", hint with the rules, errors from the shared validator, the API's 409 shown under the field); `authApi.register` sends it; the login form is unchanged. Tests for both.

### Task C: docs, browser script, diagrams (Codex for scripts and docs, Claude for Eraser)

- Manual, README, `docs/api.md`, demo script, report outline, `TASKS.md`, `ARCHITECTURE.md`; the browser script gains a signup step (register a new member with a username, then submit a title as that member) and cleans up the account.
- Eraser relational diagram: `Role: ADMIN | MEMBER`, unique username.

### Verification

Typecheck, lint, all three suites, a migration run against a copy of the dev data (counts before and after), a Prisma drift check, the browser script, and mutation checks of the new rules.
