import { beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed.js';
import { prisma } from '../../src/db/prisma.js';
import { resetDatabases } from './helpers.js';

beforeEach(resetDatabases);

describe('seed idempotency', () => {
  it('keeps exactly the demo users and titles after three runs', async () => {
    const first = await seed(prisma);
    await seed(prisma);
    const third = await seed(prisma);

    expect(third.admin.id).toBe(first.admin.id);
    expect(third.creator.id).toBe(first.creator.id);
    expect(third.consumer.id).toBe(first.consumer.id);
    expect(
      await prisma.user.findMany({
        select: { email: true, role: true, username: true },
        orderBy: { email: 'asc' },
      }),
    ).toEqual([
      { email: 'admin@bingemate.dev', role: 'ADMIN', username: 'BingeMate Admin' },
      { email: 'consumer@bingemate.dev', role: 'MEMBER', username: 'Demo Viewer' },
      { email: 'creator@bingemate.dev', role: 'MEMBER', username: 'Demo Maker' },
    ]);
    expect(
      await prisma.title.findMany({
        select: { name: true, mediaType: true, status: true, createdById: true },
        orderBy: { name: 'asc' },
      }),
    ).toEqual([
      { name: 'Breaking Bad', mediaType: 'TV_SHOW', status: 'APPROVED', createdById: null },
      { name: 'Dune', mediaType: 'BOOK', status: 'APPROVED', createdById: null },
      { name: 'Inception', mediaType: 'MOVIE', status: 'APPROVED', createdById: null },
      {
        name: 'My Indie Film',
        mediaType: 'MOVIE',
        status: 'PENDING',
        createdById: first.creator.id,
      },
    ]);
  });

  it('preserves an existing title with the same name and media type', async () => {
    const existing = await prisma.title.create({
      data: { name: 'Inception', mediaType: 'MOVIE', status: 'APPROVED', releaseYear: 2010 },
    });

    await seed(prisma);
    await seed(prisma);
    await seed(prisma);

    expect(await prisma.title.count()).toBe(4);
    expect(
      await prisma.title.findMany({
        where: { name: 'Inception', mediaType: 'MOVIE' },
      }),
    ).toEqual([existing]);
  });

  it('creates the sample movies when their names already exist as books', async () => {
    await prisma.title.createMany({
      data: [
        { name: 'Inception', mediaType: 'BOOK', status: 'APPROVED' },
        { name: 'My Indie Film', mediaType: 'BOOK', status: 'APPROVED' },
      ],
    });

    const { creator } = await seed(prisma);
    await seed(prisma);
    await seed(prisma);

    expect(await prisma.title.count()).toBe(6);
    for (const name of ['Inception', 'My Indie Film']) {
      expect(await prisma.title.count({ where: { name, mediaType: 'BOOK' } })).toBe(1);
      expect(await prisma.title.count({ where: { name, mediaType: 'MOVIE' } })).toBe(1);
    }
    expect(
      await prisma.title.findFirst({
        where: { name: 'My Indie Film', mediaType: 'MOVIE' },
      }),
    ).toMatchObject({ status: 'PENDING', createdById: creator.id });
  });
});
