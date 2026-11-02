import { MediaType, TitleStatus } from '@bingemate/shared';
import { MOCK_USER, db, getMockActor, newId } from '../mocks/db.js';
import type { CreatorStat, Submission, SubmissionInput } from '../types/creator.js';
import { ApiError } from './client.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

// The seeded demo titles belong to MOCK_USER; every creator sees them alongside their own submissions
const own = () =>
  db.titles.filter((t) => t.createdBy === getMockActor().id || t.createdBy === MOCK_USER);
/** The mock keeps an uploaded image as a data URL; the real API serves it from /titles/:id/poster. */
const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const toSubmission = (t: (typeof db.titles)[number]): Submission => ({
  title: t,
  rejectionReason: t.rejectionReason,
});

export const creatorApi = {
  async submissions(): Promise<Submission[]> {
    if (!useMock) notWired('creator endpoints (JW)');
    await delay();
    return clone(own().map(toSubmission));
  },

  /** Real API: POST the title, then PUT the image as the raw file to /titles/:id/poster. */
  async submit(input: SubmissionInput): Promise<Submission> {
    if (!useMock) notWired('creator endpoints (JW)');
    await delay();
    const posterUrl = input.poster ? await toDataUrl(input.poster) : undefined;
    const title = {
      id: newId('mock'),
      name: input.name,
      mediaType: input.mediaType ?? MediaType.MOVIE,
      status: TitleStatus.PENDING,
      avgRating: 0,
      reviewCount: 0,
      synopsis: input.synopsis,
      posterUrl,
      countries: [],
      studio: '',
      runtime: '',
      hue: 200,
      createdBy: getMockActor().id,
    };
    db.titles.push(title);
    return clone(toSubmission(title));
  },

  /** Editing an APPROVED title sends it back to PENDING (TASKS.md section 0); editing a REJECTED one resubmits it. */
  async update(id: string, input: Partial<SubmissionInput>): Promise<Submission> {
    if (!useMock) notWired('creator endpoints (JW)');
    await delay();
    const title = own().find((t) => t.id === id);
    if (!title) throw new ApiError(404, 'Title not found');
    const { poster, removePoster, ...fields } = input;
    // A key that is present but undefined (an unset form field) must not wipe the stored value
    Object.assign(
      title,
      Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
    );
    if (poster) title.posterUrl = await toDataUrl(poster);
    else if (removePoster) title.posterUrl = undefined;
    if (title.status !== TitleStatus.PENDING) title.status = TitleStatus.PENDING;
    title.rejectionReason = undefined;
    return clone(toSubmission(title));
  },

  async stats(): Promise<CreatorStat[]> {
    if (!useMock) notWired('/creator/stats (SJ)');
    await delay();
    return own()
      .filter((t) => t.status === TitleStatus.APPROVED)
      .map((t) => ({
        titleId: t.id,
        name: t.name,
        avgRating: t.avgRating,
        reviewCount: t.reviewCount,
        listAdds: (t.reviewCount * 3) % 41,
      }));
  },
};
