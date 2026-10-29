-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CREATOR', 'CONSUMER');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('MOVIE', 'BOOK', 'TV_SHOW');

-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ListStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'PLAN_TO');

-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('AUTHOR', 'DIRECTOR', 'ACTOR', 'SHOWRUNNER', 'WRITER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CONSUMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "status" "TitleStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "releaseYear" INTEGER,
    "description" TEXT,
    "posterUrl" TEXT,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleGenre" (
    "titleId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "TitleGenre_pkey" PRIMARY KEY ("titleId","genreId")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitlePerson" (
    "titleId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL,

    CONSTRAINT "TitlePerson_pkey" PRIMARY KEY ("titleId","personId","role")
);

-- CreateTable
CREATE TABLE "ListEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "status" "ListStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Title_mediaType_idx" ON "Title"("mediaType");

-- CreateIndex
CREATE INDEX "Title_name_idx" ON "Title"("name");

-- CreateIndex
CREATE INDEX "Title_status_idx" ON "Title"("status");

-- CreateIndex
CREATE INDEX "Title_avgRating_idx" ON "Title"("avgRating");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");

-- CreateIndex
CREATE INDEX "TitleGenre_genreId_idx" ON "TitleGenre"("genreId");

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX "TitlePerson_personId_idx" ON "TitlePerson"("personId");

-- CreateIndex
CREATE INDEX "ListEntry_userId_idx" ON "ListEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ListEntry_userId_titleId_key" ON "ListEntry"("userId", "titleId");

-- CreateIndex
CREATE INDEX "Review_titleId_idx" ON "Review"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_titleId_key" ON "Review"("userId", "titleId");

-- AddForeignKey
ALTER TABLE "Title" ADD CONSTRAINT "Title_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleGenre" ADD CONSTRAINT "TitleGenre_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleGenre" ADD CONSTRAINT "TitleGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitlePerson" ADD CONSTRAINT "TitlePerson_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitlePerson" ADD CONSTRAINT "TitlePerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListEntry" ADD CONSTRAINT "ListEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListEntry" ADD CONSTRAINT "ListEntry_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;
