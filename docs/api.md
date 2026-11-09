# API endpoints

Endpoint list + required role. Fill in as modules land (TASKS.md sections 3–7).

## Errors

Errors return JSON with an `error` field. JSON request bodies use Express's default 100 KB limit:

- Malformed JSON (`entity.parse.failed`): 400 `{ "error": "Invalid JSON" }`.
- Oversized JSON (`entity.too.large`): 413 `{ "error": "Request body too large" }`.
- Unsupported encoding/charset or an aborted request (`encoding.unsupported`, `charset.unsupported`, `request.aborted`): 400 `{ "error": "Could not read the request" }`.
- Unknown routes: 404 `{ "error": "Not found" }`.
- Unexpected errors: 500 `{ "error": "InternalServerError" }`; details are logged server-side and never included in the response.

Validation errors return 400 with `error: "ValidationError"` and field `details`. Explicit application errors retain their endpoint-specific status and message. The poster upload's raw-body parser retains its own 413 `"The image must be 1 MB or smaller"` and 400 `"Could not read the image"` responses.

## Username rules

Usernames are NFKC-normalised, trimmed and have whitespace runs collapsed to one space. They must contain 3–30 Unicode characters, use only letters, digits, spaces, `_`, `-` and `.`, and start and end with a letter or digit. Letters must belong to Latin, Cyrillic, Greek, Han, Hiragana, Katakana, Hangul, Arabic, Hebrew, Devanagari or Thai. Other alphabets return `Username contains letters from an unsupported alphabet`. A name may use one alphabet, any subset of {Han, Hiragana, Katakana} with or without Latin, or any subset of {Han, Hangul} with or without Latin. Thus Latin may accompany any of Han, Hiragana, Katakana or Hangul, but Hangul cannot mix with Hiragana or Katakana. All other combinations return `Username cannot mix letters from different alphabets`. Digits, spaces and `_ - .` do not count toward the alphabet set. After normalisation, invisible characters (`Default_Ignorable_Code_Point`, including Hangul fillers, soft hyphen and zero-width characters) are refused with `Username cannot contain invisible characters`. Validation order is length, allowed characters, invisible characters, start/end, alphabets, then reserved names.

The reserved words `admin`, `administrator`, `moderator`, `bingemate`, `support` and `system` are refused with `This username is reserved` using a skeleton only for this check. The skeleton lower-cases the normalised name, applies NFKD, removes every Unicode mark (accents), removes spaces, underscores, hyphens and periods, then maps the supported Cyrillic, Greek and leetspeak lookalikes plus Latin small capitals and dotless forms to ASCII. Any remaining non-ASCII Latin-script letter becomes the wildcard `?`; other scripts never become wildcards. A reserved word matches only when the whole skeleton has the same length and every position is equal or a wildcard, with no substring or token matching. Thus `ádmin`, `admiń`, `ᴀᴅᴍɪɴ`, `admın`, `ꜱyꜱtem`, `ѕуѕтем` and `Supp0rt` are reserved, while `Padmini`, `Madmin`, `BingeMate Fan`, `Søren`, `Zoë`, `Łukasz`, `Müller`, `管理員` and `系统管理员账号` remain valid. This conservative wildcard rule can refuse a rare genuine name such as `Suppørt`, a deliberate false positive trade-off. This is a practical subset of Unicode confusable detection: there is no full TR39 table and no check across non-Latin scripts beyond the mapped Cyrillic and Greek letters. Uniqueness is exact ignoring case, so a lookalike of another member's name is not detected.

## Routes

