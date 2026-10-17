import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import { ApiError } from '../../api/client.js';
import { creatorApi } from '../../api/creator.js';
import { MOCK_USER, db, resetDb } from '../../mocks/db.js';
import { renderWithProviders } from '../../test/utils.js';
import { CreatorDashboard } from './CreatorDashboard.js';
import { CreatorStats } from './CreatorStats.js';
import { SubmissionForm } from './SubmissionForm.js';

function renderCreator(route: string) {
  renderWithProviders(
    <Routes>
      <Route path="/creator" element={<CreatorDashboard />} />
      <Route path="/creator/new" element={<SubmissionForm />} />
      <Route path="/creator/:id/edit" element={<SubmissionForm />} />
      <Route path="/creator/stats" element={<CreatorStats />} />
    </Routes>,
    { route, role: Role.CREATOR },
  );
  return userEvent.setup();
}

const title = (id: string) => db.titles.find((t) => t.id === id)!;

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('CreatorDashboard', () => {
  it('lists own submissions with their status', async () => {
    renderCreator('/creator');
    const approved = await screen.findByRole('row', { name: new RegExp(title('mock-24').name) });
    expect(within(approved).getByText('Approved')).toBeInTheDocument();
    const pending = screen.getByRole('row', { name: new RegExp(title('mock-25').name) });
    expect(within(pending).getByText('Pending')).toBeInTheDocument();
  });

  it('a REJECTED row shows its reason', async () => {
    renderCreator('/creator');
    const row = await screen.findByRole('row', { name: new RegExp(title('mock-26').name) });
    expect(within(row).getByText('Rejected')).toBeInTheDocument();
    expect(within(row).getByText('Poster missing')).toBeInTheDocument();
  });

  it("does not list other creators' titles", async () => {
    renderCreator('/creator');
    await screen.findByRole('row', { name: new RegExp(title('mock-24').name) });
    expect(screen.queryByText(title('mock-28').name)).not.toBeInTheDocument();
  });

  it('empty submissions shows an empty state', async () => {
    for (const t of db.titles) if (t.createdBy === MOCK_USER) t.createdBy = undefined;
    renderCreator('/creator');
    expect(await screen.findByText('No submissions yet')).toBeInTheDocument();
  });
});

describe('SubmissionForm (new)', () => {
  it('a new submission is listed as PENDING', async () => {
    const u = renderCreator('/creator/new');
    await u.type(screen.getByLabelText('Title'), 'Brand New Title');
    await u.selectOptions(screen.getByLabelText('Type'), MediaType.BOOK);
    await u.type(screen.getByLabelText('Synopsis'), 'A short pitch.');
    await u.click(screen.getByRole('button', { name: 'Submit for approval' }));
    const row = await screen.findByRole('row', { name: /Brand New Title/ });
    expect(within(row).getByText('Pending')).toBeInTheDocument();
  });

  it('requires a title and does not call the API without one', async () => {
    const submit = vi.spyOn(creatorApi, 'submit');
    const u = renderCreator('/creator/new');
    await u.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/title/i);
  });

  it('shows the server error and stays on the form when saving fails', async () => {
    vi.spyOn(creatorApi, 'submit').mockRejectedValue(new ApiError(500, 'Server exploded'));
    const u = renderCreator('/creator/new');
    await u.type(screen.getByLabelText('Title'), 'Doomed');
    await u.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded');
    expect(screen.getByLabelText('Title')).toHaveValue('Doomed');
  });
});

describe('SubmissionForm (edit)', () => {
  it('editing an APPROVED title warns first and saves nothing until confirmed', async () => {
    const update = vi.spyOn(creatorApi, 'update');
    const t = title('mock-24');
    const u = renderCreator('/creator/mock-24/edit');
    await screen.findByDisplayValue(t.name);
    expect(screen.getByText(/sent back for approval/i)).toBeInTheDocument();

    const name = screen.getByLabelText('Title');
    await u.clear(name);
    await u.type(name, 'Renamed');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /re-submit/i })).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(update).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    await u.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save and re-submit' }),
    );
    const row = await screen.findByRole('row', { name: /Renamed/ });
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('mock-24', expect.objectContaining({ name: 'Renamed' }));
    expect(within(row).getByText('Pending')).toBeInTheDocument();
  });

  it('editing a PENDING title saves straight away with no dialog', async () => {
    const update = vi.spyOn(creatorApi, 'update');
    const u = renderCreator('/creator/mock-25/edit');
    const name = await screen.findByDisplayValue(title('mock-25').name);
    await u.type(name, ' 2');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('row', { name: /Iron Garden 2/ });
    expect(update).toHaveBeenCalledOnce();
  });

  it('shows "Submission not found" for an id the creator does not own', async () => {
    renderCreator('/creator/mock-28/edit');
    expect(await screen.findByText('Submission not found')).toBeInTheDocument();
  });
});

describe('CreatorStats', () => {
  it('shows avg rating, review count and list adds per approved title', async () => {
    const [stat] = await creatorApi.stats();
    renderCreator('/creator/stats');
    const row = await screen.findByRole('row', { name: new RegExp(stat!.name) });
    expect(within(row).getByText(stat!.avgRating.toFixed(1))).toBeInTheDocument();
    expect(within(row).getByText(String(stat!.reviewCount))).toBeInTheDocument();
    expect(within(row).getByText(String(stat!.listAdds))).toBeInTheDocument();
  });

  it('shows an empty state when no title is approved yet', async () => {
    for (const t of db.titles) if (t.createdBy === MOCK_USER) t.status = TitleStatus.PENDING;
    renderCreator('/creator/stats');
    expect(await screen.findByText('No stats yet')).toBeInTheDocument();
  });
});
