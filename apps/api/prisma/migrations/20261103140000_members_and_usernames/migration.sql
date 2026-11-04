-- Keep the data repair, enum replacement and unique index atomic.
BEGIN;

-- Prevent writes while repairing names and replacing their uniqueness rule.
LOCK TABLE "User" IN ACCESS EXCLUSIVE MODE;

-- Keep the earliest (createdAt, id) for each case-insensitive name. Probe every
-- suffix against all rows, since a generated name may already exist. Values are
-- bound PL/pgSQL variables, so spaces, quotes and Unicode need no SQL escaping.
DO $$
DECLARE
  duplicate_user RECORD;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM "User" WHERE "username" IS NOT NULL
      GROUP BY lower("username") HAVING count(*) > 1
    );
    FOR duplicate_user IN
      SELECT id, username FROM (
        SELECT "id" AS id, "username" AS username, "createdAt" AS created_at,
               row_number() OVER (
                 PARTITION BY lower("username") ORDER BY "createdAt", "id"
               ) AS position
        FROM "User" WHERE "username" IS NOT NULL
      ) ranked WHERE position > 1
      ORDER BY created_at, id
    LOOP
      suffix := 2;
      LOOP
        candidate := duplicate_user.username || ' (' || suffix || ')';
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM "User" WHERE lower("username") = lower(candidate)
        );
        suffix := suffix + 1;
      END LOOP;
      UPDATE "User" SET "username" = candidate WHERE "id" = duplicate_user.id;
    END LOOP;
  END LOOP;
END;
$$;

-- PostgreSQL cannot drop enum values: replace the type after removing its default.
-- No existing view depends on User.role or on the Role type.
-- Create the replacement enum with exactly the supported labels.
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'MEMBER');
-- Remove the default that depends on the old enum.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
-- Preserve admins and merge both non-admin roles into MEMBER.
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN' ELSE 'MEMBER' END)::"Role_new";
-- Restore the signup default using the replacement enum.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
-- The old enum now has no dependants.
DROP TYPE "Role";
-- Keep the original type name for Prisma and existing queries.
ALTER TYPE "Role_new" RENAME TO "Role";

-- Expression uniqueness is intentionally maintained in SQL, outside Prisma's schema.
-- PostgreSQL permits multiple NULL usernames for legacy users.
CREATE UNIQUE INDEX "User_username_lower_key" ON "User" (lower("username"));

COMMIT;
