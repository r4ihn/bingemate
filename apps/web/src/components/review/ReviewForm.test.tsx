import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import type { TitleSummary } from '@bingemate/shared';
import { ApiError } from '../../api/client.js';
import { reviewsApi } from '../../api/reviews.js';
import { db, resetDb } from '../../mocks/db.js';
import { rate, renderWithProviders } from '../../test/utils.js';
import type { Review } from '../../types/review.js';
import { ReviewForm } from './ReviewForm.js';

const base = { id: 'mock-20', status: TitleStatus.APPROVED, avgRating: 4, reviewCount: 0 };
const movie: TitleSummary = { ...base, name: 'Quiet Orbit', mediaType: MediaType.MOVIE };
const tv: TitleSummary = { ...base, name: 'Harbour Nine', mediaType: MediaType.TV_SHOW };

const fake: Review = {
  id: 'r1',
  titleId: 'mock-20',
  author: { id: 'mock-user', name: 'You', role: Role.CONSUMER },
  rating: 4,
  body: 'Great',
  fields: { runtimeMinutes: 100 },
  createdAt: new Date().toISOString(),
};

function mount(title = movie, onSubmitted = vi.fn()) {
  renderWithProviders(<ReviewForm title={title} onSubmitted={onSubmitted} />, {
    role: Role.CONSUMER,
  });
  return { onSubmitted, user: userEvent.setup() };
}

/** Mounts the form and waits for the "already reviewed?" check to let it through. */
async function setup(title = movie, onSubmitted = vi.fn()) {
  const view = mount(title, onSubmitted);
  await screen.findByLabelText('Your review');
  return view;
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { rating = 4 as number | null, body = 'Great', media = '100' } = {},
) {
  if (rating) await rate(user, rating);
  if (body) await user.type(screen.getByLabelText('Your review'), body);
  if (media) await user.type(screen.getByLabelText('Runtime watched (minutes)'), media);
}

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('ReviewForm', () => {
  it('renders movie fields for MOVIE and season/episode fields for TV_SHOW', async () => {
    await setup(movie);
    expect(screen.getByLabelText('Runtime watched (minutes)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Season')).not.toBeInTheDocument();
  });

  it('renders season and episode fields for TV_SHOW', async () => {
    await setup(tv);
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

  it('asks for a rating when no star is chosen and does not call the API', async () => {
    const create = vi.spyOn(reviewsApi, 'create');
    const { user } = await setup();
    await fill(user, { rating: null });
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a rating from 1 to 5 stars');
  });

  it('offers five stars, one to five', async () => {
    await setup();
    expect(screen.getAllByRole('radio', { name: /star/ })).toHaveLength(5);
  });

  it('does not call the API when the review text is empty', async () => {
    const create = vi.spyOn(reviewsApi, 'create');
    const { user } = await setup();
    await fill(user, { body: '' });
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/write something/i);
  });

  it('a 401 shows an error with a login link', async () => {
    vi.spyOn(reviewsApi, 'create').mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const { user } = await setup();
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
    const { user } = await setup();
    await fill(user);
    await user.dblClick(screen.getByRole('button', { name: 'Post review' }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('submits the typed values, calls onSubmitted and clears the form', async () => {
    const { onSubmitted, user } = await setup();
    await fill(user, { rating: 5, body: 'Loved it', media: '120' });
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(onSubmitted.mock.calls[0]?.[0]).toMatchObject({
      rating: 5,
      body: 'Loved it',
      fields: { runtimeMinutes: 120 },
    });
    expect(screen.getByLabelText('Your review')).toHaveValue('');
  });

  it('shows the server message when the user already reviewed the title (409)', async () => {
    const { user } = await setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    await vi.waitFor(() => expect(screen.getByLabelText('Your review')).toHaveValue(''));
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already reviewed/i);
  });

  it('shows a message with the rating instead of the form when the user already reviewed the title', async () => {
    db.reviews.push({ ...fake, author: { id: 'test-user', name: 'You', role: Role.CONSUMER } });
    mount();
    expect(await screen.findByText(/You have already reviewed this title/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Your review')).not.toBeInTheDocument();
  });

  it('shows the form for a title the user has not reviewed, even if they reviewed another', async () => {
    db.reviews.push({
      ...fake,
      titleId: 'mock-21',
      author: { id: 'test-user', name: 'You', role: Role.CONSUMER },
    });
    mount();
    expect(await screen.findByLabelText('Your review')).toBeInTheDocument();
  });

  it('falls back to the form (the 409 still guards) when the check cannot load', async () => {
    vi.spyOn(reviewsApi, 'mine').mockRejectedValue(new ApiError(500, 'boom'));
    mount();
    expect(await screen.findByLabelText('Your review')).toBeInTheDocument();
  });
});
