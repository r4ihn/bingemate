import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rate } from '../test/utils.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import { apiFetch } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { repliesApi, reviewsApi } from '../api/reviews.js';
import { ReplyThread } from '../components/review/ReplyThread.js';
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
  const wrap = (el: React.ReactElement) => (
    <AuthProvider>
      <MemoryRouter>{el}</MemoryRouter>
    </AuthProvider>
  );
  const view = render(wrap(ui));
  return { show: (el: React.ReactElement) => view.rerender(wrap(el)) };
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

  it('keeps the reply form, the typed text and shows a session message', async () => {
    vi.spyOn(repliesApi, 'create').mockImplementation(() =>
      apiFetch('/replies', { method: 'POST' }),
    );
    renderWithRealAuth(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Reply to review by / }));
    await u.type(screen.getByLabelText('Write a reply'), 'Almost posted this');
    await u.click(screen.getByRole('button', { name: 'Post reply' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i);
    expect(screen.getByLabelText('Write a reply')).toHaveValue('Almost posted this');
  });
});

describe('after the session has expired', () => {
  const other = { ...movie, id: 'mock-21', name: 'Other Title' };

  it('another title shows "Log in to review" instead of a form that is bound to fail', async () => {
    vi.spyOn(reviewsApi, 'create').mockImplementation(() =>
      apiFetch('/reviews', { method: 'POST' }),
    );
    const { show } = renderWithRealAuth(<ReviewForm title={movie} onSubmitted={vi.fn()} />);
    const u = userEvent.setup();
    await screen.findByRole('radio', { name: '4 stars' });
    await rate(u, 4);
    await u.type(screen.getByLabelText('Runtime watched (minutes)'), '100');
    await u.type(screen.getByLabelText('Your review'), 'Worth the wait');
    await u.click(screen.getByRole('button', { name: 'Post review' }));
    await screen.findByRole('alert');

    show(<ReviewForm title={other} onSubmitted={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Log in to review' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Your review')).not.toBeInTheDocument();

    show(<ReviewForm title={movie} onSubmitted={vi.fn()} />);
    expect(screen.queryByLabelText('Your review')).not.toBeInTheDocument(); // the old draft is gone too
  });

  it('another review shows no way to reply', async () => {
    vi.spyOn(repliesApi, 'create').mockImplementation(() =>
      apiFetch('/replies', { method: 'POST' }),
    );
    const { show } = renderWithRealAuth(
      <ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />,
    );
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Reply to review by / }));
    await u.type(screen.getByLabelText('Write a reply'), 'Almost posted this');
    await u.click(screen.getByRole('button', { name: 'Post reply' }));
    await screen.findByRole('alert');

    show(<ReplyThread reviewId="r-mock-1-1" reviewAuthor="dev_k" />);
    await vi.waitFor(() => expect(screen.queryByText('Loading replies…')).not.toBeInTheDocument());
    expect(screen.queryByLabelText('Write a reply')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reply to review by / })).not.toBeInTheDocument();
  });
});
