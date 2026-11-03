import { randomUUID } from 'node:crypto';
import { afterAll } from 'vitest';
import type { MediaType, Role, TitleStatus, User } from '@prisma/client';
import { prisma } from '../../src/db/prisma.js';
import { connectMongo, disconnectMongo } from '../../src/db/mongo.js';
import { signToken } from '../../src/utils/jwt.js';
import { refreshTitleRanks } from '../../src/modules/titles/ranking.service.js';
import { assertTestDatabase } from './guard.js';

export async function resetDatabases(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL ?? '', 'DATABASE_URL');
  assertTestDatabase(process.env.MONGO_URI ?? '', 'MONGO_URI');
  const mongo = await connectMongo();
  // Quote catalog identifiers, not URL input. Include newly migrated tables automatically.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => quote(t.tablename)).join(', ')} CASCADE`,
    );
  }
  const db = mongo.connection.db;
  if (!db) throw new Error('Mongo test connection has no database');
  for (const collection of await db.collections()) await collection.drop();
  // TRUNCATE does not invalidate materialized rows; clear the previous test's ranks too.
  await refreshViews();
}

export function createUser(role: Role = 'CONSUMER') {
  return prisma.user.create({
    data: {
      email: `${randomUUID()}@real-tests.example`,
      passwordHash: 'fixed-dummy-password-hash-not-used-for-login',
      role,
    },
  });
}

export function as(user: Pick<User, 'id' | 'email' | 'role'>) {
  return { Cookie: `token=${signToken(user)}` };
}

export function createTitle(
  options: {
    status?: TitleStatus;
    mediaType?: MediaType;
    createdById?: string;
  } = {},
) {
  return prisma.title.create({
    data: {
      name: `Real test ${randomUUID()}`,
      status: 'APPROVED',
      mediaType: 'MOVIE',
      ...options,
    },
  });
}

export function refreshViews(): Promise<void> {
  return refreshTitleRanks();
}

// Registered in every real test file via this helper, never imported by the default suite.
afterAll(async () => {
  try {
    await disconnectMongo();
  } finally {
    await prisma.$disconnect();
  }
});
