import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import { ApiError } from '../../api/client.js';
import { creatorApi } from '../../api/creator.js';
import * as image from '../../image.js';
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

vi.mock('../../image.js', async (original) => ({
  ...(await original<typeof image>()),
  shrinkPoster: vi.fn(),
}));

beforeEach(() => {
  resetDb();
  vi.mocked(image.shrinkPoster).mockResolvedValue(new Blob(['shrunk'], { type: 'image/jpeg' }));
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

const picture = (type = 'image/png', name = 'poster.png') => new File(['pixels'], name, { type });
/** A real 9 MB file would slow the suite; the size is all the check looks at. */
const hugePicture = () => {
  const file = picture();
  Object.defineProperty(file, 'size', { value: 9 * 1024 * 1024 });
  return file;
};

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

describe('SubmissionForm (poster image)', () => {
  const fillTitle = async (user: ReturnType<typeof userEvent.setup>) =>
    user.type(screen.getByLabelText('Title'), 'Night Train');

  it('shows a preview of the chosen image and stores it on the new title', async () => {
    const user = renderCreator('/creator/new');
    await fillTitle(user);

    await user.upload(await screen.findByLabelText(/Poster image/), picture());

    expect(
      await screen.findByRole('img', { name: 'Preview of the chosen poster' }),
    ).toHaveAttribute('src', 'blob:preview');
    expect(image.shrinkPoster).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await screen.findByText('Your submissions', { exact: false });
    const saved = db.titles.find((t) => t.name === 'Night Train')!;
    expect(saved.posterUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('submits with no image at all when none was chosen', async () => {
    const submit = vi.spyOn(creatorApi, 'submit');
    const user = renderCreator('/creator/new');
    await fillTitle(user);

    await user.click(await screen.findByRole('button', { name: 'Submit for approval' }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0]).not.toHaveProperty('poster');
    expect(submit.mock.calls[0]?.[0]).not.toHaveProperty('removePoster');
  });

  it.each([
    ['a GIF', picture('image/gif', 'loop.gif'), 'Choose a JPEG, PNG or WebP image'],
    ['a file over 8 MB', hugePicture(), 'Choose an image under 8 MB'],
  ])('refuses %s with a message and shows no preview', async (_label, file, message) => {
    renderCreator('/creator/new');
    // fireEvent skips the browser's own accept filter, which is what a determined user can do
    fireEvent.change(await screen.findByLabelText(/Poster image/), { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('img', { name: /poster/i })).not.toBeInTheDocument();
    expect(image.shrinkPoster).not.toHaveBeenCalled();
  });

  it('tells the creator when the image cannot be read, and still lets them submit without it', async () => {
    vi.mocked(image.shrinkPoster).mockRejectedValue(new Error('That image could not be read'));
    const user = renderCreator('/creator/new');
    await fillTitle(user);

    await user.upload(await screen.findByLabelText(/Poster image/), picture());

    expect(await screen.findByRole('alert')).toHaveTextContent('That image could not be read');
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await screen.findByText('Your submissions', { exact: false });
    expect(db.titles.find((t) => t.name === 'Night Train')?.posterUrl).toBeUndefined();
  });

  it('waits for the image to be prepared before it submits', async () => {
    let finish: (b: Blob) => void = () => undefined;
    vi.mocked(image.shrinkPoster).mockReturnValue(new Promise((done) => (finish = done)));
    const submit = vi.spyOn(creatorApi, 'submit');
    const user = renderCreator('/creator/new');
    await fillTitle(user);

    await user.upload(await screen.findByLabelText(/Poster image/), picture());

    expect(await screen.findByText('Preparing the image…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    finish(new Blob(['shrunk'], { type: 'image/jpeg' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeEnabled(),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('drops an image still being prepared when the form closes', async () => {
    let finish: (b: Blob) => void = () => undefined;
    vi.mocked(image.shrinkPoster).mockReturnValue(new Promise((done) => (finish = done)));
    const user = renderCreator('/creator/new');
    await user.upload(await screen.findByLabelText(/Poster image/), picture());
    await screen.findByText('Preparing the image…');

    cleanup(); // the creator leaves the page
    finish(new Blob(['shrunk'], { type: 'image/jpeg' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // no local address made after the form is gone, so nothing is left unreleased
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('removes a chosen image before it is saved', async () => {
    const user = renderCreator('/creator/new');
    await fillTitle(user);
    await user.upload(await screen.findByLabelText(/Poster image/), picture());
    await screen.findByRole('img', { name: 'Preview of the chosen poster' });

    await user.click(screen.getByRole('button', { name: 'Remove image' }));

    expect(screen.queryByRole('img', { name: /poster/i })).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await screen.findByText('Your submissions', { exact: false });
    expect(db.titles.find((t) => t.name === 'Night Train')?.posterUrl).toBeUndefined();
  });

  it('shows the current image when editing and can replace it', async () => {
    title('mock-25').posterUrl = 'data:image/png;base64,AAAA';
    const user = renderCreator('/creator/mock-25/edit');

    expect(await screen.findByRole('img', { name: 'Current poster' })).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA',
    );
    await user.upload(screen.getByLabelText(/Poster image/), picture());
    expect(
      await screen.findByRole('img', { name: 'Preview of the chosen poster' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Your submissions', { exact: false });
    expect(title('mock-25').posterUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('removing a replacement keeps the current image; a second press removes that', async () => {
    title('mock-25').posterUrl = 'data:image/png;base64,AAAA';
    const update = vi.spyOn(creatorApi, 'update');
    const user = renderCreator('/creator/mock-25/edit');
    await screen.findByRole('img', { name: 'Current poster' });
    await user.upload(screen.getByLabelText(/Poster image/), picture());
    await screen.findByRole('img', { name: 'Preview of the chosen poster' });

    await user.click(screen.getByRole('button', { name: 'Remove image' }));

    expect(screen.getByRole('img', { name: 'Current poster' })).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Preview of the chosen poster' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Your submissions', { exact: false });
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('removePoster');
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('poster');
    expect(title('mock-25').posterUrl).toBe('data:image/png;base64,AAAA');
  });

  it('keeps the last image picked when an earlier one finishes preparing later', async () => {
    const blobA = new Blob(['A'], { type: 'image/jpeg' });
    const blobB = new Blob(['B'], { type: 'image/jpeg' });
    let finishA: (b: Blob) => void = () => undefined;
    let finishB: (b: Blob) => void = () => undefined;
    vi.mocked(image.shrinkPoster)
      .mockReturnValueOnce(new Promise((done) => (finishA = done)))
      .mockReturnValueOnce(new Promise((done) => (finishB = done)));
    const submit = vi.spyOn(creatorApi, 'submit');
    const user = renderCreator('/creator/new');
    await fillTitle(user);
    const input = await screen.findByLabelText(/Poster image/);

    await user.upload(input, picture('image/png', 'big.png'));
    await user.upload(input, picture('image/png', 'small.png'));
    finishB(blobB);
    await screen.findByRole('img', { name: 'Preview of the chosen poster' });
    finishA(blobA); // the slower, older pick arrives last
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blobB);
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0].poster).toBe(blobB);
  });

  it('removing while a replacement is still being prepared cancels it and keeps the current image', async () => {
    title('mock-25').posterUrl = 'data:image/png;base64,AAAA';
    let finish: (b: Blob) => void = () => undefined;
    vi.mocked(image.shrinkPoster).mockReturnValueOnce(new Promise((done) => (finish = done)));
    const update = vi.spyOn(creatorApi, 'update');
    const user = renderCreator('/creator/mock-25/edit');
    await screen.findByRole('img', { name: 'Current poster' });
    await user.upload(screen.getByLabelText(/Poster image/), picture());
    await screen.findByText('Preparing the image…');

    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    finish(new Blob(['late'], { type: 'image/jpeg' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByText('Preparing the image…')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Preview of the chosen poster' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Current poster' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Your submissions', { exact: false });
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('poster');
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('removePoster');
  });

  it('can take the current image away when editing', async () => {
    title('mock-25').posterUrl = 'data:image/png;base64,AAAA';
    const update = vi.spyOn(creatorApi, 'update');
    const user = renderCreator('/creator/mock-25/edit');
    await screen.findByRole('img', { name: 'Current poster' });

    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.queryByRole('img', { name: /poster/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Your submissions', { exact: false });
    expect(update.mock.calls[0]?.[1]).toMatchObject({ removePoster: true });
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('poster');
    expect(title('mock-25').posterUrl).toBeUndefined();
  });

  it('leaves the current image alone when editing something else', async () => {
    title('mock-25').posterUrl = 'data:image/png;base64,AAAA';
    const user = renderCreator('/creator/mock-25/edit');
    await screen.findByRole('img', { name: 'Current poster' });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Your submissions', { exact: false });
    expect(title('mock-25').posterUrl).toBe('data:image/png;base64,AAAA');
  });

  it('names the picker in a way a screen reader can use', async () => {
    renderCreator('/creator/new');

    const picker = await screen.findByLabelText('Poster image (optional)');
    expect(picker).toHaveAttribute('type', 'file');
    expect(picker).toHaveAccessibleDescription(/JPEG, PNG or WebP/);
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
