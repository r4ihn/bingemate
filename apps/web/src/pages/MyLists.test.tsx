import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListStatus, MediaType, Role } from '@bingemate/shared';
import { ApiError } from '../api/client.js';
import { listsApi } from '../api/lists.js';
import { db, resetDb } from '../mocks/db.js';
import { renderWithProviders } from '../test/utils.js';
import { MyLists } from './MyLists.js';

function setup() {
  renderWithProviders(<MyLists />, { role: Role.CONSUMER, route: '/me/lists' });
  return userEvent.setup();
}

const firstStatusSelect = () => screen.getAllByRole('combobox')[0] as HTMLSelectElement;

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('MyLists', () => {
  it('starts on Completed and shows its entries', async () => {
    const list = vi.spyOn(listsApi, 'list');
    setup();
    expect(await screen.findByRole('link', { name: /Last Light/ })).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({
      status: ListStatus.COMPLETED,
      mediaType: undefined,
      page: 1,
    });
    expect(screen.getByRole('button', { name: 'Completed' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('switching tab requests that status', async () => {
    const list = vi.spyOn(listsApi, 'list');
    const u = setup();
    await screen.findByRole('link', { name: /Last Light/ });
    await u.click(screen.getByRole('button', { name: 'In progress' }));
    expect(list).toHaveBeenLastCalledWith({
      status: ListStatus.IN_PROGRESS,
      mediaType: undefined,
      page: 1,
    });
    expect(await screen.findByRole('link', { name: /Last Light: Part Two/ })).toBeInTheDocument();
  });

  it('the media filter requests that media type', async () => {
    const list = vi.spyOn(listsApi, 'list');
    const u = setup();
    await screen.findByRole('link', { name: /Last Light/ });
    await u.click(screen.getByRole('button', { name: 'Books' }));
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ mediaType: MediaType.BOOK, page: 1 }),
    );
  });

  it('an empty tab shows an empty state', async () => {
    db.lists = [];
    setup();
    expect(await screen.findByText(/Nothing in/)).toBeInTheDocument();
  });

  it('shows an error with Retry when the list fails to load', async () => {
    vi.spyOn(listsApi, 'list').mockRejectedValueOnce(new ApiError(500, 'boom'));
    const u = setup();
    await u.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: /Last Light/ })).toBeInTheDocument();
  });

  it('moving an entry hides it from the tab straight away and saves the new status', async () => {
    const setStatus = vi.spyOn(listsApi, 'setStatus');
    const u = setup();
    await screen.findByRole('link', { name: /Last Light/ });
    await u.selectOptions(firstStatusSelect(), ListStatus.IN_PROGRESS);
    expect(screen.queryByRole('link', { name: /^2016/ })).not.toBeInTheDocument();
    expect(setStatus).toHaveBeenCalledWith('l-1', ListStatus.IN_PROGRESS);
  });

  it('a status change rolls back and shows an error when the API rejects', async () => {
    let reject!: (e: unknown) => void;
    vi.spyOn(listsApi, 'setStatus').mockImplementation(() => new Promise((_, r) => (reject = r)));
    const u = setup();
    await screen.findByRole('link', { name: /Last Light/ });
    const label = firstStatusSelect().getAttribute('aria-label') as string;
    await u.selectOptions(firstStatusSelect(), ListStatus.IN_PROGRESS);
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument(); // optimistic: gone at once

    reject(new ApiError(500, 'boom'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not move/);
    expect(screen.getByLabelText(label)).toBeInTheDocument(); // rolled back
  });

  it('remove asks for confirmation first, and Cancel keeps the entry', async () => {
    const remove = vi.spyOn(listsApi, 'remove');
    const u = setup();
    await screen.findByRole('link', { name: /Last Light/ });
    await u.click(screen.getAllByRole('button', { name: /^Remove/ })[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Remove from list?')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Last Light/ })).toBeInTheDocument();
  });

  it('confirming remove deletes the entry once', async () => {
    const remove = vi.spyOn(listsApi, 'remove');
    const u = setup();
    await screen.findByRole('link', { name: /Last Light/ });
    await u.click(screen.getAllByRole('button', { name: /^Remove/ })[0] as HTMLElement);
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove).toHaveBeenCalledWith('l-1');
    await vi.waitFor(() =>
      expect(screen.queryByRole('link', { name: /^2016/ })).not.toBeInTheDocument(),
    );
  });
});
