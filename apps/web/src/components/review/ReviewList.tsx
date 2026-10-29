import { useEffect, useRef, useState } from 'react';
import type { TitleSummary } from '@bingemate/shared';
import { useAuth } from '../../auth/AuthContext.js';
import { canDelete } from '../../auth/permissions.js';
import { reviewsApi } from '../../api/reviews.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { Review, ReviewFields } from '../../types/review.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { Pagination } from '../Pagination.js';
import { StateMessage } from '../StateMessage.js';
import { Badge } from '../ui/Badge.js';
import { dangerActionClass, actionClass } from './actionStyles.js';
import { ReviewEditForm } from './ReviewForm.js';
import { ReplyThread } from './ReplyThread.js';
import { ReviewText } from './ReviewText.js';
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
  title,
  titleOwnerId,
  onDeleted,
  onEdited,
}: {
  review: Review;
  /** Needed to edit in place (its media type picks the fields); without it there is no Edit button. */
  title?: TitleSummary;
  titleOwnerId: string | null;
  onDeleted: () => void;
  onEdited: () => void;
}) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const detail = describeFields(review.fields);
  const mine = user?.id === review.author.id;
  const canEdit = mine && title !== undefined;
  const canRemove = canDelete(user, review.author.id);

  // Closing the editor removes it: hand focus back to this review's Edit button
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

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

  const actions =
    canEdit || canRemove ? (
      <>
        {canEdit && (
          <button
            ref={editButton}
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit review by ${review.author.name}`}
            className={actionClass}
          >
            Edit
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete review by ${review.author.name}`}
            className={dangerActionClass}
          >
            Delete
          </button>
        )}
      </>
    ) : null;

  return (
    <article className="rounded-2xl border border-line bg-surface p-6">
      <header className="flex flex-wrap items-center gap-3">
        <strong className="font-semibold">{review.author.name}</strong>
        {mine && <span className="text-sm text-muted">You</span>}
        {titleOwnerId !== null && review.author.id === titleOwnerId && (
          <Badge tone="creator">Creator</Badge>
        )}
        <StarsDisplay value={review.rating} />
        <time dateTime={review.createdAt} className="ml-auto text-sm text-muted">
          {new Date(review.createdAt).toLocaleDateString()}
        </time>
      </header>
      {editing && title ? (
        <div className="mt-3">
          <ReviewEditForm
            title={title}
            existing={review}
            flat
            onSubmitted={() => {
              setEditing(false);
              onEdited();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <ReviewText text={review.body} className="mt-3" />
          {detail && <p className="mt-2 text-sm text-muted">{detail}</p>}
          {deleteError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {deleteError}
            </p>
          )}
          <ReplyThread
            reviewId={review.id}
            reviewAuthor={review.author.name}
            titleOwnerId={titleOwnerId}
            actions={actions}
          />
        </>
      )}
      <ConfirmDialog
        open={confirming}
        title="Delete review?"
        body="This review and its replies will be deleted."
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
  title,
  titleOwnerId = null,
  onDeleted,
  onEdited,
}: {
  titleId: string;
  /** The title being reviewed; with it, a user can edit their own review in place on its card. */
  title?: TitleSummary;
  /** Creator of the title: their reviews and replies get the Creator badge, only on this title. */
  titleOwnerId?: string | null;
  /** Called after a review is deleted, so the page can refresh the totals and the review form. */
  onDeleted?: () => void;
  /** Called after a review is edited, so the page can refresh the average and the review form. */
  onEdited?: () => void;
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
              title={title}
              titleOwnerId={titleOwnerId}
              onEdited={() => {
                reload();
                onEdited?.();
              }}
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
