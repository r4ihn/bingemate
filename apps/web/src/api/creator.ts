import {
  type CreatorTitleStatsDTO,
  type SubmissionDTO,
  MediaType,
  TitleStatus,
} from '@bingemate/shared';
import { MOCK_USER, db, getMockActor, newId } from '../mocks/db.js';
import type { CreatorStat, Submission, SubmissionInput } from '../types/creator.js';
import { ApiError, apiFetch } from './client.js';
import { mapSubmission } from './mappers.js';
import { clone, delay, useMock } from './mockMode.js';
import { resolvePosterUrl } from './posterUrl.js';

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
    if (!useMock) {
      const rows = await apiFetch<SubmissionDTO[]>('/creator/titles');
      return rows.map(mapSubmission);
    }
    await delay();
    return clone(own().map(toSubmission));
  },

  /** Real API: POST the title, then PUT the image as the raw file to /titles/:id/poster. */
  async submit(input: SubmissionInput): Promise<Submission> {
    if (!useMock) {
      const dto = await apiFetch<SubmissionDTO>('/titles', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          mediaType: input.mediaType,
          description: input.synopsis,
        }),
      });
      const submission = mapSubmission(dto);
      if (input.poster) {
        try {
          const { posterUrl } = await apiFetch<{ posterUrl: string }>(
            `/titles/${encodeURIComponent(dto.id)}/poster`,
            {
              method: 'PUT',
              body: input.poster,
              headers: { 'Content-Type': input.poster.type },
            },
          );
          submission.title.posterUrl = resolvePosterUrl(posterUrl);
        } catch (error) {
          if (error instanceof ApiError) {
            throw new ApiError(
              error.status,
              `Your title was saved, but its image could not be uploaded: ${error.message}. Edit the title to try the image again.`,
            );
          }
          throw error;
        }
      }
      return submission;
    }
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
    if (!useMock) {
      const path = `/titles/${encodeURIComponent(id)}`;
      let dto: SubmissionDTO | undefined;
      if (input.name !== undefined || input.synopsis !== undefined) {
        dto = await apiFetch<SubmissionDTO>(path, {
          method: 'PATCH',
          body: JSON.stringify({
            ...(input.name !== undefined && { name: input.name }),
            ...(input.synopsis !== undefined && { description: input.synopsis }),
          }),
        });
      } else {
        const rows = await apiFetch<SubmissionDTO[]>('/creator/titles');
        dto = rows.find((row) => row.id === id);
      }
      if (!dto) throw new ApiError(404, 'Title not found');
      const submission = mapSubmission(dto);
      if (input.poster) {
        const { posterUrl } = await apiFetch<{ posterUrl: string }>(`${path}/poster`, {
          method: 'PUT',
          body: input.poster,
          headers: { 'Content-Type': input.poster.type },
        });
        submission.title.posterUrl = resolvePosterUrl(posterUrl);
      } else if (input.removePoster) {
        await apiFetch<void>(`${path}/poster`, { method: 'DELETE' });
        submission.title.posterUrl = undefined;
      }
      return submission;
    }
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

  async remove(id: string): Promise<void> {
    if (!useMock) {
      return apiFetch<void>(`/titles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
    await delay();
    if (!own().some((title) => title.id === id)) throw new ApiError(404, 'Title not found');
    db.titles = db.titles.filter((title) => title.id !== id);
  },

  async stats(): Promise<CreatorStat[]> {
    if (!useMock) {
      const rows = await apiFetch<CreatorTitleStatsDTO[]>('/creator/stats');
      return rows
        .filter((t) => t.status === TitleStatus.APPROVED)
        .map((t) => ({
          titleId: t.titleId,
          name: t.name,
          avgRating: t.avgRating,
          reviewCount: t.reviewCount,
          listAdds: t.listAdds,
        }));
    }
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
