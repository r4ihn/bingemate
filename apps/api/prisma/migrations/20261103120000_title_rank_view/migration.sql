-- Materialized so each title page avoids re-aggregating every review and re-ranking every title.
-- Created with data (the default); concurrent refreshes also need the unique index below.
CREATE MATERIALIZED VIEW "title_rank_in_type" AS
SELECT id AS title_id, "mediaType", trending_score,
       RANK() OVER w AS rank_in_type,
       PERCENT_RANK() OVER w AS pct_rank
FROM trending_titles
WINDOW w AS (PARTITION BY "mediaType" ORDER BY trending_score DESC, id);

-- REFRESH MATERIALIZED VIEW CONCURRENTLY needs a unique index covering every row.
CREATE UNIQUE INDEX "title_rank_in_type_title_id_key" ON "title_rank_in_type"(title_id);
