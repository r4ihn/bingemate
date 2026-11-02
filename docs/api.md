# API endpoints

Endpoint list + required role. Fill in as modules land (TASKS.md sections 3–7).

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
| PATCH | /api/admin/titles/:id/status | ADMIN | `{ status: APPROVED \| REJECTED, rejectionReason? }`; the reason is kept only for `REJECTED` |
