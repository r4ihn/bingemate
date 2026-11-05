import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShutdown } from '../../src/utils/shutdown.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(timeoutMs?: number) {
  const calls: string[] = [];
  let finishClose!: (err?: Error) => void;
  const server = {
    close: vi.fn((cb: (err?: Error) => void) => {
      calls.push('close');
      finishClose = cb;
    }),
  };
  const stopTimers = vi.fn(() => {
    calls.push('stopTimers');
  });
  const disconnect = vi.fn(async () => {
    calls.push('disconnect');
  });
  const exit = vi.fn((code: number) => {
    calls.push(`exit(${code})`);
  });
  const shutdown = createShutdown({ server, stopTimers, disconnect, exit, timeoutMs });
  return {
    calls,
    server,
    stopTimers,
    disconnect,
    exit,
    shutdown,
    finishClose: (err?: Error) => finishClose(err),
  };
}

describe('graceful shutdown', () => {
  it('stops timers, waits for close, disconnects and exits successfully in order', async () => {
    const s = setup();
    const pending = s.shutdown('SIGTERM');
    expect(s.calls).toEqual(['stopTimers', 'close']);
    expect(s.disconnect).not.toHaveBeenCalled();
    expect(s.exit).not.toHaveBeenCalled();
    s.finishClose();
    await pending;
    expect(s.calls).toEqual(['stopTimers', 'close', 'disconnect', 'exit(0)']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a second signal while closing and after completion', async () => {
    const s = setup();
    const pending = s.shutdown('SIGINT');
    await s.shutdown('SIGTERM');
    expect(s.stopTimers).toHaveBeenCalledTimes(1);
    expect(s.server.close).toHaveBeenCalledTimes(1);
    s.finishClose();
    await pending;
    await s.shutdown('SIGINT');
    expect(s.disconnect).toHaveBeenCalledTimes(1);
    expect(s.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('exits with 1 when disconnect fails', async () => {
    const s = setup();
    s.disconnect.mockRejectedValue(new Error('disconnect failed'));
    const pending = s.shutdown('SIGTERM');
    s.finishClose();
    await pending;
    expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('exits with 1 if close reports an error', async () => {
    const s = setup();
    const pending = s.shutdown('SIGTERM');
    s.finishClose(new Error('close failed'));
    await pending;
    expect(s.disconnect).not.toHaveBeenCalled();
    expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('exits with 1 if stopping timers throws', async () => {
    const s = setup();
    s.stopTimers.mockImplementation(() => {
      throw new Error('stop failed');
    });
    await s.shutdown('SIGTERM');
    expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('uses an unref’d 10 second deadline when close never calls back', async () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const s = setup();
    void s.shutdown('SIGTERM');
    expect((timeout.mock.results[0]!.value as NodeJS.Timeout).hasRef()).toBe(false);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(s.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('applies the deadline to disconnect too and never exits twice', async () => {
    const s = setup(50);
    let finishDisconnect!: () => void;
    s.disconnect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDisconnect = resolve;
        }),
    );
    const pending = s.shutdown('SIGTERM');
    s.finishClose();
    await vi.advanceTimersByTimeAsync(50);
    expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
    finishDisconnect();
    await pending;
    expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
