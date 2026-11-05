# Eraser diagrams (team: "DBMS ahhh")

Redrawn on 2026-11-03 to match the code on branch `feat/remaining-work` (schema through migration `browse_sort_indexes`, the current Mongoose models, and the current architecture). All three are in the Eraser workspace.

| Diagram                    | Link                                                 | Matches                                                    |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Relational ER (PostgreSQL) | https://app.eraser.io/workspace/LeaMJfsgZr7dnLYMphSI | `apps/api/prisma/schema.prisma` and the view migrations    |
| MongoDB schema             | https://app.eraser.io/workspace/QyVdod2sqVQ3fkLGsPDU | `apps/api/src/mongo/models/`                               |
| System architecture        | https://app.eraser.io/workspace/GLnWxRF8IU538LpEXJep | `ARCHITECTURE.md` (exported copy: `docs/architecture.svg`) |

Diagram ids (for the Eraser tools): relational `iD6FqGiEYSQPBpwsR-15`, MongoDB `hgzGFlMuxezB-AnS_Q6_`, architecture `p7i2TBkNgnS12GNdIhC3` (file `GLnWxRF8IU538LpEXJep`).

What the 2026-11-03 redraw covers

- Relational: the four SQL views and the materialized view `title_rank_in_type` (with `RANK()` and `PERCENT_RANK()`), the two `Title` browse indexes noted on `avgRating` and `reviewCount`, and `updatedAt` as the moderation version.
- MongoDB: `ReviewBody` is text plus a `mediaType` copy (the imported `details` object is gone), its compound indexes (`titleId, createdAt`; `titleId, userId`; `mediaType, titleId, userId`), and `TrendingCard.recentReviews`. The index block is a note, not a collection.
- Architecture: per-route middleware instead of a global pipeline, the cross-store review write, the trending refresh with a single configurable timer, the materialized rank view, and the tooling outside the runtime tiers.

Notes

- The relational and MongoDB files are "anyone with the link can edit". Treat the links as team-only. The architecture file has no link access.
- Not drawn: the `Title` year-sort index, which is not shipped (Prisma 5.20 cannot declare `NULLS LAST`).
- Eraser's AI edit ran out of free credits on 2026-10-27, so edits are made by writing the diagram code directly. Anyone editing by hand should re-read the code first: it is the source of truth, and the diagrams are a copy.
