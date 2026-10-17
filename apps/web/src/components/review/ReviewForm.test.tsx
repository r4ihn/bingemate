import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import type { TitleSummary } from '@bingemate/shared';
import { ApiError } from '../../api/client.js';
import { reviewsApi } from '../../api/reviews.js';
import { resetDb } from '../../mocks/db.js';
import { renderWithProviders } from '../../test/utils.js';
import type { Review } from '../../types/review.js';
import { ReviewForm } from './ReviewForm.js';

const base = { id: 'mock-20', status: TitleStatus.APPROVED, avgRating: 7, reviewCount: 0 };
const movie: TitleSummary = { ...base, name: 'Quiet Orbit', mediaType: MediaType.MOVIE };
const tv: TitleSummary = { ...base, name: 'Harbour Nine', mediaType: MediaType.TV_SHOW };

const fake: Review = {
  id: 'r1',
  titleId: 'mock-20',
  author: { id: 'mock-user', name: 'You', role: Role.CONSUMER },
  rating: 8,
  body: 'Great',
  fields: { runtimeMinutes: 100 },
  createdAt: new Date().toISOString(),
};

function setup(title = movie, onSubmitted = vi.fn()) {
  renderWithProviders(<ReviewForm title={title} onSubmitted={onSubmitted} />, {
    role: Role.CONSUMER,
  });
  return { onSubmitted, user: userEvent.setup() };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { rating = '8', body = 'Great', media = '100' } = {},
) {
  if (rating) await user.type(screen.getByLabelText(/^Rating/), rating);
  if (body) await user.type(screen.getByLabelText('Your review'), body);
  if (media) await user.type(screen.getByLabelText('Runtime watched (minutes)'), media);
}

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('ReviewForm', () => {
  it('renders movie fields for MOVIE and season/episode fields for TV_SHOW', () => {
    setup(movie);
    expect(screen.getByLabelText('Runtime watched (minutes)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Season')).not.toBeInTheDocument();
  });

  it('renders season and episode fields for TV_SHOW', () => {
    setup(tv);
    expect(screen.getByLabelText('Season')).toBeInTheDocument();
    expect(screen.getByLabelText('Episodes watched')).toBeInTheDocument();
    expect(screen.queryByLabelText('Runtime watched (minutes)')).not.toBeInTheDocument();
  });

  it('shows a login link instead of the form to anonymous visitors', () => {
    renderWithProviders(<ReviewForm title={movie} onSubmitted={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Log in to review' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.queryByLabelText('Your review')).not.toBeInTheDocument();
  });

  it.each(['0', '11', '', 'abc', '5.5'])(
    'rating %j shows an error and does not call the API',
    async (rating) => {
      const create = vi.spyOn(reviewsApi, 'create');
      const { user } = setup();
      await fill(user, { rating });
      await user.click(screen.getByRole('button', { name: 'Post review' }));
      expect(create).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/rating/i);
    },
  );

  it('does not call the API when the review text is empty', async () => {
    const create = vi.spyOn(reviewsApi, 'create');
    const { user } = setup();
    await fill(user, { body: '' });
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/write something/i);
  });

  it('a 401 shows an error with a login link', async () => {
    vi.spyOn(reviewsApi, 'create').mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const { user } = setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/session/i);
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByLabelText('Your review')).toHaveValue('Great');
  });

  it('double submit sends one request', async () => {
    const create = vi
      .spyOn(reviewsApi, 'create')
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(fake), 50)));
    const { user } = setup();
    await fill(user);
    await user.dblClick(screen.getByRole('button', { name: 'Post review' }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('submits the typed values, calls onSubmitted and clears the form', async () => {
    const { onSubmitted, user } = setup();
    await fill(user, { rating: '9', body: 'Loved it', media: '120' });
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(onSubmitted.mock.calls[0]?.[0]).toMatchObject({
      rating: 9,
      body: 'Loved it',
      fields: { runtimeMinutes: 120 },
    });
    expect(screen.getByLabelText('Your review')).toHaveValue('');
  });

  it('shows the server message when the user already reviewed the title (409)', async () => {
    const { user } = setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    await vi.waitFor(() => expect(screen.getByLabelText('Your review')).toHaveValue(''));
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already reviewed/i);
  });
});