| Method | Path                         | Role                                                     | Notes                                                                                                                                                                                                                                                                                                                                             |
| ------ | ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | /api/auth/register           | public                                                   | `{ email, password, username }`; default role MEMBER; 201 `{ id, email, role, username }` and httpOnly cookie; 409 `Email already in use` or `Username already taken`; invalid username 400 with field details                                                                                                                                    |
| POST   | /api/auth/login              | public                                                   | `{ email, password }`; returns `{ id, email, role, username }` and sets httpOnly cookie                                                                                                                                                                                                                                                           |
| GET    | /api/auth/me                 | authenticated                                            | restore session; returns `{ id, email, role, username }` (username may be null for legacy users)                                                                                                                                                                                                                                                  |
| POST   | /api/auth/logout             | public                                                   | clears cookie, even an expired one; 204                                                                                                                                                                                                                                                                                                           |
| GET    | /api/titles/:id              | public                                                   | Approved title detail, including `trailerKey` (a YouTube id, omitted when there is none, also on list summaries), `rankInType` and `topPercent` (both `number \| null`). Both are null when the title is not ranked or the rank lookup fails. Ranks refresh with the trending job. Hidden or missing titles return 404.                           |
| POST   | /api/titles                  | MEMBER                                                   | submit a title: `{ name, mediaType, description? }`; saved `PENDING`; 201; at most 10 pending per member; 409 `You already have 10 titles waiting for approval. Wait for an admin to decide on some of them.`                                                                                                                                     |
| PATCH  | /api/titles/:id              | MEMBER (owner)                                           | `{ name?, description? }`; an approved or rejected title goes back to `PENDING`; `mediaType` is refused                                                                                                                                                                                                                                           |
| DELETE | /api/titles/:id              | MEMBER (owner) or ADMIN                                  | a creator only while no other user has reviewed or listed it (else 409); also removes review bodies, replies and the image from MongoDB; 204                                                                                                                                                                                                      |
| GET    | /api/creator/titles          | MEMBER                                                   | the creator's own titles, every status, with `rejectionReason`                                                                                                                                                                                                                                                                                    |
| GET    | /api/creator/stats           | MEMBER                                                   | stats for the member's own titles, every status                                                                                                                                                                                                                                                                                                   |
| GET    | /api/admin/titles            | ADMIN                                                    | `?status=PENDING` (default), paginated, oldest first                                                                                                                                                                                                                                                                                              |
| PATCH  | /api/admin/titles/:id/status | ADMIN                                                    | `{ status: APPROVED \| REJECTED, rejectionReason?, updatedAt }`; `updatedAt` is the title's version (ISO datetime) from the list response; the optional reason is trimmed, at most 500 characters, and kept only for `REJECTED`; a stale `updatedAt` returns 409: "This title changed after you opened it. Reload the queue and review it again." |
| GET    | /api/titles/:titleId/poster  | public for APPROVED; owner or ADMIN for PENDING/REJECTED | Image bytes. Anyone else, and missing titles or images, get the same 404. A bad or expired cookie is ignored. Non-approved images use `Cache-Control: private, no-store`; approved images use `public, max-age=31536000, immutable` only for the current `?v=` (otherwise `no-cache`). Sent with `X-Content-Type-Options: nosniff`.               |
| PUT    | /api/titles/:titleId/poster  | MEMBER (owner) or ADMIN                                  | Raw JPEG, PNG or WebP, max 1 MB; returns `{ posterUrl }` using the version Mongo kept. When a creator uploads, an APPROVED title is set back to `PENDING` **before** the stored bytes are overwritten, so the old public URL never serves an unreviewed image; an admin upload leaves the status alone.                                           |
| DELETE | /api/titles/:titleId/poster  | MEMBER (owner) or ADMIN                                  | 204. Clears the link first, then removes the bytes; a failure removing the bytes is logged and still answers 204. Removing an image does not change the status.                                                                                                                                                                                   |

## People and degrees of separation (public)

Only approved titles count everywhere below: a person credited only on hidden titles has no credits, and two people are never linked through a hidden title.

- `GET /api/people?q=lee` returns up to 10 `{ id, name, titleCount }` whose name contains `q` (case-insensitive, 2 to 100 characters, LIKE wildcards are matched literally), most credited first. A shorter `q` returns 400.
- `GET /api/people/:id` returns `{ id, name, credits }`. Each credit is `{ id, name, mediaType, releaseYear, posterUrl?, roles }`, one per title with every role the person had on it, newest first. 404 `Person not found`.
- `GET /api/people/:id/connection/:otherId?maxDepth=6` returns the shortest chain of shared titles: `{ degrees, maxDepth, path }`. `path` starts with `:id` and ends with `:otherId`, and each step is `{ person: { id, name }, via }`, where `via` is the `{ id, name, mediaType }` shared with the previous person (null on the first step). A person is 0 degrees from themselves. When there is no chain within `maxDepth` (an integer from 1 to 6, default 6), the answer is 200 `{ degrees: null, maxDepth, path: null }`. 404 when either person does not exist; 400 for a bad `maxDepth`.

