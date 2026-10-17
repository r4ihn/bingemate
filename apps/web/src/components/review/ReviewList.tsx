import { useState } from 'react';
import { Role } from '@bingemate/shared';
import { useAuth } from '../../auth/AuthContext.js';
import { canDelete } from '../../auth/permissions.js';
import { reviewsApi } from '../../api/reviews.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { Review, ReviewFields } from '../../types/review.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { Pagination } from '../Pagination.js';
import { StateMessage } from '../StateMessage.js';
import { Badge } from '../ui/Badge.js';
import { CommentThread } from './CommentThread.js';

function describeFields(fields: ReviewFields): string {
  if ('runtimeMinutes' in fields) return `Watched ${fields.runtimeMinutes} min`;
  if ('chapters' in fields) return `Read ${fields.chapters} chapters`;
  return `Season ${fields.season}, ${fields.episodes} episodes`;
}

function ReviewCard({ review, onDeleted }: { review: Review; onDeleted: () => void }) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleteError(null);
    try {
      await reviewsApi.remove(review.id);
      onDeleted();
    } catch {
      setDeleteError('Could not delete the review. Try again.');
    } finally {
      setConfirming(false);
    }
  }

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
      {deleteError && (
        <p role="alert" className="mt-2 text-[0.8rem] text-danger">
          {deleteError}
        </p>
      )}
      {canDelete(user, review.author.id) && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete review by ${review.author.name}`}
          className="mt-2 text-[0.8rem] text-muted underline"
        >
          Delete
        </button>
      )}
      <CommentThread reviewId={review.id} />
      <ConfirmDialog
        open={confirming}
        title="Delete review?"
        body="This review and its comments will be deleted."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
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
            <ReviewCard
              review={r}
              onDeleted={() => (data.length === 1 && page > 1 ? setPage(page - 1) : reload())}
            />
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </>
  );
}
