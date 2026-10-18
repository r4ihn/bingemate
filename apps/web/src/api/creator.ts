import { MediaType, TitleStatus } from '@bingemate/shared';
import { MOCK_USER, db, getMockActor, newId } from '../mocks/db.js';
import type { CreatorStat, Submission, SubmissionInput } from '../types/creator.js';
import { ApiError } from './client.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

// The seeded demo titles belong to MOCK_USER; every creator sees them alongside their own submissions
const own = () =>
  db.titles.filter((t) => t.createdBy === getMockActor().id || t.createdBy === MOCK_USER);
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

  async submit(input: SubmissionInput): Promise<Submission> {
    if (!useMock) notWired('creator endpoints (JW)');
    await delay();
    const title = {
      id: newId('mock'),
      name: input.name,
      mediaType: input.mediaType ?? MediaType.MOVIE,
      status: TitleStatus.PENDING,
      avgRating: 0,
      reviewCount: 0,
      synopsis: input.synopsis,
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
    Object.assign(title, input);
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