The chain comes from a breadth-first search written as one recursive SQL query (`connectionQuery` in `apps/api/src/modules/people/people.service.ts`). Ties go to the lowest ids, so a pair always gives the same chain. `benchmarks/people-connection.ts` runs it under `EXPLAIN ANALYZE`.

## Review statistics (public)

`GET /api/titles/:titleId/review-activity?months=120` returns review counts and average text length (Unicode code points, rounded to one decimal) per populated UTC month, ascending. `months` is an integer from 1 to 240, default 120. The cutoff is the first day of the UTC month `months` ago. Gaps are omitted. PostgreSQL must first confirm the title is APPROVED; missing or unapproved titles return 404 `{ "error": "Title not found" }`. An approved title without reviews returns 200 `{ "data": [] }`.

```json
{
  "data": [
    { "month": "2022-01", "reviews": 12, "avgBodyLength": 154.3 },
    { "month": "2022-03", "reviews": 4, "avgBodyLength": 82.5 }
  ]
}
```

`GET /api/reviews/top-reviewers?type=BOOK&limit=10` ranks writers by review count descending, breaking ties by userId ascending. Optional `type` accepts MOVIE, BOOK or TV_SHOW; `limit` is an integer from 1 to 50, default 10. Reviews of non-APPROVED titles are excluded. Reply totals count replies written by each candidate (`Reply.userId`) only when the joined `ReviewBody` exists and its title is not hidden, regardless of the review type filter. Replies under non-APPROVED titles or with missing review bodies are excluded. Names come from PostgreSQL via `loadAuthors`; missing users and ADMIN users are dropped. The pipeline fetches up to `limit * 2` candidates before filtering, so the response may contain fewer than `limit` writers.

```json
{
  "data": [
    { "userId": "u1", "name": "maya_r", "reviews": 23, "replies": 7 },
    { "userId": "u2", "name": "user-u2", "reviews": 18, "replies": 0 }
  ]
}
```

Empty query strings use defaults. Invalid months, limit, type or titleId return 400 `{ "error": "ValidationError", "details": { ... } }` through the shared validation middleware. Named exported pipeline builders (`reviewActivityPipeline`, `topReviewersPipeline`, `recentReviewCountsPipeline`) live in `apps/api/src/modules/reviewStats/reviewStats.service.ts`. `recentReviewCounts(days)` returns a Map of title IDs to counts over a rolling day window; the trending refresh calls it once per non-empty run with 1460 days.

## Trending (public)

`GET /api/trending?type=BOOK&limit=20&sort=recent` returns `{ data: TrendingCardDTO[] }` from precomputed MongoDB cards. Optional `type` accepts MOVIE, BOOK or TV_SHOW; `limit` remains an integer from 1 to 50, default 20. `sort` accepts `score` (default: score descending, titleId ascending) or `recent` (recentReviews descending, score descending, titleId ascending). Empty query strings use defaults; unknown sorts return 400 `ValidationError`.

Each card contains `titleId`, `name`, `mediaType`, optional `posterUrl`, `avgRating`, `reviewCount`, `recentReviews` and `score`. `recentReviews` is the numeric count within the rolling **1460-day** window computed at job time, defaulting to 0 for titles with no reviews in that window and older cards without the field. There is no `days` query parameter: reading precomputed cards cannot change their window. The candidate set remains the top 50 per media type from the SQL score view. Reads re-check APPROVED status after applying the limit, so fewer cards may be returned.

The refresh aggregates counts before any card writes. If aggregation fails, it rejects without upserts or stale-card deletion. Successful runs upsert cards with their counts before deleting stale cards; an empty SQL view keeps existing cards.
