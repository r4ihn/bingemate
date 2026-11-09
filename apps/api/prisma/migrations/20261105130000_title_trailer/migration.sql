-- The trailer the landing page and title pages can play: a YouTube video id from TMDB
-- (data/etl/fetch-trailers.ts). NULL when the title has none.
ALTER TABLE "Title" ADD COLUMN "trailerKey" TEXT;

-- Only a YouTube id is accepted, so the web app can put it in an embed URL as it is.
ALTER TABLE "Title" ADD CONSTRAINT "Title_trailerKey_format"
  CHECK ("trailerKey" IS NULL OR "trailerKey" ~ '^[A-Za-z0-9_-]{11}$');
