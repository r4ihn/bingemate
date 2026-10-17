import { useState } from 'react';
import { Role } from '@bingemate/shared';
import { reviewsApi } from '../../api/reviews.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { Review, ReviewFields } from '../../types/review.js';
import { Pagination } from '../Pagination.js';
import { StateMessage } from '../StateMessage.js';
import { Badge } from '../ui/Badge.js';
import { CommentThread } from './CommentThread.js';

function describeFields(fields: ReviewFields): string {
  if ('runtimeMinutes' in fields) return `Watched ${fields.runtimeMinutes} min`;
  if ('chapters' in fields) return `Read ${fields.chapters} chapters`;
  return `Season ${fields.season}, ${fields.episodes} episodes`;
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-6">
      <header className="flex flex-wrap items-center gap-3">
        <strong className="font-semibold">{review.author.name}</strong>
        {review.author.role === Role.CREATOR && <Badge tone="creator">Creator</Badge>}
        <span className="rounded-full bg-accent px-3 py-1 text-[0.8rem] font-semibold text-accent-ink">
          ★ {review.rating}/10
        </span>
        <time dateTime={review.createdAt} className="ml-auto text-[0.8rem] text-muted">
          {new Date(review.createdAt).toLocaleDateString()}
        </time>
      </header>
      <p className="mt-3">{review.body}</p>
      <p className="mt-2 text-[0.8rem] text-muted">{describeFields(review.fields)}</p>
      <CommentThread reviewId={review.id} />
    </article>
  );
}

export function ReviewList({ titleId }: { titleId: string }) {
  const [page, setPage] = useState(1);
  const { state, reload } = useAsync(() => reviewsApi.listByTitle(titleId, page), [titleId, page]);

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') {
    return <StateMessage kind="error" detail="Reviews could not be loaded." onRetry={reload} />;
  }
  const { data, pageSize, total } = state.data;
  if (data.length === 0) {
    return (
      <StateMessage
        kind="empty"
        title="No reviews yet"
        detail="Be the first to review this title."
      />
    );
  }
  return (
    <>
      <ul className="grid gap-6">
        {data.map((r) => (
          <li key={r.id}>
            <ReviewCard review={r} />
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </>
  );
}
