import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { repliesApi } from '../../api/reviews.js';
import { ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import { useCanWrite } from '../../auth/useCanWrite.js';
import { canDelete } from '../../auth/permissions.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { Reply } from '../../types/review.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import { inputClass } from '../ui/inputClass.js';

function ReplyForm({
  onPost,
  onCancel,
}: {
  onPost: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // The Reply button that opened this form is gone, so move focus into the box
  useEffect(() => box.current?.focus(), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || !body.trim()) return;
    setPending(true);
    setError(null);
    try {
      await onPost(body.trim());
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Your session has expired. Log in again to post.'
          : err instanceof ApiError
            ? err.message
            : 'Could not post. Try again.',
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2">
      <Field label="Write a reply" error={error ?? undefined}>
        <textarea
          ref={box}
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending} className="px-5 py-2 text-sm">
          Post reply
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={pending}
          className="px-5 py-2 text-sm"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReplyView({
  reply,
  byTitleCreator,
  onDelete,
}: {
  reply: Reply;
  /** The author created the title being reviewed. */
  byTitleCreator: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="grid gap-1">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <strong className="font-semibold">{reply.author.name}</strong>
        {byTitleCreator && <Badge tone="creator">Creator</Badge>}
      </p>
      <p className="max-w-[65ch]">{reply.body}</p>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete reply by ${reply.author.name}`}
          className="inline-flex min-h-11 items-center justify-self-start text-sm text-muted underline"
        >
          Delete
        </button>
      )}
    </div>
  );
}

/** The replies under one review: a flat list, oldest first, and one Reply button for anyone who may write. */
export function ReplyThread({
  reviewId,
  reviewAuthor,
  titleOwnerId = null,
}: {
  reviewId: string;
  /** Name of the review's author, so each Reply button says whose review it answers. */
  reviewAuthor: string;
  /** Creator of the title being reviewed; their replies get the Creator badge, nobody else's. */
  titleOwnerId?: string | null;
}) {
  const { user } = useAuth();
  const canPost = useCanWrite(reviewId);
  const { state, reload } = useAsync(() => repliesApi.list(reviewId), [reviewId]);
  const [writing, setWriting] = useState(false);
  const [deleting, setDeleting] = useState<Reply | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const replyButton = useRef<HTMLButtonElement>(null);
  const wasWriting = useRef(false);

  // Closing the form (post or cancel) removes it: hand focus back to the Reply button
  useEffect(() => {
    if (wasWriting.current && !writing) replyButton.current?.focus();
    wasWriting.current = writing;
  }, [writing]);

  if (state.status === 'loading') return <p className="text-sm text-muted">Loading replies…</p>;
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-danger">
        Could not load replies.{' '}
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

  const replies = state.data;
  // Nothing to read and nobody who may write: show no empty box under the review
  if (replies.length === 0 && !canPost) return null;

  const isCreator = (r: Reply) => titleOwnerId !== null && r.author.id === titleOwnerId;

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleteError(null);
    try {
      await repliesApi.remove(target.id);
      reload();
    } catch {
      setDeleteError('Could not delete the reply. Try again.');
    } finally {
      setDeleting(null);
    }
  }

  async function post(body: string) {
    await repliesApi.create(reviewId, body);
    setWriting(false);
    reload();
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      {deleteError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {deleteError}
        </p>
      )}
      {replies.length > 0 && (
        <ul className="ml-3 grid gap-4 border-l border-line pl-4">
          {replies.map((r) => (
            <li key={r.id}>
              <ReplyView
                reply={r}
                byTitleCreator={isCreator(r)}
                onDelete={canDelete(user, r.author.id) ? () => setDeleting(r) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      {canPost &&
        (writing ? (
          <ReplyForm onPost={post} onCancel={() => setWriting(false)} />
        ) : (
          <button
            ref={replyButton}
            type="button"
            onClick={() => setWriting(true)}
            className="mt-2 inline-flex min-h-11 cursor-pointer items-center text-sm text-muted underline"
          >
            Reply <span className="sr-only">to review by {reviewAuthor}</span>
          </button>
        ))}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete reply?"
        body="This reply will be deleted."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
