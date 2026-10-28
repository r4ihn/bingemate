# Eraser diagrams (team: "DBMS ahhh")

Updated 2026-10-27 to match `schema.prisma` on branch `feat/db-load`. All three are in the Eraser workspace.

| Diagram                    | Link                                                 | Matches                                                    |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Relational ER (PostgreSQL) | https://app.eraser.io/workspace/LeaMJfsgZr7dnLYMphSI | `apps/api/prisma/schema.prisma`                            |
| MongoDB schema             | https://app.eraser.io/workspace/QyVdod2sqVQ3fkLGsPDU | `apps/api/src/mongo/models/`                               |
| System architecture        | https://app.eraser.io/workspace/GLnWxRF8IU538LpEXJep | `ARCHITECTURE.md` (exported copy: `docs/architecture.svg`) |

Diagram ids (for the Eraser tools): relational `iD6FqGiEYSQPBpwsR-15`, MongoDB `hgzGFlMuxezB-AnS_Q6_`.

Notes

- The relational and MongoDB files are "anyone with the link can edit". Treat the links as team-only.
- Not drawn yet: the four SQL views (`title_rating_stats`, `genre_filter_options`, `trending_titles`, `creator_title_stats`).
- The MongoDB diagram still lists `runtimeMinutes`, `chaptersRead`, `season`, `episodes`; they exist in the model but the dataset fills `details` instead.
- Eraser's AI edit ran out of free credits on 2026-10-27; edits were made by writing the DSL directly.
