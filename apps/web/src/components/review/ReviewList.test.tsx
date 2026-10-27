import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import type { TitleSummary } from '@bingemate/shared';
import { reviewsApi } from '../../api/reviews.js';
import { db, resetDb, setMockActor } from '../../mocks/db.js';
import { renderWithProviders } from '../../test/utils.js';
import type { Review } from '../../types/review.js';
import { ReviewList } from './ReviewList.js';

afterEach(() => vi.restoreAllMocks());

describe('ReviewList with unexpected data', () => {
  it('never prints "undefined" for a review whose media fields have an unknown shape', async () => {
    const odd = {
      id: 'r-odd',
      titleId: 't1',
      author: { id: 'a', name: 'someone', role: Role.CONSUMER },
      rating: 4,
      body: 'Odd one',
      fields: {},
      createdAt: new Date().toISOString(),
    } as unknown as Review;
    vi.spyOn(reviewsApi, 'listByTitle').mockResolvedValue({
      data: [odd],
      page: 1,
      pageSize: 5,
      total: 1,
    });
    renderWithProviders(<ReviewList titleId="t1" />);
    await screen.findByText('Odd one');
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it('shows a review rating as stars out of five, not as a number out of ten', async () => {
    const review = {
      id: 'r-stars',
      titleId: 't1',
      author: { id: 'a', name: 'someone', role: Role.CONSUMER },
      rating: 4,
      body: 'Four stars',
      fields: { runtimeMinutes: 90 },
      createdAt: new Date().toISOString(),
    } as Review;
    vi.spyOn(reviewsApi, 'listByTitle').mockResolvedValue({
      data: [review],
      page: 1,
      pageSize: 5,
      total: 1,
    });
    renderWithProviders(<ReviewList titleId="t1" />);
    await screen.findByText('Four stars');
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d\/10(?!\/)/);
  });
  it('badges a review by the creator of this title only', async () => {
    const review = (id: string, authorId: string, name: string): Review => ({
      id,
      titleId: 't1',
      author: { id: authorId, name, role: Role.CREATOR },
      rating: 4,
      body: `Review by ${name}`,
      fields: { runtimeMinutes: 90 },
      createdAt: new Date().toISOString(),
    });
    vi.spyOn(reviewsApi, 'listByTitle').mockResolvedValue({
      data: [review('r1', 'studio', 'studio_north'), review('r2', 'other', 'other_studio')],
      page: 1,
      pageSize: 5,
      total: 2,
    });
    renderWithProviders(<ReviewList titleId="t1" titleOwnerId="studio" />);
    await screen.findByText('Review by studio_north');
    expect(screen.getAllByText('Creator')).toHaveLength(1);
    const card = screen.getByText('Review by studio_north').closest('article') as HTMLElement;
    expect(within(card).getByText('Creator')).toBeInTheDocument();
  });
});

describe('review card actions', () => {
  const movie: TitleSummary = {
    id: 'mock-20',
    name: 'Quiet Orbit',
    mediaType: MediaType.MOVIE,
    status: TitleStatus.APPROVED,
    avgRating: 4,
    reviewCount: 1,
  };
  const review = (id: string, authorId: string, name: string): Review => ({
    id,
    titleId: 'mock-20',
    author: { id: authorId, name, role: Role.CONSUMER },
    rating: 4,
    body: `Words by ${name}`,
    fields: { runtimeMinutes: 100 },
    createdAt: new Date().toISOString(),
  });

  beforeEach(() => {
    resetDb();
    setMockActor({ id: 'test-user', email: 'sam@test.dev', role: Role.CONSUMER });
    db.reviews.push(review('r-mine', 'test-user', 'sam_k'), review('r-other', 'other', 'maya_r'));
  });

  const mount = () =>
    renderWithProviders(<ReviewList titleId="mock-20" title={movie} />, { role: Role.CONSUMER });
  const card = (text: string) => screen.getByText(text).closest('article') as HTMLElement;

  it('puts Reply, Edit and Delete in one row on your own review, and marks it You', async () => {
    mount();
    await screen.findByText('Words by sam_k');
    const mine = card('Words by sam_k');
    expect(within(mine).getByText('You')).toBeInTheDocument();
    const row = within(mine).getByRole('button', { name: /^Reply to review by / }).parentElement;
    expect(
      within(row as HTMLElement).getByRole('button', { name: 'Edit review by sam_k' }),
    ).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByRole('button', { name: 'Delete review by sam_k' }),
    ).toBeInTheDocument();
  });

  it("shows only Reply on someone else's review", async () => {
    mount();
    await screen.findByText('Words by maya_r');
    const other = card('Words by maya_r');
    expect(within(other).getByRole('button', { name: /^Reply to review by / })).toBeInTheDocument();
    expect(within(other).queryByRole('button', { name: /^Edit review/ })).not.toBeInTheDocument();
    expect(within(other).queryByRole('button', { name: /^Delete review/ })).not.toBeInTheDocument();
    expect(within(other).queryByText('You')).not.toBeInTheDocument();
  });

  it('edits in place: the card turns into the form, then saves, closes and returns focus', async () => {
    mount();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Edit review by sam_k' }));
    const mine = screen
      .getByRole('heading', { name: 'Edit your review' })
      .closest('article') as HTMLElement;
    expect(within(mine).getByLabelText('Your review')).toHaveValue('Words by sam_k');
    expect(
      within(mine).queryByRole('button', { name: /^Reply to review by / }),
    ).not.toBeInTheDocument();
    const box = within(mine).getByLabelText('Your review');
    await u.clear(box);
    await u.type(box, 'Rewritten');
    await u.click(within(mine).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Rewritten')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit your review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit review by sam_k' })).toHaveFocus();
    expect(db.reviews.find((r) => r.id === 'r-mine')?.body).toBe('Rewritten');
  });

  it('Cancel leaves the review as it was', async () => {
    mount();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Edit review by sam_k' }));
    await u.type(screen.getByLabelText('Your review'), ' extra');
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Words by sam_k')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit review by sam_k' })).toHaveFocus();
  });

  it('has no Edit button when the list is not given the title to edit against', async () => {
    renderWithProviders(<ReviewList titleId="mock-20" />, { role: Role.CONSUMER });
    await screen.findByText('Words by sam_k');
    expect(screen.queryByRole('button', { name: /^Edit review/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete review by sam_k' })).toBeInTheDocument();
  });
});
