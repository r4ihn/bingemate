import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client.js';

const fetchMock = vi.fn();
function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('uses the error text the API sends', async () => {
    fetchMock.mockReturnValue(json({ error: 'You have already reviewed this title' }, 409));
    await expect(apiFetch('/test')).rejects.toMatchObject({
      status: 409,
      message: 'You have already reviewed this title',
    });
  });
  it('turns a validation error into its first message', async () => {
    fetchMock.mockReturnValue(
      json(
        {
          error: 'ValidationError',
          details: { formErrors: [], fieldErrors: { body: ['Write something about this title'] } },
        },
        400,
      ),
    );
    await expect(apiFetch('/test')).rejects.toMatchObject({
      message: 'Write something about this title',
    });
  });
  it('falls back to a plain sentence for a validation error with no entries', async () => {
    fetchMock.mockReturnValue(
      json({ error: 'ValidationError', details: { formErrors: [], fieldErrors: {} } }, 400),
    );
    await expect(apiFetch('/test')).rejects.toMatchObject({
      message: 'Please check what you entered',
    });
  });
  it('still reads a message field', async () => {
    fetchMock.mockReturnValue(json({ message: 'Bad id' }, 400));
    await expect(apiFetch('/test')).rejects.toMatchObject({ message: 'Bad id' });
  });
  it('falls back to the status text when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('upstream unavailable', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(apiFetch('/test')).rejects.toMatchObject({ message: 'Bad Gateway' });
  });
  it('resolves undefined for a 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch('/test')).resolves.toBeUndefined();
  });
});
