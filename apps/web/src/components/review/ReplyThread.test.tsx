import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@bingemate/shared';
import { repliesApi } from '../../api/reviews.js';
import { resetDb } from '../../mocks/db.js';
import { renderWithProviders } from '../../test/utils.js';
import { ReplyThread } from './ReplyThread.js';

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

const at = (m: number) => new Date(Date.UTC(2026, 9, 17, 10, m)).toISOString();
type Person = { id: string; name: string; role: Role };
const owner: Person = { id: 'studio', name: 'studio_north', role: Role.CREATOR };
const fan: Person = { id: 'fan', name: 'maya_r', role: Role.CONSUMER };
const reply = (id: string, author: Person, body: string, m: number) => ({
  id,
  reviewId: 'r-x',
  author,
  body,
  createdAt: at(m),
});
const replyButton = () => screen.getByRole('button', { name: /^Reply to review by / });

describe('ReplyThread', () => {
  it('lists the replies in the order the API returns them, as one flat list', async () => {
    // Deliberately not oldest first: the API owns the order, the UI must not re-sort it
    vi.spyOn(repliesApi, 'list').mockResolvedValue([
      reply('late', fan, 'body late', 30),
      reply('early', fan, 'body early', 1),
    ]);
    renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" />);
    await screen.findByText('body late');
    expect(screen.getAllByText(/^body /).map((el) => el.textContent)).toEqual([
      'body late',
      'body early',
    ]);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('list', { name: /./ })).not.toBeInTheDocument();
  });

  it('offers a single Reply button that names whose review it answers, and no comment box', async () => {
    renderWithProviders(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />, {
      role: Role.CONSUMER,
    });
    await screen.findByText('Great pacing in the second half.');
    expect(screen.getAllByRole('button', { name: /^Reply/ })).toHaveLength(1);
    expect(replyButton()).toHaveAccessibleName('Reply to review by maya_r');
    expect(screen.queryByLabelText('Write a reply')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/comment/i)).not.toBeInTheDocument();
  });

  it('opens the form on Reply with focus in the box, posts, closes, and returns focus', async () => {
    renderWithProviders(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />, {
      role: Role.CONSUMER,
    });
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Reply to review by / }));
    const box = screen.getByLabelText('Write a reply');
    expect(box).toHaveFocus();
    await u.type(box, 'A quick reply');
    await u.click(screen.getByRole('button', { name: 'Post reply' }));
    expect(await screen.findByText('A quick reply')).toBeInTheDocument();
    expect(screen.queryByLabelText('Write a reply')).not.toBeInTheDocument();
    expect(replyButton()).toHaveFocus();
  });

  it('Cancel closes the form without posting and returns focus to Reply', async () => {
    const create = vi.spyOn(repliesApi, 'create');
    renderWithProviders(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />, {
      role: Role.CONSUMER,
    });
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Reply to review by / }));
    await u.type(screen.getByLabelText('Write a reply'), 'never mind');
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Write a reply')).not.toBeInTheDocument();
    expect(replyButton()).toHaveFocus();
  });

  it('does not post an empty reply', async () => {
    const create = vi.spyOn(repliesApi, 'create');
    renderWithProviders(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />, {
      role: Role.CONSUMER,
    });
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /^Reply to review by / }));
    await u.type(screen.getByLabelText('Write a reply'), '   ');
    await u.click(screen.getByRole('button', { name: 'Post reply' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('shows nothing under a review with no replies for a visitor who cannot reply', async () => {
    renderWithProviders(<ReplyThread reviewId="r-mock-1-1" reviewAuthor="dev_k" />);
    await vi.waitFor(() => expect(screen.queryByText('Loading replies…')).not.toBeInTheDocument());
    expect(document.body.textContent).toBe('');
  });

  it('lets the author of the review reply under it like anyone else', async () => {
    renderWithProviders(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="test-user" />, {
      role: Role.CONSUMER,
    });
    expect(await screen.findByRole('button', { name: /^Reply to review by / })).toBeInTheDocument();
  });

  describe('Creator badge', () => {
    const thread = [reply('a', fan, 'From a fan', 1), reply('b', owner, 'From the owner', 2)];
    const badgeIn = (text: string) =>
      within(screen.getByText(text).parentElement as HTMLElement).queryByText('Creator');

    it('marks a reply by the creator of this title, in line with their name', async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue(thread);
      renderWithProviders(
        <ReplyThread reviewId="r-x" reviewAuthor="maya_r" titleOwnerId="studio" />,
      );
      await screen.findByText('From the owner');
      expect(badgeIn('From the owner')).toBeInTheDocument();
      expect(badgeIn('From a fan')).not.toBeInTheDocument();
    });

    it('does not mark the same account on a title it did not create', async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue(thread);
      renderWithProviders(
        <ReplyThread reviewId="r-x" reviewAuthor="maya_r" titleOwnerId="someone-else" />,
      );
      await screen.findByText('From the owner');
      expect(badgeIn('From the owner')).not.toBeInTheDocument();
    });

    it('does not mark anyone on a title with no creator, such as an imported one', async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue(thread);
      renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" titleOwnerId={null} />);
      await screen.findByText('From the owner');
      expect(screen.queryByText('Creator')).not.toBeInTheDocument();
    });
  });

  describe('admin', () => {
    it('can read and delete replies but sees no way to write one', async () => {
      renderWithProviders(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />, {
        role: Role.ADMIN,
      });
      expect(await screen.findByText('Great pacing in the second half.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Reply/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Delete reply by/ })).toHaveLength(4);
    });
  });
});
