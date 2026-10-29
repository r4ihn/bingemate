import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import type { TitleSummary } from '@bingemate/shared';
import { ApiError } from '../../api/client.js';
import { reviewsApi } from '../../api/reviews.js';
import { useAuth } from '../../auth/AuthContext.js';
import { useCanWrite } from '../../auth/useCanWrite.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { Review, ReviewFields } from '../../types/review.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import { Panel } from '../ui/Panel.js';
import { inputClass } from '../ui/inputClass.js';
import { RATING_MAX, RATING_MIN } from '../../rating.js';
import { fieldConfig } from './fieldConfig.js';
import { StarRating, StarsDisplay } from './StarRating.js';

const WHOLE = /^\d+$/;
const whole = (v: string): number | null => (WHOLE.test(v.trim()) ? Number(v.trim()) : null);

function LoginPrompt() {
  const location = useLocation();
  return (
    <p className="text-muted">
      <Link to="/login" state={{ from: location }} className="text-white underline">
        Log in to review
      </Link>
    </p>
  );
}

function OwnTitleNote() {
  return (
    <p className="text-muted">
      You created this title, so you can reply to its reviews but not review it yourself.
    </p>
  );
}

function Form({
  title,
  existing,
  flat = false,
  onSubmitted,
  onCancel,
}: {
  title: TitleSummary;
  /** Set when editing: the form starts from this review and saves over it. */
  existing?: Review;
  /** No panel of its own, for a form that already sits inside a card. */
  flat?: boolean;
  onSubmitted: (r: Review) => void;
  onCancel?: () => void;
}) {
  const location = useLocation();
  const config = fieldConfig[title.mediaType];
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? '');
  const [media, setMedia] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(existing?.fields ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<'session' | string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // The Edit button that opened this form is gone, so move focus here instead of dropping it on the page
  useEffect(() => {
    if (existing) heading.current?.focus();
  }, [existing]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;

    const found: Record<string, string> = {};
    if (rating < RATING_MIN || rating > RATING_MAX) {
      found.rating = `Choose a rating from ${RATING_MIN} to ${RATING_MAX} stars`;
    }
    if (!body.trim()) found.body = 'Write something about this title before posting';
    for (const f of config) {
      const n = whole(media[f.name] ?? '');
      if (n === null || n < (f.min ?? 0))
        found[f.name] = `${f.label}: enter a whole number, ${f.min ?? 0} or more`;
    }
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length > 0) return;

    inFlight.current = true;
    setPending(true);
    try {
      const fields = Object.fromEntries(
        config.map((f) => [f.name, Number(media[f.name])]),
      ) as unknown as ReviewFields;
      const input = { rating, body: body.trim(), fields };
      const review = existing
        ? await reviewsApi.update(existing.id, input)
        : await reviewsApi.create(title.id, input);
      if (!existing) {
        setRating(0);
        setBody('');
        setMedia({});
      }
      onSubmitted(review);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSubmitError('session');
      else
        setSubmitError(
          err instanceof ApiError
            ? err.message
            : `Could not ${existing ? 'save' : 'post'} your review. Try again.`,
        );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const content = (
    <>
      <h3 ref={heading} tabIndex={-1} className="text-xl font-semibold tracking-tight">
        {existing ? 'Edit your review' : 'Write a review'}
      </h3>
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-4 grid gap-4">
        <StarRating value={rating} onChange={setRating} error={errors.rating} />
        {config.map((f) => (
          <Field key={f.name} label={f.label} error={errors[f.name]}>
            <input
              inputMode="numeric"
              value={media[f.name] ?? ''}
              onChange={(e) =>
                setMedia((m) => ({ ...m, [f.name]: e.target.value.replace(/\D/g, '') }))
              }
              className={inputClass}
            />
          </Field>
        ))}
        <Field label="Your review" error={errors.body}>
          <textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={inputClass}
          />
        </Field>
        {submitError === 'session' && (
          <p role="alert" className="text-sm text-danger">
            Your session has expired.{' '}
            <Link to="/login" state={{ from: location }} className="underline">
              Log in
            </Link>{' '}
            to {existing ? 'save' : 'post'} your review.
          </p>
        )}
        {submitError && submitError !== 'session' && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={pending}>
            {existing ? 'Save changes' : 'Post review'}
          </Button>
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </>
  );
  return flat ? <div>{content}</div> : <Panel>{content}</Panel>;
}

function AlreadyReviewed({ review, onEdit }: { review: Review; onEdit: () => void }) {
  return (
    <Panel>
      <h3 className="text-xl font-semibold tracking-tight">Your review</h3>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <StarsDisplay value={review.rating} />
        <p>You have already reviewed this title.</p>
      </div>
      <p className="mt-2 text-sm text-muted">
        Edit it here, or delete it below to write a new one.
      </p>
      <Button type="button" variant="secondary" onClick={onEdit} className="mt-3">
        Edit review
      </Button>
    </Panel>
  );
}

export function ReviewForm({
  title,
  onSubmitted,
  version = 0,
}: {
  title: TitleSummary;
  onSubmitted: (r: Review) => void;
  /** Change it after a review is posted or deleted to check again whether the user has reviewed. */
  version?: number;
}) {
  const { user } = useAuth();
  const canWrite = useCanWrite(title.id);
  const [editing, setEditing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const wasEditing = useRef(false);

  // Leaving edit mode (save or cancel) removes the form: hand focus back to the Edit button
  useEffect(() => {
    if (wasEditing.current && !editing) panel.current?.querySelector('button')?.focus();
    wasEditing.current = editing;
  }, [editing]);
  // One review per user per title: look first, so the user is not asked to write one that will be refused
  const { state } = useAsync(
    () =>
      user && user.role !== Role.ADMIN && title.createdById !== user.id
        ? reviewsApi.mine(title.id)
        : Promise.resolve(null),
    [title.id, user?.id, version],
    { keepPrevious: true },
  );

  // Admins moderate reviews but do not write them; they are signed in, so no login prompt either
  if (user?.role === Role.ADMIN) return null;
  // The creator of a title replies to its reviews but does not review it
  if (user && title.createdById === user.id) return <OwnTitleNote />;
  if (!canWrite) return <LoginPrompt />;
  // Without a user (session expired mid-post) the form stays so the draft and the message survive
  if (user && state.status === 'loading') return null;
  if (user && state.status === 'ready' && state.data) {
    const mine = state.data;
    return editing ? (
      <Form
        title={title}
        existing={mine}
        onSubmitted={(r) => {
          setEditing(false);
          onSubmitted(r);
        }}
        onCancel={() => setEditing(false)}
      />
    ) : (
      <div ref={panel}>
        <AlreadyReviewed review={mine} onEdit={() => setEditing(true)} />
      </div>
    );
  }
  // If the check fails, show the form anyway: the 409 on submit is still the backstop
  return <Form title={title} onSubmitted={onSubmitted} />;
}

/** The review form without the "already reviewed?" check, for editing a review in place on its card. */
export { Form as ReviewEditForm };
