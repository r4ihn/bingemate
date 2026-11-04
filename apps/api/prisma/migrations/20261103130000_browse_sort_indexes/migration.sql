-- The app always filters status = APPROVED and mediaType, so the equality columns lead.
-- A partial index on status = 'APPROVED' was tried, but the planner never used it
-- for Prisma's bound-parameter queries, so status is part of the key instead.

-- CreateIndex
CREATE INDEX "Title_mediaType_status_avgRating_reviewCount_id_idx" ON "Title"("mediaType", "status", "avgRating" DESC, "reviewCount" DESC, "id");

-- CreateIndex
CREATE INDEX "Title_mediaType_status_reviewCount_id_idx" ON "Title"("mediaType", "status", "reviewCount" DESC, "id");
