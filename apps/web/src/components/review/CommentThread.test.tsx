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
    const c = (id: string, parentId: string | null, createdAt: string) => ({
      id,
      reviewId: 'r-x',
      parentId,
      author: who,
      body: `body ${id}`,
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
  describe('Creator badge', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 17, 10, m)).toISOString();
    const owner = { id: 'studio', name: 'studio_north', role: Role.CREATOR };
    const fan = { id: 'fan', name: 'maya_r', role: Role.CONSUMER };
    const thread = [
      {
        id: 'a',
        reviewId: 'r-x',
        parentId: null,
        author: fan,
        body: 'From a fan',
        createdAt: at(1),
      },
      {
        id: 'b',
        reviewId: 'r-x',
        parentId: 'a',
        author: owner,
        body: 'From the owner',
        createdAt: at(2),
      },
    ];
    const badgeIn = (text: string) =>
      within(screen.getByText(text).parentElement as HTMLElement).queryByText('Creator');

    it('marks a comment by the creator of this title, in line with their name', async () => {
      vi.spyOn(commentsApi, 'list').mockResolvedValue(thread);
      renderWithProviders(<CommentThread reviewId="r-x" titleOwnerId="studio" />);
      await screen.findByText('From the owner');
      expect(badgeIn('From the owner')).toBeInTheDocument();
      expect(badgeIn('From a fan')).not.toBeInTheDocument();
    });

    it('does not mark the same account on a title it did not create', async () => {
      vi.spyOn(commentsApi, 'list').mockResolvedValue(thread);
      renderWithProviders(<CommentThread reviewId="r-x" titleOwnerId="someone-else" />);
      await screen.findByText('From the owner');
      expect(badgeIn('From the owner')).not.toBeInTheDocument();
    });

    it('does not mark anyone on a title with no creator, such as an imported one', async () => {
      vi.spyOn(commentsApi, 'list').mockResolvedValue(thread);
      renderWithProviders(<CommentThread reviewId="r-x" titleOwnerId={null} />);
      await screen.findByText('From the owner');
      expect(screen.queryByText('Creator')).not.toBeInTheDocument();
    });

    it('gives the creator the same comment form as everyone else, with no separate reply', async () => {
      renderWithProviders(<CommentThread reviewId="r-mock-2-0" titleOwnerId="test-user" />, {
        role: Role.CREATOR,
      });
      expect(await screen.findByLabelText('Add a comment')).toBeInTheDocument();
      expect(screen.queryByText(/official/i)).not.toBeInTheDocument();
    });
  });

  describe('admin', () => {
    it('can read and delete comments but sees no way to write one', async () => {
      renderWithProviders(<CommentThread reviewId="r-mock-1-0" />, { role: Role.ADMIN });
      expect(await screen.findByText('Great pacing in the second half.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Delete comment by/ }).length).toBeGreaterThan(
        0,
      );
    });
  });
});
