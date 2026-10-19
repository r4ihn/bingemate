import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
});
