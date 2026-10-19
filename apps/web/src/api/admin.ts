import { TitleStatus } from '@bingemate/shared';
import type { Paginated, Role } from '@bingemate/shared';
import { db } from '../mocks/db.js';
import type { AdminUser, ModerationReview } from '../types/admin.js';
import type { TitleDetail } from '../types/title.js';
import { ApiError } from './client.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

const PAGE_SIZE = 10;

export const adminApi = {
  async users(page: number): Promise<Paginated<AdminUser>> {
    if (!useMock) notWired('GET /admin/users (RA)');
    await delay();
    const start = (page - 1) * PAGE_SIZE;
    return clone({
      data: db.users.slice(start, start + PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total: db.users.length,
    });
  },

  async setRole(id: string, role: Role): Promise<AdminUser> {
    if (!useMock) notWired('PATCH /admin/users/:id/role (RA)');
    await delay();
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new ApiError(404, 'User not found');
    user.role = role;
    return clone(user);
  },

  async pendingTitles(): Promise<TitleDetail[]> {
    if (!useMock) notWired('GET /admin/titles?status=PENDING (RA)');
    await delay();
    return clone(db.titles.filter((t) => t.status === TitleStatus.PENDING));
  },

  async setTitleStatus(id: string, status: TitleStatus, reason?: string): Promise<void> {
    if (!useMock) notWired('PATCH /admin/titles/:id/status (RA)');
    await delay();
    const title = db.titles.find((t) => t.id === id);
    if (!title) throw new ApiError(404, 'Title not found');
    title.status = status;
    title.rejectionReason = status === TitleStatus.REJECTED ? reason : undefined;
  },

  /** Newest first, with the title name so moderators can see what was reviewed. */
  async reviews(page: number): Promise<Paginated<ModerationReview>> {
    if (!useMock) notWired('admin moderation (RA)');
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

  async removeReview(id: string): Promise<void> {
    if (!useMock) notWired('admin moderation (RA)');
    await delay();
    db.reviews = db.reviews.filter((r) => r.id !== id);
    db.comments = db.comments.filter((c) => c.reviewId !== id);
  },
};
