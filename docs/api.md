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

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /api/auth/register | public | default role CONSUMER |
| POST | /api/auth/login | public | sets httpOnly cookie |
| GET | /api/auth/me | authenticated | restore session |
| POST | /api/auth/logout | public | clears cookie, even an expired one; 204 |
| POST | /api/titles | CREATOR | submit a title: `{ name, mediaType, description? }`; saved `PENDING`; 201 |
| PATCH | /api/titles/:id | CREATOR (owner) | `{ name?, description? }`; an approved or rejected title goes back to `PENDING`; `mediaType` is refused |
| DELETE | /api/titles/:id | CREATOR (owner) or ADMIN | a creator only while no other user has reviewed or listed it (else 409); also removes review bodies, replies and the image from MongoDB; 204 |
| GET | /api/creator/titles | CREATOR | the creator's own titles, every status, with `rejectionReason` |
| GET | /api/admin/titles | ADMIN | `?status=PENDING` (default), paginated, oldest first |
| PATCH | /api/admin/titles/:id/status | ADMIN | `{ status: APPROVED \| REJECTED, rejectionReason?, updatedAt }`; `updatedAt` is the title's version (ISO datetime) taken from the list response; the optional reason is trimmed, at most 500 characters, and kept only for `REJECTED`; a stale `updatedAt` returns 409: "This title changed after you opened it. Reload the queue and review it again." |
