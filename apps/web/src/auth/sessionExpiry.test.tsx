import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rate } from '../test/utils.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import { apiFetch } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { commentsApi, reviewsApi } from '../api/reviews.js';
import { CommentThread } from '../components/review/CommentThread.js';
import { ReviewForm } from '../components/review/ReviewForm.js';
import { resetDb } from '../mocks/db.js';
import { AuthProvider } from './AuthContext.js';

const movie = {
  id: 'mock-20',
  name: 'Quiet Orbit',
  mediaType: MediaType.MOVIE,
  status: TitleStatus.APPROVED,
  avgRating: 4,
  reviewCount: 0,
};

// Exercise the REAL chain: apiFetch sees a 401 -> clears the session in AuthProvider -> UI re-renders
function renderWithRealAuth(ui: React.ReactElement) {
  vi.spyOn(authApi, 'me').mockResolvedValue({ id: 'u1', email: 'a@b.co', role: Role.CONSUMER });
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
  render(
    <AuthProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => resetDb());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a 401 while posting (real session-clearing path)', () => {
  it('keeps the review form, the typed text and shows a session message with a login link', async () => {
    vi.spyOn(reviewsApi, 'create').mockImplementation(() =>
      apiFetch('/reviews', { method: 'POST' }),
    );
    renderWithRealAuth(<ReviewForm title={movie} onSubmitted={vi.fn()} />);
    const u = userEvent.setup();
    await screen.findByRole('radio', { name: '4 stars' });
    await rate(u, 4);
    await u.type(screen.getByLabelText('Runtime watched (minutes)'), '100');
    await u.type(screen.getByLabelText('Your review'), 'Worth the wait');
    await u.click(screen.getByRole('button', { name: 'Post review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i);
    expect(screen.getByLabelText('Your review')).toHaveValue('Worth the wait');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('keeps the comment form, the typed text and shows a session message', async () => {
    vi.spyOn(commentsApi, 'reply').mockImplementation(() =>
      apiFetch('/comments', { method: 'POST' }),
    );
    renderWithRealAuth(<CommentThread reviewId="r-mock-1-0" />);
    const u = userEvent.setup();
    const box = await screen.findByLabelText('Add a comment');
    await u.type(box, 'Almost posted this');
    await u.click(screen.getByRole('button', { name: 'Post comment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i);
    expect(screen.getByLabelText('Add a comment')).toHaveValue('Almost posted this');
  });
});
