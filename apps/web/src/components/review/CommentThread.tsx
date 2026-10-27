import { useState } from 'react';
import type { FormEvent } from 'react';
import { commentsApi } from '../../api/reviews.js';
import { ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import { useCanWrite } from '../../auth/useCanWrite.js';
import { canDelete } from '../../auth/permissions.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { Comment } from '../../types/review.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import { inputClass } from '../ui/inputClass.js';

function CommentForm({
  label,
  submitLabel,
  onPost,
}: {
  label: string;
  submitLabel: string;
  onPost: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || !body.trim()) return;
    setPending(true);
    setError(null);
    try {
      await onPost(body.trim());
      setBody('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Your session has expired. Log in again to post.'
          : err instanceof ApiError
            ? err.message
            : 'Could not post. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2">
      <Field label={label} error={error ?? undefined}>
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div>
        <Button type="submit" loading={pending} className="px-5 py-2 text-sm">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CommentView({
  comment,
  byTitleCreator,
  onDelete,
}: {
  comment: Comment;
  /** The author created the title being reviewed. */
  byTitleCreator: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="grid gap-1">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <strong className="font-semibold">{comment.author.name}</strong>
        {byTitleCreator && <Badge tone="creator">Creator</Badge>}
      </p>
      <p className="max-w-[65ch]">{comment.body}</p>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete comment by ${comment.author.name}`}
          className="justify-self-start text-sm text-muted underline inline-flex min-h-11 items-center"
        >
          Delete
        </button>
      )}
    </div>
  );
}

/** One level of replies: top-level comments can be replied to, replies cannot (TASKS.md section 0). */
export function CommentThread({
  reviewId,
  titleOwnerId = null,
}: {
  reviewId: string;
  /** Creator of the title being reviewed; their comments get the Creator badge, nobody else's. */
  titleOwnerId?: string | null;
}) {
  const { user } = useAuth();
  const canPost = useCanWrite(reviewId);
  const { state, reload } = useAsync(() => commentsApi.list(reviewId), [reviewId]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (state.status === 'loading') return <p className="text-sm text-muted">Loading comments…</p>;
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-danger">
        Could not load comments.{' '}
        <button
          type="button"
          onClick={reload}
          className="inline-flex min-h-11 items-center underline"
        >
          Retry
        </button>
      </p>
    );
  }

  // The API returns oldest first; keep that order and only group by parent
  const tops: Comment[] = [];
  const replies = new Map<string, Comment[]>();
  for (const c of state.data) {
    if (c.parentId === null) tops.push(c);
    else replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
  }
  const repliesOf = (id: string) => replies.get(id) ?? [];
  const isCreator = (c: Comment) => titleOwnerId !== null && c.author.id === titleOwnerId;

  const deleteHandler = (c: Comment) =>
    canDelete(user, c.author.id) ? () => setDeleting(c) : undefined;

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleteError(null);
    try {
      await commentsApi.remove(target.id);
      reload();
    } catch {
      setDeleteError('Could not delete the comment. Try again.');
    } finally {
      setDeleting(null);
    }
  }

  const post = (parentId: string | null) => async (body: string) => {
    await commentsApi.reply(reviewId, parentId, body);
    setReplyingTo(null);
    reload();
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      {deleteError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {deleteError}
        </p>
      )}
      <ul className="grid gap-4">
        {tops.map((c) => (
          <li key={c.id}>
            <CommentView comment={c} byTitleCreator={isCreator(c)} onDelete={deleteHandler(c)} />
            <ul className="mt-3 ml-6 grid gap-3 border-l border-line pl-4">
              {repliesOf(c.id).map((r) => (
                <li key={r.id}>
                  <CommentView
                    comment={r}
                    byTitleCreator={isCreator(r)}
                    onDelete={deleteHandler(r)}
                  />
                </li>
              ))}
            </ul>
            {canPost &&
              (replyingTo === c.id ? (
                <CommentForm label="Write a reply" submitLabel="Post reply" onPost={post(c.id)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setReplyingTo(c.id)}
                  className="mt-2 text-sm text-muted underline inline-flex min-h-11 items-center"
                >
                  Reply
                </button>
              ))}
          </li>
        ))}
      </ul>
      {canPost && (
        <CommentForm label="Add a comment" submitLabel="Post comment" onPost={post(null)} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete comment?"
        body="This comment will be deleted, along with any replies to it."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
