import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // Demo identities intentionally bypass the signup reserved-name validator.
  const [admin, creator, consumer] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@bingemate.dev' },
      update: { username: 'BingeMate Admin', role: 'ADMIN' },
      create: { email: 'admin@bingemate.dev', username: 'BingeMate Admin', passwordHash, role: 'ADMIN' },
    }),
    prisma.user.upsert({
      where: { email: 'creator@bingemate.dev' },
      update: { username: 'Demo Maker', role: 'MEMBER' },
      create: { email: 'creator@bingemate.dev', username: 'Demo Maker', passwordHash, role: 'MEMBER' },
    }),
    prisma.user.upsert({
      where: { email: 'consumer@bingemate.dev' },
      update: { username: 'Demo Viewer', role: 'MEMBER' },
      create: { email: 'consumer@bingemate.dev', username: 'Demo Viewer', passwordHash, role: 'MEMBER' },
    }),
  ]);

  // Sample APPROVED titles (imported-style: created_by NULL would also be valid).
  await prisma.title.createMany({
    data: [
      { name: 'Inception', mediaType: 'MOVIE', status: 'APPROVED', releaseYear: 2010 },
      { name: 'Dune', mediaType: 'BOOK', status: 'APPROVED', releaseYear: 1965 },
      { name: 'Breaking Bad', mediaType: 'TV_SHOW', status: 'APPROVED', releaseYear: 2008 },
    ],
    skipDuplicates: true,
  });

  // One creator-submitted PENDING title to exercise the approval queue.
  const pending = await prisma.title.findFirst({ where: { name: 'My Indie Film' } });
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

  console.log('Seeded users:', {
    admin: admin.email,
    creator: creator.email,
    consumer: consumer.email,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
