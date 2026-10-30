-- CreateTable
CREATE TABLE "MovieDetails" (
    "titleId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL DEFAULT 'MOVIE',
    "runtimeMin" INTEGER,
    "tagline" TEXT,
    "rated" TEXT,
    "letterboxdRating" DOUBLE PRECISION,

    CONSTRAINT "MovieDetails_pkey" PRIMARY KEY ("titleId")
);

-- CreateTable
CREATE TABLE "TvDetails" (
    "titleId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL DEFAULT 'TV_SHOW',
    "numSeasons" INTEGER,
    "duration" INTEGER,
    "contentRating" TEXT,
    "metascore" INTEGER,
    "userscore" INTEGER,

    CONSTRAINT "TvDetails_pkey" PRIMARY KEY ("titleId")
);

-- CreateTable
CREATE TABLE "BookDetails" (
    "titleId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL DEFAULT 'BOOK',
    "publisher" TEXT,
    "ratingsCount" INTEGER,

    CONSTRAINT "BookDetails_pkey" PRIMARY KEY ("titleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MovieDetails_titleId_mediaType_key" ON "MovieDetails"("titleId", "mediaType");

-- CreateIndex
CREATE UNIQUE INDEX "TvDetails_titleId_mediaType_key" ON "TvDetails"("titleId", "mediaType");

-- CreateIndex
CREATE UNIQUE INDEX "BookDetails_titleId_mediaType_key" ON "BookDetails"("titleId", "mediaType");

-- CreateIndex
CREATE UNIQUE INDEX "Title_id_mediaType_key" ON "Title"("id", "mediaType");

-- AddForeignKey
ALTER TABLE "MovieDetails" ADD CONSTRAINT "MovieDetails_titleId_mediaType_fkey" FOREIGN KEY ("titleId", "mediaType") REFERENCES "Title"("id", "mediaType") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvDetails" ADD CONSTRAINT "TvDetails_titleId_mediaType_fkey" FOREIGN KEY ("titleId", "mediaType") REFERENCES "Title"("id", "mediaType") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookDetails" ADD CONSTRAINT "BookDetails_titleId_mediaType_fkey" FOREIGN KEY ("titleId", "mediaType") REFERENCES "Title"("id", "mediaType") ON DELETE CASCADE ON UPDATE CASCADE;


-- A details row can only belong to a title of its own type: the composite foreign key ties the row to
-- the title's mediaType, and these checks fix that value per table. Prisma cannot express a CHECK.
ALTER TABLE "MovieDetails" ADD CONSTRAINT "MovieDetails_type" CHECK ("mediaType" = 'MOVIE');
ALTER TABLE "TvDetails" ADD CONSTRAINT "TvDetails_type" CHECK ("mediaType" = 'TV_SHOW');
ALTER TABLE "BookDetails" ADD CONSTRAINT "BookDetails_type" CHECK ("mediaType" = 'BOOK');

-- Same limits as the cleaners in data/etl.
ALTER TABLE "MovieDetails" ADD CONSTRAINT "MovieDetails_runtimeMin_range" CHECK ("runtimeMin" BETWEEN 1 AND 1000);
ALTER TABLE "MovieDetails" ADD CONSTRAINT "MovieDetails_letterboxdRating_range" CHECK ("letterboxdRating" BETWEEN 0 AND 5);
ALTER TABLE "TvDetails" ADD CONSTRAINT "TvDetails_numSeasons_range" CHECK ("numSeasons" BETWEEN 1 AND 100);
ALTER TABLE "TvDetails" ADD CONSTRAINT "TvDetails_duration_range" CHECK ("duration" BETWEEN 1 AND 1000);
ALTER TABLE "TvDetails" ADD CONSTRAINT "TvDetails_metascore_range" CHECK ("metascore" BETWEEN 0 AND 100);
ALTER TABLE "TvDetails" ADD CONSTRAINT "TvDetails_userscore_range" CHECK ("userscore" BETWEEN 0 AND 100);
ALTER TABLE "BookDetails" ADD CONSTRAINT "BookDetails_ratingsCount_range" CHECK ("ratingsCount" >= 0);
