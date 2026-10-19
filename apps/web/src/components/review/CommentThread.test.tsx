import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@bingemate/shared';
import { commentsApi } from '../../api/reviews.js';
import { resetDb } from '../../mocks/db.js';
import { renderWithProviders } from '../../test/utils.js';
import { CommentThread } from './CommentThread.js';

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('CommentThread', () => {
  it('keeps a half-written comment when a reply is posted and the thread reloads', async () => {
    renderWithProviders(<CommentThread reviewId="r-mock-1-0" />, { role: Role.CONSUMER });
    const u = userEvent.setup();
    const draft = await screen.findByLabelText('Add a comment');
    await u.type(draft, 'still typing');

    await u.click((await screen.findAllByRole('button', { name: 'Reply' }))[0]!);
    await u.type(screen.getByLabelText('Write a reply'), 'a quick reply');
    await u.click(screen.getByRole('button', { name: 'Post reply' }));

    expect(await screen.findByText('a quick reply')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a comment')).toHaveValue('still typing');
    expect(within(document.body).queryByText('Loading comments…')).not.toBeInTheDocument();
  });

  it('shows comments in the order the API returns them and only groups replies under their parent', async () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 17, 10, m)).toISOString();
    const who = { id: 'u', name: 'Sam', role: Role.CONSUMER };
    const c = (id: string, parentId: string | null, createdAt: string, isOfficial = false) => ({
      id,
      reviewId: 'r-x',
      parentId,
      author: who,
      body: `body ${id}`,
      isOfficial,
      createdAt,
    });
    // Deliberately not oldest first: the API owns the order, the UI must not re-sort it
    vi.spyOn(commentsApi, 'list').mockResolvedValue([
      c('late', null, at(30)),
      c('early', null, at(1)),
      c('r-new', 'early', at(20)),
      c('r-old', 'early', at(2)),
    ]);
    renderWithProviders(<CommentThread reviewId="r-x" />);
    await screen.findByText('body late');
    const order = screen.getAllByText(/^body /).map((el) => el.textContent);
    expect(order).toEqual(['body late', 'body early', 'body r-new', 'body r-old']);
  });
});
