-- creator_title_stats filters Title by createdById and counts ListEntry rows per titleId; the
-- (userId, titleId) unique index cannot serve a titleId-only lookup. Also speeds up the
-- ON DELETE CASCADE / SET NULL scans when a title or user is deleted.
CREATE INDEX "Title_createdById_idx" ON "Title"("createdById");
CREATE INDEX "ListEntry_titleId_idx" ON "ListEntry"("titleId");
