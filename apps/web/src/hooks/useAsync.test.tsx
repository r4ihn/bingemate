import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsync } from './useAsync.js';

describe('useAsync', () => {
  it('reload keeps the current data on screen instead of dropping back to loading', async () => {
    let n = 0;
    const { result } = renderHook(() => useAsync(async () => ++n, []));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    act(() => result.current.reload());
    expect(result.current.state.status).toBe('ready');
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready', data: 2 }));
  });

  it('by default a changed input shows loading', async () => {
    const { result, rerender } = renderHook(({ k }) => useAsync(async () => k, [k]), {
      initialProps: { k: 1 },
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    rerender({ k: 2 });
    expect(result.current.state.status).toBe('loading');
  });

  it('with keepPrevious a changed input keeps the old data until the new arrives', async () => {
    const { result, rerender } = renderHook(
      ({ k }) => useAsync(async () => k, [k], { keepPrevious: true }),
      { initialProps: { k: 1 } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    rerender({ k: 2 });
    expect(result.current.state).toMatchObject({ status: 'ready', data: 1 });
    await waitFor(() => expect(result.current.state).toMatchObject({ data: 2 }));
  });
});
