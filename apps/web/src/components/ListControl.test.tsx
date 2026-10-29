import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListStatus, Role } from '@bingemate/shared';
import { ApiError } from '../api/client.js';
import { listsApi } from '../api/lists.js';
import { resetDb } from '../mocks/db.js';
import { choose, renderWithProviders } from '../test/utils.js';
import { ListControl } from './ListControl.js';

// mock-1 is on the seeded list (Completed); mock-20 is not
function setup(titleId: string, signedIn = true) {
  renderWithProviders(<ListControl titleId={titleId} titleName="Some Title" />, {
    role: signedIn ? Role.CONSUMER : undefined,
  });
  return userEvent.setup();
}

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('ListControl', () => {
  it('asks anonymous visitors to sign in and does not call the list API', () => {
    const forTitle = vi.spyOn(listsApi, 'forTitle');
    setup('mock-20', false);
    expect(screen.getByRole('link', { name: 'Sign in to add to list' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(forTitle).not.toHaveBeenCalled();
  });

  it('offers to add a title that is not on the list, and saves the chosen status', async () => {
    const add = vi.spyOn(listsApi, 'add');
    const u = setup('mock-20');
    const control = await screen.findByRole('combobox', { name: 'Add to list' });
    expect(control).toHaveTextContent('Add to list');
    await choose(u, control, 'Plan to');
    expect(add).toHaveBeenCalledWith('mock-20', ListStatus.PLAN_TO);
    expect(
      await screen.findByRole('combobox', { name: 'List status for Some Title' }),
    ).toHaveTextContent('Plan to');
  });

  it('shows the current status of a listed title and changes it', async () => {
    const setStatus = vi.spyOn(listsApi, 'setStatus');
    const u = setup('mock-1');
    const control = await screen.findByRole('combobox', { name: 'List status for Some Title' });
    expect(control).toHaveTextContent('Completed');
    await choose(u, control, 'In progress');
    expect(setStatus).toHaveBeenCalledWith('l-1', ListStatus.IN_PROGRESS);
    expect(control).toHaveTextContent('In progress');
  });

  it('removes a listed title from the list', async () => {
    const remove = vi.spyOn(listsApi, 'remove');
    const u = setup('mock-1');
    await choose(
      u,
      await screen.findByRole('combobox', { name: 'List status for Some Title' }),
      'Remove from list',
    );
    expect(remove).toHaveBeenCalledWith('l-1');
    expect(await screen.findByRole('combobox', { name: 'Add to list' })).toHaveTextContent(
      'Add to list',
    );
  });

  it('keeps the old status and shows an error when the change fails', async () => {
    vi.spyOn(listsApi, 'setStatus').mockRejectedValue(new ApiError(500, 'boom'));
    const u = setup('mock-1');
    const control = await screen.findByRole('combobox', { name: 'List status for Some Title' });
    await choose(u, control, 'Plan to');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not update your list/);
    expect(control).toHaveTextContent('Completed');
  });

  it('shows an error when the list cannot be loaded', async () => {
    vi.spyOn(listsApi, 'forTitle').mockRejectedValue(new ApiError(500, 'boom'));
    setup('mock-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load your list/);
  });
});
