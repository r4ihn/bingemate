import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@bingemate/shared';
import { resetDb } from '../../mocks/db.js';
import { renderWithProviders } from '../../test/utils.js';
import { CommentThread } from './CommentThread.js';

beforeEach(() => resetDb());

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
});
