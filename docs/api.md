# API endpoints

Endpoint list + required role. Fill in as modules land (TASKS.md sections 3–7).

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /api/auth/register | public | default role CONSUMER |
| POST | /api/auth/login | public | sets httpOnly cookie |
| GET | /api/auth/me | authenticated | restore session |
| POST | /api/auth/logout | public | clears cookie, even an expired one; 204 |
