import { useState } from 'react';
import type { FormEvent } from 'react';
import { Role } from '@bingemate/shared';
import { commentsApi } from '../../api/reviews.js';
import { ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { Comment } from '../../types/review.js';
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
      setError(err instanceof ApiError ? err.message : 'Could not post. Try again.');
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
        <Button type="submit" loading={pending} className="px-5 py-2 text-[0.85rem]">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CommentView({ comment }: { comment: Comment }) {
  return (
    <div className="grid gap-1">
      <p className="flex flex-wrap items-center gap-2 text-[0.85rem]">
        <strong className="font-semibold">{comment.author.name}</strong>
        {comment.author.role === Role.CREATOR && <Badge tone="creator">Creator</Badge>}
        {comment.isOfficial && <Badge tone="neutral">Official reply</Badge>}
      </p>
      <p>{comment.body}</p>
    </div>
  );
}

/** One level of replies: top-level comments can be replied to, replies cannot (TASKS.md section 0). */
export function CommentThread({ reviewId }: { reviewId: string }) {
  const { user } = useAuth();
  const { state, reload } = useAsync(() => commentsApi.list(reviewId), [reviewId]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  if (state.status === 'loading')
    return <p className="text-[0.8rem] text-muted">Loading comments…</p>;
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-[0.8rem] text-danger">
        Could not load comments.{' '}
        <button type="button" onClick={reload} className="underline">
          Retry
        </button>
      </p>
    );
  }

  const byTime = (a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt);
  const tops = state.data.filter((c) => c.parentId === null).sort(byTime);
  // Official replies are pinned first, then oldest first
  const repliesOf = (id: string) =>
    state.data
      .filter((c) => c.parentId === id)
      .sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || byTime(a, b));

  const post = (parentId: string | null) => async (body: string) => {
    await commentsApi.reply(reviewId, parentId, body);
    setReplyingTo(null);
    reload();
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <ul className="grid gap-4">
        {tops.map((c) => (
          <li key={c.id}>
            <CommentView comment={c} />
            <ul className="mt-3 ml-6 grid gap-3 border-l border-line pl-4">
              {repliesOf(c.id).map((r) => (
                <li key={r.id}>
                  <CommentView comment={r} />
                </li>
              ))}
            </ul>
            {user &&
              (replyingTo === c.id ? (
                <CommentForm label="Write a reply" submitLabel="Post reply" onPost={post(c.id)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setReplyingTo(c.id)}
                  className="mt-2 text-[0.8rem] text-muted underline"
                >
                  Reply
                </button>
              ))}
          </li>
        ))}
      </ul>
      {user && <CommentForm label="Add a comment" submitLabel="Post comment" onPost={post(null)} />}
    </div>
  );
}
