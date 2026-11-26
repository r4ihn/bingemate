import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

export type PrismaClientOptions = { log?: Prisma.LogLevel[] };

/**
 * Prisma 7 talks to PostgreSQL through the `pg` driver adapter instead of a bundled engine, so every
 * client (the app's, the seed, ETL and benchmarks) is built here with an explicit connection string.
 * Like Prisma 6, nothing connects until the first query, so building one without a URL is safe.
 */
export function createPrismaClient(
  connectionString = process.env.DATABASE_URL,
  options: PrismaClientOptions = {},
): PrismaClient {
  return new PrismaClient({ ...options, adapter: new PrismaPg({ connectionString }) });
}
