-- Keep Title."avgRating" / "reviewCount" in sync with the Review table inside the database.
--
-- Before this migration the API recomputed them after each review write, so any other way of
-- changing reviews left them stale: the cascade when a User or Title is deleted, a bulk load, or a
-- manual SQL fix. Triggers cover every path.
--
-- The triggers are statement-level with transition tables: a statement that touches N reviews runs
-- one recompute per affected title, not N recomputes (the ETL inserts 13k reviews in a few
-- statements). PostgreSQL allows transition tables only on single-event triggers, hence three.
--
-- The values come from the title_rating_stats view, so the rounding is the view's exact numeric
-- ROUND (rounding a float in application code gets .xx5 ties wrong). updatedAt is not touched: a
-- new review is not an edit of the title.

CREATE FUNCTION refresh_title_ratings(title_ids text[]) RETURNS void
LANGUAGE sql AS $$
  UPDATE "Title" AS t
  SET "avgRating" = s."avg_rating", "reviewCount" = s."review_count"
  FROM "title_rating_stats" AS s
  WHERE s."title_id" = t."id"
    AND t."id" = ANY (title_ids)
    -- Repeated on the view's column so the filter is pushed into its GROUP BY: only these
    -- titles' reviews are aggregated, not the whole table.
    AND s."title_id" = ANY (title_ids)
    -- Skip rows that are already right, so a no-op does not write a new row version.
    AND (t."avgRating", t."reviewCount") IS DISTINCT FROM (s."avg_rating", s."review_count");
$$;

CREATE FUNCTION review_rating_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_title_ratings(ARRAY(SELECT DISTINCT "titleId" FROM new_rows));
  RETURN NULL;
END;
$$;

CREATE FUNCTION review_rating_after_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_title_ratings(ARRAY(SELECT DISTINCT "titleId" FROM old_rows));
  RETURN NULL;
END;
$$;

-- Old and new title ids both: a review moved to another title changes the totals of both.
CREATE FUNCTION review_rating_after_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_title_ratings(ARRAY(
    SELECT "titleId" FROM old_rows
    UNION
    SELECT "titleId" FROM new_rows
  ));
  RETURN NULL;
END;
$$;

CREATE TRIGGER review_rating_insert
  AFTER INSERT ON "Review"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION review_rating_after_insert();

CREATE TRIGGER review_rating_delete
  AFTER DELETE ON "Review"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION review_rating_after_delete();

CREATE TRIGGER review_rating_update
  AFTER UPDATE ON "Review"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION review_rating_after_update();

-- Bring every existing title in line once, so the triggers start from correct values.
SELECT refresh_title_ratings(ARRAY(SELECT "id" FROM "Title"));
