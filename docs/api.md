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

## Routes

| Method | Path                         | Role                                                     | Notes                                                                                                                                                                                                                                                                                                                                       |
| ------ | ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | /api/auth/register           | public                                                   | default role CONSUMER                                                                                                                                                                                                                                                                                                                       |
| POST   | /api/auth/login              | public                                                   | sets httpOnly cookie                                                                                                                                                                                                                                                                                                                        |
| GET    | /api/auth/me                 | authenticated                                            | restore session                                                                                                                                                                                                                                                                                                                             |
| POST   | /api/auth/logout             | public                                                   | clears cookie, even an expired one; 204                                                                                                                                                                                                                                                                                                     |
| GET    | /api/titles/:id | public | Approved title detail, including `rankInType` and `topPercent` (both `number \| null`). Both are null when the title is not ranked or the rank lookup fails. Ranks refresh with the trending job. Hidden or missing titles return 404. |
| POST   | /api/titles                  | CREATOR                                                  | submit a title: `{ name, mediaType, description? }`; saved `PENDING`; 201                                                                                                                                                                                                                                                                   |
| PATCH  | /api/titles/:id              | CREATOR (owner)                                          | `{ name?, description? }`; an approved or rejected title goes back to `PENDING`; `mediaType` is refused                                                                                                                                                                                                                                     |
| DELETE | /api/titles/:id              | CREATOR (owner) or ADMIN                                 | a creator only while no other user has reviewed or listed it (else 409); also removes review bodies, replies and the image from MongoDB; 204                                                                                                                                                                                                |
| GET    | /api/creator/titles          | CREATOR                                                  | the creator's own titles, every status, with `rejectionReason`                                                                                                                                                                                                                                                                              |
| GET    | /api/admin/titles            | ADMIN                                                    | `?status=PENDING` (default), paginated, oldest first                                                                                                                                                                                                                                                                                        |
| PATCH  | /api/admin/titles/:id/status | ADMIN                                                    | `{ status: APPROVED \| REJECTED, rejectionReason?, updatedAt }`; `updatedAt` is the title's version (ISO datetime) from the list response; the optional reason is trimmed, at most 500 characters, and kept only for `REJECTED`; a stale `updatedAt` returns 409: "This title changed after you opened it. Reload the queue and review it again."                                                                                                                                                                                                                                                |
| GET    | /api/titles/:titleId/poster  | public for APPROVED; owner or ADMIN for PENDING/REJECTED | Image bytes. Anyone else, and missing titles or images, get the same 404. A bad or expired cookie is ignored. Non-approved images use `Cache-Control: private, no-store`; approved images use `public, max-age=31536000, immutable` only for the current `?v=` (otherwise `no-cache`). Sent with `X-Content-Type-Options: nosniff`. |
| PUT    | /api/titles/:titleId/poster  | CREATOR (owner) or ADMIN | Raw JPEG, PNG or WebP, max 1 MB; returns `{ posterUrl }` using the version Mongo kept. When a creator uploads, an APPROVED title is set back to `PENDING` **before** the stored bytes are overwritten, so the old public URL never serves an unreviewed image; an admin upload leaves the status alone. |
| DELETE | /api/titles/:titleId/poster  | CREATOR (owner) or ADMIN | 204. Clears the link first, then removes the bytes; a failure removing the bytes is logged and still answers 204. Removing an image does not change the status. |

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
