import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, cards } = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn(), title: { findMany: vi.fn() } },
  cards: { estimatedDocumentCount: vi.fn(), bulkWrite: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/trendingCard.model.js', () => ({ TrendingCard: cards }));

const { refreshTrending, refreshIfEmpty, startTrendingTimer } =
  await import('../../src/jobs/refreshTrending.js');

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  prisma.$queryRaw.mockResolvedValue([]);
  cards.estimatedDocumentCount.mockResolvedValue(0);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startTrendingTimer', () => {
  it('waits for the interval, repeats, and stops when requested', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const stop = startTrendingTimer(2, run);

    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(119_999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(2);

    stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(240_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1])('schedules nothing for %i minutes', async (minutes) => {
    const run = vi.fn();
    const stop = startTrendingTimer(minutes, run);

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(run).not.toHaveBeenCalled();
    stop();
  });

  it('unrefs the interval so it does not keep the process alive', () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const stop = startTrendingTimer(1, vi.fn());

    const timer = interval.mock.results[0]!.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    stop();
  });

  it('logs a rejected run and runs again at the next tick', async () => {
    const error = new Error('Refresh failed');
    const run = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    startTrendingTimer(1, run);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(console.error).toHaveBeenCalledWith('Scheduled trending refresh failed:', error);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('also catches a synchronous throw and releases the overlap guard', async () => {
    const error = new Error('Synchronous failure');
    const run = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => {
        throw error;
      })
      .mockResolvedValue(undefined);
    startTrendingTimer(1, run);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(console.error).toHaveBeenCalledWith('Scheduled trending refresh failed:', error);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('skips ticks while a run is pending and resumes after it settles', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const run = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    startTrendingTimer(1, run);

    await vi.advanceTimersByTimeAsync(180_000);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('uses refreshTrending by default without running immediately', async () => {
    startTrendingTimer(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('refreshTrending empty view', () => {
  it('keeps existing cards without writes or deletion and warns', async () => {
    await expect(refreshTrending()).resolves.toEqual({ upserted: 0, removed: 0 });

    expect(cards.bulkWrite).not.toHaveBeenCalled();
    expect(cards.deleteMany).not.toHaveBeenCalled();
    expect(prisma.title.findMany).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'Trending view returned no rows; keeping existing cards',
    );
  });
});

describe('refreshIfEmpty', () => {
  it('runs the job when the collection is empty', async () => {
    await refreshIfEmpty();

    expect(cards.estimatedDocumentCount).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not run the job when the collection has cards', async () => {
    cards.estimatedDocumentCount.mockResolvedValue(1);

    await refreshIfEmpty();

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(cards.bulkWrite).not.toHaveBeenCalled();
    expect(cards.deleteMany).not.toHaveBeenCalled();
  });

  it('logs and swallows a count failure without refreshing', async () => {
    const error = new Error('MongoDB unavailable');
    cards.estimatedDocumentCount.mockRejectedValue(error);

    await expect(refreshIfEmpty()).resolves.toBeUndefined();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Initial trending refresh failed:', error);
  });

  it('logs and swallows a refresh failure', async () => {
    const error = new Error('PostgreSQL unavailable');
    prisma.$queryRaw.mockRejectedValue(error);

    await expect(refreshIfEmpty()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('Initial trending refresh failed:', error);
  });
});
