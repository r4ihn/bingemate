import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Role } from '@bingemate/shared';
import { reviewsApi } from '../../api/reviews.js';
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
