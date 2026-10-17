import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Role, TitleStatus } from '@bingemate/shared';
import { adminApi } from '../../api/admin.js';
import { ApiError } from '../../api/client.js';
import { db, resetDb } from '../../mocks/db.js';
import { renderWithProviders } from '../../test/utils.js';
import { AdminDashboard } from './AdminDashboard.js';
import { ApprovalQueue } from './ApprovalQueue.js';
import { Moderation } from './Moderation.js';
import { UsersTable } from './UsersTable.js';

function renderAdmin(route: string) {
  renderWithProviders(
    <Routes>
      <Route path="/admin" element={<AdminDashboard />}>
        <Route path="users" element={<UsersTable />} />
        <Route path="queue" element={<ApprovalQueue />} />
        <Route path="moderation" element={<Moderation />} />
      </Route>
    </Routes>,
    { route, role: Role.ADMIN },
  );
  return userEvent.setup();
}

const title = (id: string) => db.titles.find((t) => t.id === id)!;

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('AdminDashboard', () => {
  it('links to the three admin views', () => {
    renderAdmin('/admin/queue');
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: 'Approval queue' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Moderation' })).toBeInTheDocument();
  });
});

describe('ApprovalQueue', () => {
  it('lists the pending titles only', async () => {
    renderAdmin('/admin/queue');
    const cell = (id: string) => ({ name: title(id).name });
    expect(await screen.findByRole('cell', cell('mock-25'))).toBeInTheDocument();
    expect(screen.getByRole('cell', cell('mock-28'))).toBeInTheDocument();
    expect(screen.queryByRole('cell', cell('mock-24'))).not.toBeInTheDocument(); // approved
    expect(screen.queryByRole('cell', cell('mock-26'))).not.toBeInTheDocument(); // rejected
  });

  it('approve moves the title out of the queue', async () => {
    const u = renderAdmin('/admin/queue');
    const name = title('mock-25').name;
    await u.click(await screen.findByRole('button', { name: `Approve ${name}` }));
    await vi.waitFor(() => expect(screen.queryByRole('cell', { name })).not.toBeInTheDocument());
    expect(title('mock-25').status).toBe(TitleStatus.APPROVED);
  });

  it('reject sends the reason', async () => {
    const setStatus = vi.spyOn(adminApi, 'setTitleStatus');
    const u = renderAdmin('/admin/queue');
    const name = title('mock-25').name;
    await u.type(await screen.findByLabelText(`Reason for ${name}`), 'Poster missing');
    await u.click(screen.getByRole('button', { name: `Reject ${name}` }));
    await vi.waitFor(() => expect(screen.queryByRole('cell', { name })).not.toBeInTheDocument());
    expect(setStatus).toHaveBeenCalledWith('mock-25', TitleStatus.REJECTED, 'Poster missing');
    expect(title('mock-25').rejectionReason).toBe('Poster missing');
  });

  it('reject without a reason sends no reason', async () => {
    const setStatus = vi.spyOn(adminApi, 'setTitleStatus');
    const u = renderAdmin('/admin/queue');
    await u.click(await screen.findByRole('button', { name: `Reject ${title('mock-25').name}` }));
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalled());
    expect(setStatus).toHaveBeenCalledWith('mock-25', TitleStatus.REJECTED, undefined);
  });

  it('an empty queue shows an empty state', async () => {
    for (const t of db.titles)
      if (t.status === TitleStatus.PENDING) t.status = TitleStatus.APPROVED;
    renderAdmin('/admin/queue');
    expect(await screen.findByText('Queue is empty')).toBeInTheDocument();
  });

  it('double click on Approve sends one request', async () => {
    const setStatus = vi
      .spyOn(adminApi, 'setTitleStatus')
      .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const u = renderAdmin('/admin/queue');
    await u.dblClick(
      await screen.findByRole('button', { name: `Approve ${title('mock-25').name}` }),
    );
    expect(setStatus).toHaveBeenCalledTimes(1);
  });

  it('a failed approve shows an error and keeps the title in the queue', async () => {
    vi.spyOn(adminApi, 'setTitleStatus').mockRejectedValue(new ApiError(500, 'boom'));
    const u = renderAdmin('/admin/queue');
    const name = title('mock-25').name;
    await u.click(await screen.findByRole('button', { name: `Approve ${name}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not/);
    expect(screen.getByRole('cell', { name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Approve ${name}` })).toBeEnabled();
  });
});

