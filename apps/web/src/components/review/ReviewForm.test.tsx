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
  { rating = 4 as number | null, body = 'Great' } = {},
) {
  if (rating) await rate(user, rating);
  if (body) await user.type(screen.getByLabelText('Your review'), body);
}

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('ReviewForm', () => {
  it.each([
    ['a movie', movie],
    ['a TV show', tv],
    ['a book', { ...movie, mediaType: MediaType.BOOK }],
  ])('asks only for stars and text on %s', async (_label, title) => {
    await setup(title);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    // the review box is the only text input: no runtime, chapters, season or episodes
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByLabelText('Your review')).toBeInTheDocument();
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
    await fill(user, { rating: 5, body: 'Loved it' });
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(onSubmitted.mock.calls[0]?.[0]).toMatchObject({
      rating: 5,
      body: 'Loved it',
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
  it('shows admins nothing: no form and no login prompt', async () => {
    const { container } = renderWithProviders(<ReviewForm title={movie} onSubmitted={vi.fn()} />, {
      role: Role.ADMIN,
    });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Log in to review')).not.toBeInTheDocument();
  });

  it('tells the creator of the title they can reply but not review, with no form', async () => {
    renderWithProviders(
      <ReviewForm title={{ ...movie, createdById: 'test-user' }} onSubmitted={vi.fn()} />,
      { role: Role.CREATOR },
    );
    expect(await screen.findByText(/You created this title/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Your review')).not.toBeInTheDocument();
  });

  it('still shows the form to a creator on a title someone else created', async () => {
    renderWithProviders(
      <ReviewForm title={{ ...movie, createdById: 'someone-else' }} onSubmitted={vi.fn()} />,
      { role: Role.CREATOR },
    );
    expect(await screen.findByLabelText('Your review')).toBeInTheDocument();
  });

  describe('editing', () => {
    const mine = { ...fake, author: { id: 'test-user', name: 'You', role: Role.CONSUMER } };

    async function edit() {
      db.reviews.push({ ...mine });
      const view = mount();
      await view.user.click(await screen.findByRole('button', { name: 'Edit review' }));
      return view;
    }

    it('moves focus into the form on Edit and back to the Edit button on Cancel', async () => {
      const { user } = await edit();
      expect(screen.getByRole('heading', { name: 'Edit your review' })).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Edit review' })).toHaveFocus();
    });

    it('returns focus to the Edit button after saving', async () => {
      const { user, onSubmitted } = await edit();
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
      expect(await screen.findByRole('button', { name: 'Edit review' })).toHaveFocus();
    });

    it('opens the form filled with the current review', async () => {
      await edit();
      expect(screen.getByRole('heading', { name: 'Edit your review' })).toBeInTheDocument();
      expect(screen.getByLabelText('Your review')).toHaveValue('Great');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    });

    it('saves over the same review, keeps the date and moves the average', async () => {
      db.titles.find((t) => t.id === 'mock-20')!.avgRating = 4;
      db.titles.find((t) => t.id === 'mock-20')!.reviewCount = 1;
      const { user, onSubmitted } = await edit();
      await rate(user, 2);
      const body = screen.getByLabelText('Your review');
      await user.clear(body);
      await user.type(body, 'Changed my mind');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
      expect(db.reviews.filter((r) => r.id === 'r1')).toHaveLength(1);
      expect(db.reviews.find((r) => r.id === 'r1')).toMatchObject({
        id: 'r1',
        rating: 2,
        body: 'Changed my mind',
        createdAt: mine.createdAt,
      });
      expect(db.titles.find((t) => t.id === 'mock-20')?.avgRating).toBe(2);
    });

    it('still checks the text before saving', async () => {
      const { user } = await edit();
      await user.clear(screen.getByLabelText('Your review'));
      const update = vi.spyOn(reviewsApi, 'update');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText(/Write something/)).toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();
    });

    it('cancel leaves the review untouched', async () => {
      const { user } = await edit();
      await user.type(screen.getByLabelText('Your review'), ' extra');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByText(/You have already reviewed this title/)).toBeInTheDocument();
      expect(db.reviews.find((r) => r.id === 'r1')?.body).toBe('Great');
    });

    it('shows the server message when the save is refused', async () => {
      const { user } = await edit();
      vi.spyOn(reviewsApi, 'update').mockRejectedValue(new ApiError(403, 'Not yours'));
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Not yours');
    });
  });
});
