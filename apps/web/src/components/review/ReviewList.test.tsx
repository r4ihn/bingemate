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
      rating: 7,
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
});
