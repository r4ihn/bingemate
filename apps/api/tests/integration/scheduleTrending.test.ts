import { afterEach, describe, expect, it, vi } from 'vitest';
const refreshTrending = vi.fn();
vi.mock('../../src/jobs/refreshTrending.js', () => ({ refreshTrending }));
const { startTrendingRefresh } = await import('../../src/jobs/scheduleTrending.js');
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); refreshTrending.mockReset(); });
describe('trending schedule', () => {
  it('runs at startup, skips overlapping ticks and can be stopped', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    refreshTrending.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
    const stop = startTrendingRefresh();
    expect(refreshTrending).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshTrending).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshTrending).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshTrending).toHaveBeenCalledTimes(2);
  });
  it('logs a failure and retries on the next tick', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    refreshTrending.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const stop = startTrendingRefresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(console.error).toHaveBeenCalled();
    expect(refreshTrending).toHaveBeenCalledTimes(2);
    stop();
  });
});
