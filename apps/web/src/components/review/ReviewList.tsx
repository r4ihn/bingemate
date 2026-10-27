import { useState } from 'react';
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
import { StarsDisplay } from './StarRating.js';

function describeFields(fields: ReviewFields | undefined): string {
  if (!fields) return '';
  if ('runtimeMinutes' in fields) return `Watched ${fields.runtimeMinutes} min`;
  if ('chapters' in fields) return `Read ${fields.chapters} chapters`;
  if ('season' in fields && 'episodes' in fields) {
    return `Season ${fields.season}, ${fields.episodes} episodes`;
  }
  return '';
}

function ReviewCard({
  review,
  titleOwnerId,
  onDeleted,
}: {
  review: Review;
  titleOwnerId: string | null;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const detail = describeFields(review.fields);

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
        {titleOwnerId !== null && review.author.id === titleOwnerId && (
          <Badge tone="creator">Creator</Badge>
        )}
        <StarsDisplay value={review.rating} />
        <time dateTime={review.createdAt} className="ml-auto text-sm text-muted">
          {new Date(review.createdAt).toLocaleDateString()}
        </time>
      </header>
      <p className="mt-3 max-w-[65ch]">{review.body}</p>
      {detail && <p className="mt-2 text-sm text-muted">{detail}</p>}
      {deleteError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {deleteError}
        </p>
      )}
      {canDelete(user, review.author.id) && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete review by ${review.author.name}`}
          className="mt-2 text-sm text-muted underline inline-flex min-h-11 items-center"
        >
          Delete
        </button>
      )}
      <CommentThread reviewId={review.id} titleOwnerId={titleOwnerId} />
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

export function ReviewList({
  titleId,
  titleOwnerId = null,
  onDeleted,
}: {
  titleId: string;
  /** Creator of the title: their reviews and comments get the Creator badge, only on this title. */
  titleOwnerId?: string | null;
  /** Called after a review is deleted, so the page can refresh the totals and the review form. */
  onDeleted?: () => void;
}) {
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
              titleOwnerId={titleOwnerId}
              onDeleted={() => {
                if (data.length === 1 && page > 1) setPage(page - 1);
                else reload();
                onDeleted?.();
              }}
            />
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </>
  );
}
