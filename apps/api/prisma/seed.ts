import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { User } from '@prisma/client';
import bcrypt from 'bcrypt';

export async function seed(
  prisma: PrismaClient,
): Promise<{ admin: User; creator: User; consumer: User }> {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // Demo identities intentionally bypass the signup reserved-name validator.
  const [admin, creator, consumer] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@bingemate.dev' },
      update: { username: 'BingeMate Admin', role: 'ADMIN' },
      create: {
        email: 'admin@bingemate.dev',
        username: 'BingeMate Admin',
        passwordHash,
        role: 'ADMIN',
      },
    }),
    prisma.user.upsert({
      where: { email: 'creator@bingemate.dev' },
      update: { username: 'Demo Maker', role: 'MEMBER' },
      create: {
        email: 'creator@bingemate.dev',
        username: 'Demo Maker',
        passwordHash,
        role: 'MEMBER',
      },
    }),
    prisma.user.upsert({
      where: { email: 'consumer@bingemate.dev' },
      update: { username: 'Demo Viewer', role: 'MEMBER' },
      create: {
        email: 'consumer@bingemate.dev',
        username: 'Demo Viewer',
        passwordHash,
        role: 'MEMBER',
      },
    }),
  ]);

  // Sample APPROVED titles (imported-style: created_by NULL would also be valid).
  for (const data of [
    { name: 'Inception', mediaType: 'MOVIE', status: 'APPROVED', releaseYear: 2010 },
    { name: 'Dune', mediaType: 'BOOK', status: 'APPROVED', releaseYear: 1965 },
    { name: 'Breaking Bad', mediaType: 'TV_SHOW', status: 'APPROVED', releaseYear: 2008 },
  ] as const) {
    const existing = await prisma.title.findFirst({
      where: { name: data.name, mediaType: data.mediaType },
    });
    if (!existing) {
      await prisma.title.create({ data });
    }
  }

  // One creator-submitted PENDING title to exercise the approval queue.
  const pending = await prisma.title.findFirst({
    where: { name: 'My Indie Film', mediaType: 'MOVIE' },
  });
  if (!pending) {
    await prisma.title.create({
      data: {
        name: 'My Indie Film',
        mediaType: 'MOVIE',
        status: 'PENDING',
        createdById: creator.id,
      },
    });
  }

  return { admin, creator, consumer };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { admin, creator, consumer } = await seed(prisma);
    console.log('Seeded users:', {
      admin: admin.email,
      creator: creator.email,
      consumer: consumer.email,
    });
  } finally {
    await prisma.$disconnect();
  }
}

function isRunDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isRunDirectly()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
