import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@bingemate/shared';
import { ApiError } from '../../api/client.js';
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
    expect(replyButton()).toHaveAccessibleName('Reply to review by maya_r, 4 replies');
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
      await userEvent.setup().click(screen.getByRole('button', { name: /^View \d+ more replies/ }));
      expect(screen.getAllByRole('button', { name: /^Delete reply by/ })).toHaveLength(4);
      expect(screen.queryByRole('button', { name: /^Edit reply by/ })).not.toBeInTheDocument();
    });
  });
  describe('action row', () => {
    const mine = { id: 'test-user', name: 'sam_k', role: Role.CONSUMER } as Person;
    const own = reply('own', mine, 'my words', 1);

    it("shows Reply and the review's own actions together in one row", async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue([]);
      renderWithProviders(
        <ReplyThread
          reviewId="r-x"
          reviewAuthor="maya_r"
          actions={<button type="button">Edit review</button>}
        />,
        { role: Role.CONSUMER },
      );
      const row = (await screen.findByRole('button', { name: /^Reply to review by / }))
        .parentElement;
      expect(
        within(row as HTMLElement).getByRole('button', { name: 'Edit review' }),
      ).toBeInTheDocument();
    });

    it('still shows those actions to someone who cannot reply, such as an admin', async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue([]);
      renderWithProviders(
        <ReplyThread
          reviewId="r-x"
          reviewAuthor="maya_r"
          actions={<button type="button">Delete review</button>}
        />,
        { role: Role.ADMIN },
      );
      expect(await screen.findByRole('button', { name: 'Delete review' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Reply/ })).not.toBeInTheDocument();
    });

    it('shows the reply count beside Reply once there are replies', async () => {
      renderWithProviders(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />, {
        role: Role.CONSUMER,
      });
      expect(
        await screen.findByRole('button', { name: /^Reply to review by maya_r, 4 replies/ }),
      ).toHaveTextContent(/· 4/);
    });

    it('says "1 reply" for a single reply', async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue([reply('a', fan, 'only one', 1)]);
      renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" />, {
        role: Role.CONSUMER,
      });
      expect(await screen.findByRole('button', { name: /, 1 reply$/ })).toBeInTheDocument();
    });

    it('marks your own reply with You and gives it Edit and Delete', async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue([own, reply('a', fan, 'fan words', 2)]);
      renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" />, {
        role: Role.CONSUMER,
      });
      await screen.findByText('my words');
      const row = screen.getByText('my words').parentElement as HTMLElement;
      expect(within(row).getByText('You')).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Edit reply by sam_k' })).toBeInTheDocument();
      expect(
        within(row).getByRole('button', { name: 'Delete reply by sam_k' }),
      ).toBeInTheDocument();
      const other = screen.getByText('fan words').parentElement as HTMLElement;
      expect(within(other).queryByRole('button', { name: /^Edit reply/ })).not.toBeInTheDocument();
      expect(within(other).queryByText('You')).not.toBeInTheDocument();
    });

    it("does not offer Edit on another user's reply, even to an admin", async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue([reply('a', fan, 'fan words', 1)]);
      renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" />, {
        role: Role.ADMIN,
      });
      await screen.findByText('fan words');
      expect(screen.queryByRole('button', { name: /^Edit reply/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Delete reply by/ })).toBeInTheDocument();
    });
  });

  describe('editing a reply', () => {
    const mine = { id: 'test-user', name: 'sam_k', role: Role.CONSUMER } as Person;
    const setupOwn = async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue([reply('own', mine, 'my words', 1)]);
      const view = renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" />, {
        role: Role.CONSUMER,
      });
      const u = userEvent.setup();
      await u.click(await screen.findByRole('button', { name: 'Edit reply by sam_k' }));
      return { u, ...view };
    };

    it('swaps the text for a filled box with focus, Save and Cancel', async () => {
      await setupOwn();
      const box = screen.getByLabelText('Edit your reply');
      expect(box).toHaveValue('my words');
      expect(box).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('saves the new text, marks the reply as edited, and returns focus to Edit', async () => {
      const update = vi
        .spyOn(repliesApi, 'update')
        .mockResolvedValue(reply('own', mine, 'new words', 1));
      const { u } = await setupOwn();
      const box = screen.getByLabelText('Edit your reply');
      await u.clear(box);
      await u.type(box, 'new words');
      await u.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(update).toHaveBeenCalledWith('own', 'new words');
      expect(screen.queryByLabelText('Edit your reply')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit reply by sam_k' })).toHaveFocus();
    });

    it('Cancel keeps the original and returns focus to Edit', async () => {
      const update = vi.spyOn(repliesApi, 'update');
      const { u } = await setupOwn();
      await u.type(screen.getByLabelText('Edit your reply'), ' more');
      await u.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(update).not.toHaveBeenCalled();
      expect(screen.getByText('my words')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit reply by sam_k' })).toHaveFocus();
    });

    it('does not save an empty reply', async () => {
      const update = vi.spyOn(repliesApi, 'update');
      const { u } = await setupOwn();
      await u.clear(screen.getByLabelText('Edit your reply'));
      await u.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(update).not.toHaveBeenCalled();
    });

    it('keeps the box open with the server message when the save is refused', async () => {
      vi.spyOn(repliesApi, 'update').mockRejectedValue(new ApiError(403, 'Not yours'));
      const { u } = await setupOwn();
      await u.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Not yours');
      expect(screen.getByLabelText('Edit your reply')).toHaveValue('my words');
    });
  });

  describe('dates', () => {
    it('shows when each reply was written, and "edited" only on one that was changed', async () => {
      const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
      vi.spyOn(repliesApi, 'list').mockResolvedValue([
        { ...reply('a', fan, 'plain', 1), createdAt: old },
        { ...reply('b', fan, 'changed', 2), createdAt: old, editedAt: new Date().toISOString() },
      ]);
      renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" />);
      await screen.findByText('plain');
      const first = screen.getByText('plain').parentElement as HTMLElement;
      expect(within(first).getByText('2 days ago')).toBeInTheDocument();
      const second = screen.getByText('changed').parentElement as HTMLElement;
      expect(within(second).getByText(/2 days ago · edited/)).toBeInTheDocument();
    });
  });

  describe('long threads', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => reply(`m${i}`, fan, `reply number ${i + 1}`, i + 1));

    it('shows every reply of a short thread, with nothing to fold', async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue(many(3));
      renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" />);
      await screen.findByText('reply number 3');
      expect(screen.queryByRole('button', { name: /more replies/ })).not.toBeInTheDocument();
    });

    it('folds a longer thread to its first two replies and unfolds on request', async () => {
      vi.spyOn(repliesApi, 'list').mockResolvedValue(many(5));
      renderWithProviders(<ReplyThread reviewId="r-x" reviewAuthor="maya_r" />);
      const u = userEvent.setup();
      await screen.findByText('reply number 1');
      expect(screen.getByText('reply number 2')).toBeInTheDocument();
      expect(screen.queryByText('reply number 3')).not.toBeInTheDocument();
      const more = screen.getByRole('button', { name: 'View 3 more replies' });
      expect(more).toHaveAttribute('aria-expanded', 'false');
      await u.click(more);
      expect(screen.getByText('reply number 5')).toBeInTheDocument();
      await u.click(screen.getByRole('button', { name: 'Show fewer replies' }));
      expect(screen.queryByText('reply number 5')).not.toBeInTheDocument();
    });

    it('unfolds after you post, so your own reply is not hidden', async () => {
      renderWithProviders(<ReplyThread reviewId="r-mock-1-0" reviewAuthor="maya_r" />, {
        role: Role.CONSUMER,
      });
      const u = userEvent.setup();
      await u.click(await screen.findByRole('button', { name: /^Reply to review by / }));
      await u.type(screen.getByLabelText('Write a reply'), 'my late reply');
      await u.click(screen.getByRole('button', { name: 'Post reply' }));
      expect(await screen.findByText('my late reply')).toBeInTheDocument();
    });
  });
});
