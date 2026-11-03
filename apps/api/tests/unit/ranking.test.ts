import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn(), $executeRawUnsafe: vi.fn(), $transaction: vi.fn() },
}));
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
const { getTitleRank, refreshTitleRanks } =
  await import('../../src/modules/titles/ranking.service.js');

beforeEach(() => vi.resetAllMocks());

describe('getTitleRank', () => {
  it('maps a bigint rank to a number and keeps top 1 percent for the first title', async () => {
    prisma.$queryRaw.mockResolvedValue([{ rankInType: 1n, topPercent: 1 }]);
    await expect(getTitleRank('t1')).resolves.toEqual({ rankInType: 1, topPercent: 1 });
    const query = prisma.$queryRaw.mock.calls[0]![0];
    expect(query.sql).toMatch(/GREATEST\(1, CEIL\(pct_rank \* 100\)\)/);
  });

  it('returns null when the title has no ranking row', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(getTitleRank('unreviewed')).resolves.toBeNull();
  });

  it('parameterises the title id with Prisma.sql', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const id = "title' OR 1=1 --";
    await getTitleRank(id);
    const query = prisma.$queryRaw.mock.calls[0]![0];
    expect(typeof query).toBe('object');
    expect(query.values).toEqual([id]);
    expect(query.sql).not.toContain(id);
    expect(query.sql).toMatch(/WHERE title_id = \?/);
  });
});

describe('refreshTitleRanks', () => {
  it('refreshes concurrently outside a transaction', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(0);
    await expect(refreshTitleRanks()).resolves.toBeUndefined();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledExactlyOnceWith(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "title_rank_in_type"',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
