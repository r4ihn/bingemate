import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { repliesApi } from '../../api/reviews.js';
import { ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import { useCanWrite } from '../../auth/useCanWrite.js';
import { canDelete } from '../../auth/permissions.js';
import { timeAgo } from '../../format.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { Reply } from '../../types/review.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import { inputClass } from '../ui/inputClass.js';
import { actionClass, dangerActionClass } from './actionStyles.js';

/** A thread longer than this folds down to its first few replies behind "View more". */
const COLLAPSE_OVER = 3;
const SHOWN_WHEN_FOLDED = 2;

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 401) {
    return 'Your session has expired. Log in again to post.';
  }
  return err instanceof ApiError ? err.message : fallback;
}

/** A box with Save/Cancel, used both to write a new reply and to edit one. */
function ReplyForm({
  label,
  submitLabel,
  initial = '',
  onSave,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initial?: string;
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // The button that opened this form is gone or behind it, so move focus into the box
  useEffect(() => box.current?.focus(), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || !body.trim()) return;
    setPending(true);
    setError(null);
    try {
      await onSave(body.trim());
    } catch (err) {
      setError(errorText(err, 'Could not save. Try again.'));
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2">
      <Field label={label} error={error ?? undefined}>
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
          {submitLabel}
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

function ReplyItem({
  reply,
  byTitleCreator,
  mine,
  canRemove,
  onDelete,
  onChanged,
}: {
  reply: Reply;
  /** The author created the title being reviewed. */
  byTitleCreator: boolean;
  /** The signed-in user wrote this reply. */
  mine: boolean;
  canRemove: boolean;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Closing the editor removes it: hand focus back to this reply's Edit button
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  async function save(body: string) {
    await repliesApi.update(reply.id, body);
    setEditing(false);
    onChanged();
  }

  return (
    <div className="grid gap-1">
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <strong className="font-semibold">{reply.author.name}</strong>
        {mine && <span className="text-muted">You</span>}
        {byTitleCreator && <Badge tone="creator">Creator</Badge>}
        <time
          dateTime={reply.createdAt}
          title={new Date(reply.createdAt).toLocaleString()}
          className="ml-auto text-muted"
        >
          {timeAgo(reply.createdAt)}
          {reply.editedAt && ' · edited'}
        </time>
      </p>
      {editing ? (
        <ReplyForm
          label="Edit your reply"
          submitLabel="Save changes"
          initial={reply.body}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="max-w-[65ch]">{reply.body}</p>
          {(mine || canRemove) && (
            <div className="flex gap-5">
              {mine && (
                <button
                  ref={editButton}
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label={`Edit reply by ${reply.author.name}`}
                  className={actionClass}
                >
                  Edit
                </button>
              )}
              {canRemove && (
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label={`Delete reply by ${reply.author.name}`}
                  className={dangerActionClass}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The action row and the replies under one review. The row holds Reply (for anyone who may write)
 * and whatever the review card hands in as `actions` (its Edit and Delete), so a review and a reply
 * always show their actions in the same place. Replies are one flat list, oldest first.
 */
export function ReplyThread({
  reviewId,
  reviewAuthor,
  titleOwnerId = null,
  actions = null,
}: {
  reviewId: string;
  /** Name of the review's author, so the Reply button says whose review it answers. */
  reviewAuthor: string;
  /** Creator of the title being reviewed; their replies get the Creator badge, nobody else's. */
  titleOwnerId?: string | null;
  /** The review's own Edit and Delete buttons, shown in the same row as Reply. */
  actions?: ReactNode;
}) {
  const { user } = useAuth();
  const canPost = useCanWrite(reviewId);
  const { state, reload } = useAsync(() => repliesApi.list(reviewId), [reviewId]);
  const [writing, setWriting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState<Reply | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const replyButton = useRef<HTMLButtonElement>(null);
  const wasWriting = useRef(false);

  // Closing the form (post or cancel) removes it: hand focus back to the Reply button
  useEffect(() => {
    if (wasWriting.current && !writing) replyButton.current?.focus();
    wasWriting.current = writing;
  }, [writing]);

  const replies = state.status === 'ready' ? state.data : [];
  const hasRow = canPost || Boolean(actions);
  // Nothing to read and nothing anyone here may do: no empty box under the review
  if (state.status === 'ready' && replies.length === 0 && !hasRow) return null;

  const isCreator = (r: Reply) => titleOwnerId !== null && r.author.id === titleOwnerId;
  const folded = replies.length > COLLAPSE_OVER && !expanded;
  const visible = folded ? replies.slice(0, SHOWN_WHEN_FOLDED) : replies;

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
    setExpanded(true); // oldest first, so a folded thread would hide the reply just written
    reload();
  }

  return (
    <div className="mt-3">
      {hasRow && (
        <div className="flex flex-wrap items-center gap-x-5">
          {canPost && (
            <button
              ref={replyButton}
              type="button"
              aria-expanded={writing}
              onClick={() => setWriting((w) => !w)}
              className={actionClass}
            >
              Reply <span className="sr-only">to review by {reviewAuthor}</span>
              {replies.length > 0 && (
                <>
                  <span aria-hidden="true">&nbsp;· {replies.length}</span>
                  <span className="sr-only">
                    , {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                  </span>
                </>
              )}
            </button>
          )}
          {actions}
        </div>
      )}
      {writing && (
        <ReplyForm
          label="Write a reply"
          submitLabel="Post reply"
          onSave={post}
          onCancel={() => setWriting(false)}
        />
      )}
      {deleteError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {deleteError}
        </p>
      )}
      {state.status === 'loading' && <p className="mt-2 text-sm text-muted">Loading replies…</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-danger">
          Could not load replies.{' '}
          <button
            type="button"
            onClick={reload}
            className="inline-flex min-h-11 items-center underline"
          >
            Retry
          </button>
        </p>
      )}
      {replies.length > 0 && (
        <ul className="mt-2 ml-3 grid gap-4 border-l border-line pl-4">
          {visible.map((r) => (
            <li key={r.id}>
              <ReplyItem
                reply={r}
                byTitleCreator={isCreator(r)}
                mine={user?.id === r.author.id}
                canRemove={canDelete(user, r.author.id)}
                onDelete={() => setDeleting(r)}
                onChanged={reload}
              />
            </li>
          ))}
        </ul>
      )}
      {replies.length > COLLAPSE_OVER && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className={`${actionClass} ml-3 pl-4`}
        >
          {expanded
            ? 'Show fewer replies'
            : `View ${replies.length - SHOWN_WHEN_FOLDED} more replies`}
        </button>
      )}
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
