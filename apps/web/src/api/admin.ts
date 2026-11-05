import { TitleStatus } from '@bingemate/shared';
import type { Paginated, Role, SubmissionDTO } from '@bingemate/shared';
import { db } from '../mocks/db.js';
import type { AdminUser, ModerationReview } from '../types/admin.js';
import type { TitleDetail } from '../types/title.js';
import { ApiError, apiFetch } from './client.js';
import { mapSubmission } from './mappers.js';
import { clone, delay, useMock } from './mockMode.js';

const PAGE_SIZE = 10;

export const adminApi = {
  async users(page: number): Promise<Paginated<AdminUser>> {
    if (!useMock) {
      return apiFetch<Paginated<AdminUser>>(`/admin/users?page=${page}&pageSize=${PAGE_SIZE}`);
    }
    await delay();
    const start = (page - 1) * PAGE_SIZE;
    return clone({
      data: db.users.slice(start, start + PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total: db.users.length,
    });
  },

  /** The new role takes effect at the user's next login: their current session keeps the old one. */
  async setRole(id: string, role: Role): Promise<AdminUser> {
    if (!useMock) {
      return apiFetch<AdminUser>(`/admin/users/${encodeURIComponent(id)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
    }
    await delay();
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new ApiError(404, 'User not found');
    user.role = role;
    return clone(user);
  },

  async pendingTitles(): Promise<TitleDetail[]> {
    if (!useMock) {
      // The API caps a page at 50; read every page so no pending title is left out of the queue.
      const rows: SubmissionDTO[] = [];
      for (let page = 1; ; page++) {
        const res = await apiFetch<Paginated<SubmissionDTO>>(
          `/admin/titles?status=PENDING&pageSize=50&page=${page}`,
        );
        rows.push(...res.data);
        if (res.data.length === 0 || rows.length >= res.total) break;
      }
      return rows.map((dto) => mapSubmission(dto).title);
    }
    await delay();
    return clone(db.titles.filter((t) => t.status === TitleStatus.PENDING));
  },

  async setTitleStatus(
    id: string,
    status: TitleStatus,
    reason?: string,
    version?: string,
  ): Promise<void> {
    if (!useMock) {
      if (version === undefined) throw new ApiError(400, 'Reload the queue and try again.');
      await apiFetch<SubmissionDTO>(`/admin/titles/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          updatedAt: version,
          ...(reason !== undefined && { rejectionReason: reason }),
        }),
      });
      return;
    }
    await delay();
    const title = db.titles.find((t) => t.id === id);
    if (!title) throw new ApiError(404, 'Title not found');
    title.status = status;
    title.rejectionReason = status === TitleStatus.REJECTED ? reason : undefined;
  },

  /** Newest first, with the title name so moderators can see what was reviewed. */
  async reviews(page: number): Promise<Paginated<ModerationReview>> {
    if (!useMock) {
      return apiFetch<Paginated<ModerationReview>>(
        `/admin/reviews?page=${page}&pageSize=${PAGE_SIZE}`,
      );
    }
    await delay();
    const all = [...db.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * PAGE_SIZE;
    const data = all.slice(start, start + PAGE_SIZE).map((r) => ({
      id: r.id,
      titleId: r.titleId,
      titleName: db.titles.find((t) => t.id === r.titleId)?.name ?? 'Unknown title',
      author: { id: r.author.id, name: r.author.name },
      rating: r.rating,
      body: r.body,
      createdAt: r.createdAt,
    }));
    return clone({ data, page, pageSize: PAGE_SIZE, total: all.length });
  },

  /** The same DELETE /reviews/:id a member uses on their own review; an admin may delete any. */
  async removeReview(id: string): Promise<void> {
    if (!useMock) {
      return apiFetch<void>(`/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
    await delay();
    db.reviews = db.reviews.filter((r) => r.id !== id);
    db.replies = db.replies.filter((r) => r.reviewId !== id);
  },
};