describe('UsersTable', () => {
  it('lists users and pages through them', async () => {
    const u = renderAdmin('/admin/users');
    expect(await screen.findByText('user1@mock.dev')).toBeInTheDocument();
    expect(screen.queryByText('user11@mock.dev')).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('user11@mock.dev')).toBeInTheDocument();
  });

  it('changing a role saves it', async () => {
    const setRole = vi.spyOn(adminApi, 'setRole');
    const u = renderAdmin('/admin/users');
    await u.selectOptions(await screen.findByLabelText('Role for user3@mock.dev'), Role.CREATOR);
    await vi.waitFor(() => expect(setRole).toHaveBeenCalledWith('user-3', Role.CREATOR));
    expect(db.users.find((x) => x.id === 'user-3')?.role).toBe(Role.CREATOR);
  });

  it('a failed role change rolls back and shows an error', async () => {
    vi.spyOn(adminApi, 'setRole').mockRejectedValue(new ApiError(500, 'boom'));
    const u = renderAdmin('/admin/users');
    const select = await screen.findByLabelText('Role for user3@mock.dev');
    await u.selectOptions(select, Role.CREATOR);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not/);
    expect(screen.getByLabelText('Role for user3@mock.dev')).toHaveValue(Role.CONSUMER);
  });
});

describe('Moderation', () => {
  it('deleting a review needs confirmation, and Cancel keeps it', async () => {
    const remove = vi.spyOn(adminApi, 'removeReview');
    const u = renderAdmin('/admin/moderation');
    await u.click((await screen.findAllByRole('button', { name: /^Delete/ }))[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete review?')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();
  });

  it('confirming delete removes the review once', async () => {
    const remove = vi.spyOn(adminApi, 'removeReview');
    const u = renderAdmin('/admin/moderation');
    await u.click((await screen.findAllByRole('button', { name: /^Delete/ }))[0] as HTMLElement);
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(db.reviews.some((r) => r.id === remove.mock.calls[0]?.[0])).toBe(false),
    );
  });

  it('an empty review list shows an empty state', async () => {
    db.reviews = [];
    renderAdmin('/admin/moderation');
    expect(await screen.findByText('No reviews to moderate')).toBeInTheDocument();
  });
});

describe('Admin regressions from the final review', () => {
  it('promoting to Admin asks first; Cancel keeps the old role and sends nothing', async () => {
    const setRole = vi.spyOn(adminApi, 'setRole');
    const u = renderAdmin('/admin/users');
    const select = await screen.findByLabelText('Role for user3@mock.dev');
    await u.selectOptions(select, Role.ADMIN);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /admin/i })).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(setRole).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Role for user3@mock.dev')).toHaveValue(Role.CONSUMER);
  });

  it('confirming promotion to Admin saves it', async () => {
    const u = renderAdmin('/admin/users');
    await u.selectOptions(await screen.findByLabelText('Role for user3@mock.dev'), Role.ADMIN);
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make admin' }));
    await vi.waitFor(() => expect(db.users.find((x) => x.id === 'user-3')?.role).toBe(Role.ADMIN));
  });

  it('an earlier failed role change does not undo a later successful one', async () => {
    let rejectFirst!: (e: unknown) => void;
    vi.spyOn(adminApi, 'setRole').mockImplementationOnce(
      () => new Promise((_, reject) => (rejectFirst = reject)),
    ); // later calls use the real mock implementation
    const u = renderAdmin('/admin/users');
    const select = await screen.findByLabelText('Role for user3@mock.dev');
    await u.selectOptions(select, Role.CREATOR); // request A, still pending
    await u.selectOptions(select, Role.ADMIN); // request B
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make admin' }));
    await vi.waitFor(() => expect(db.users.find((x) => x.id === 'user-3')?.role).toBe(Role.ADMIN));

    rejectFirst(new ApiError(500, 'boom'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not/);
    expect(screen.getByLabelText('Role for user3@mock.dev')).toHaveValue(Role.ADMIN);
  });

  it('deleting the last reviews on page 2 steps back to page 1, not an empty state', async () => {
    const u = renderAdmin('/admin/moderation');
    await screen.findAllByRole('button', { name: /^Delete/ });
    await u.click(screen.getByRole('button', { name: 'Next' }));
    for (let i = 1; i <= 3; i++) {
      const btn = (await screen.findAllByRole('button', { name: /^Delete/ }))[0] as HTMLElement;
      await u.click(btn);
      await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await vi.waitFor(() => expect(db.reviews.length).toBe(13 - i));
    }
    await vi.waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Delete/ })).toHaveLength(10),
    );
    expect(screen.queryByText('No reviews to moderate')).not.toBeInTheDocument();
  });
});
