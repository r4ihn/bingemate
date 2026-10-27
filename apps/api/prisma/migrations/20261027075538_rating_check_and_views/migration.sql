-- Rating is whole stars 1..5 (decided 2026-10-18). Prisma cannot express a CHECK constraint.
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Per-title rating aggregates, computed from reviews. Source of truth for Title.avgRating and
-- Title.reviewCount (the stored columns are denormalised for fast browse/sort).
CREATE VIEW "title_rating_stats" AS
SELECT t."id" AS "title_id",
       COUNT(r."id")::int                   AS "review_count",
       COALESCE(ROUND(AVG(r."rating"), 2), 0)::float8 AS "avg_rating"
FROM "Title" t
LEFT JOIN "Review" r ON r."titleId" = t."id"
GROUP BY t."id";

-- Genre filter options: genres on enough approved titles, per media type. The threshold lives
-- here (not in the ETL) so the data keeps every genre.
CREATE VIEW "genre_filter_options" AS
SELECT t."mediaType", g."id" AS "genre_id", g."name", COUNT(*)::int AS "title_count"
FROM "Genre" g
JOIN "TitleGenre" tg ON tg."genreId" = g."id"
JOIN "Title" t ON t."id" = tg."titleId" AND t."status" = 'APPROVED'
GROUP BY t."mediaType", g."id", g."name"
HAVING COUNT(*) >= 5;

-- Trending: weighted rating so one 5-star review does not beat 200 4-star ones.
--   score = v/(v+m) * R + m/(v+m) * C    v = reviews, R = title average, C = global average, m = 10
CREATE VIEW "trending_titles" AS
WITH "global" AS (SELECT AVG("rating") AS "c" FROM "Review")
SELECT t."id", t."name", t."mediaType", s."review_count", s."avg_rating",
       ((s."review_count"::float8 / (s."review_count" + 10)) * s."avg_rating"
        + (10.0 / (s."review_count" + 10)) * (SELECT "c" FROM "global"))::float8 AS "trending_score"
FROM "Title" t
JOIN "title_rating_stats" s ON s."title_id" = t."id"
WHERE t."status" = 'APPROVED' AND s."review_count" > 0;  -- unreviewed titles would score the global average

-- Creator stats (TASKS.md section 6, GET /creator/stats): one row per title a creator owns.
CREATE VIEW "creator_title_stats" AS
SELECT t."createdById" AS "creator_id", t."id" AS "title_id", t."name", t."status",
       s."review_count", s."avg_rating",
       (SELECT COUNT(*)::int FROM "ListEntry" l WHERE l."titleId" = t."id") AS "list_adds"
FROM "Title" t
JOIN "title_rating_stats" s ON s."title_id" = t."id"
WHERE t."createdById" IS NOT NULL;
