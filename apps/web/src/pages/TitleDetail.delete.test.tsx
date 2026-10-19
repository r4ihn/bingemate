import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { MediaType, Role } from '@bingemate/shared';
import { commentsApi, reviewsApi } from '../api/reviews.js';
import { db, resetDb } from '../mocks/db.js';
import { renderWithProviders } from '../test/utils.js';
import { TitleDetail } from './TitleDetail.js';

function renderTitle(id: string, role?: Role) {
  renderWithProviders(
    <Routes>
      <Route path="/titles/:id" element={<TitleDetail />} />
    </Routes>,
    { route: `/titles/${id}`, role },
  );
  return userEvent.setup();
}

// renderWithProviders signs in as { id: 'test-user' }
const me = { id: 'test-user', name: 'You', role: Role.CONSUMER };
const deleteButtons = (kind: 'review' | 'comment') =>
  screen.queryAllByRole('button', { name: new RegExp(`^Delete ${kind}`) });

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('delete controls', () => {
  it('are hidden from anonymous visitors', async () => {
    renderTitle('mock-1');
    await screen.findByText('Great pacing in the second half.');
    expect(deleteButtons('review')).toHaveLength(0);
    expect(deleteButtons('comment')).toHaveLength(0);
  });

  it('are hidden from a user who wrote none of the content', async () => {
    renderTitle('mock-1', Role.CONSUMER);
    await screen.findByText('Great pacing in the second half.');
    expect(deleteButtons('review')).toHaveLength(0);
    expect(deleteButtons('comment')).toHaveLength(0);
  });

  it('show on a review only to its author', async () => {
    db.reviews.push({
      id: 'r-own',
      titleId: 'mock-20',
      author: me,
      rating: 4,
      body: 'My own take',
      fields: { runtimeMinutes: 100 },
      createdAt: new Date().toISOString(),
    });
    renderTitle('mock-20', Role.CONSUMER);
    await screen.findByText('My own take');
    expect(deleteButtons('review')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete review by You' })).toBeInTheDocument();
  });

  it('show on a comment only to its author', async () => {
    db.comments.push({
      id: 'c-own',
      reviewId: 'r-mock-1-0',
      parentId: null,
      author: me,
      body: 'My own comment',
      isOfficial: false,
      createdAt: new Date().toISOString(),
    });
    renderTitle('mock-1', Role.CONSUMER);
    await screen.findByText('My own comment');
    expect(deleteButtons('comment')).toHaveLength(1);
    expect(deleteButtons('review')).toHaveLength(0);
  });

  it('show on every review and comment for an admin', async () => {
    renderTitle('mock-1', Role.ADMIN);
    await screen.findByText('Great pacing in the second half.');
    expect(deleteButtons('review')).toHaveLength(5); // page 1
    expect(deleteButtons('comment')).toHaveLength(4); // c1..c4 on the first review
  });

  it('deleting a review asks first, and Cancel keeps it', async () => {
    const remove = vi.spyOn(reviewsApi, 'remove');
    const u = renderTitle('mock-1', Role.ADMIN);
    await screen.findByText('Great pacing in the second half.');
    await u.click(deleteButtons('review')[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete review?')).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();
    expect(deleteButtons('review')).toHaveLength(5);
  });

  it('confirming delete removes the review and its comments', async () => {
    const remove = vi.spyOn(reviewsApi, 'remove');
    const u = renderTitle('mock-1', Role.ADMIN);
    await screen.findByText('Great pacing in the second half.');
    await u.click(deleteButtons('review')[0] as HTMLElement);
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(screen.queryByText('Great pacing in the second half.')).not.toBeInTheDocument(),
    );
    expect(db.reviews.some((r) => r.id === 'r-mock-1-0')).toBe(false);
  });

  it('confirming delete removes an own comment', async () => {
    db.comments.push({
      id: 'c-own',
      reviewId: 'r-mock-1-0',
      parentId: null,
      author: me,
      body: 'My own comment',
      isOfficial: false,
      createdAt: new Date().toISOString(),
    });
    const remove = vi.spyOn(commentsApi, 'remove');
    const u = renderTitle('mock-1', Role.CONSUMER);
    await screen.findByText('My own comment');
    await u.click(deleteButtons('comment')[0] as HTMLElement);
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('c-own'));
    await vi.waitFor(() => expect(screen.queryByText('My own comment')).not.toBeInTheDocument());
  });
});

// keep MediaType import used for fixtures if reviews on other media are added
void MediaType;
