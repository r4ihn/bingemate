// Prisma CLI config (Prisma 7+). The CLI no longer reads .env on its own, so dotenv loads it here.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` needs no database, so a missing URL must not fail it (e.g. in CI).
    url: process.env.DATABASE_URL ?? '',
  },
});
