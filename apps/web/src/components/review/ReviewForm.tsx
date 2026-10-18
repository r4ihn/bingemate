import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { TitleSummary } from '@bingemate/shared';
import { ApiError } from '../../api/client.js';
import { reviewsApi } from '../../api/reviews.js';
import { useAuth } from '../../auth/AuthContext.js';
import type { Review, ReviewFields } from '../../types/review.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import { Panel } from '../ui/Panel.js';
import { inputClass } from '../ui/inputClass.js';
import { fieldConfig } from './fieldConfig.js';

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

function Form({ title, onSubmitted }: { title: TitleSummary; onSubmitted: (r: Review) => void }) {
  const location = useLocation();
  const config = fieldConfig[title.mediaType];
  const [rating, setRating] = useState('');
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<'session' | string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;

    const found: Record<string, string> = {};
    const r = whole(rating);
    if (r === null || r < 1 || r > 10) found.rating = 'Rating must be a whole number from 1 to 10';
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
      const review = await reviewsApi.create(title.id, {
        rating: r as number,
        body: body.trim(),
        fields,
      });
      setRating('');
      setBody('');
      setMedia({});
      onSubmitted(review);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSubmitError('session');
      else
        setSubmitError(
          err instanceof ApiError ? err.message : 'Could not post your review. Try again.',
        );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <Panel>
      <h3 className="text-xl font-semibold tracking-tight">Write a review</h3>
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-4 grid gap-4">
        <Field label="Rating (1–10)" error={errors.rating}>
          <input
            inputMode="numeric"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className={inputClass}
          />
        </Field>
        {config.map((f) => (
          <Field key={f.name} label={f.label} error={errors[f.name]}>
            <input
              inputMode="numeric"
              value={media[f.name] ?? ''}
              onChange={(e) => setMedia((m) => ({ ...m, [f.name]: e.target.value }))}
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
            to post your review.
          </p>
        )}
        {submitError && submitError !== 'session' && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}
        <div>
          <Button type="submit" loading={pending}>
            Post review
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function ReviewForm({
  title,
  onSubmitted,
}: {
  title: TitleSummary;
  onSubmitted: (r: Review) => void;
}) {
  const { user, sessionExpired } = useAuth();
  // A 401 clears the session mid-post. Keep the form (and the draft) on screen so the user sees the
  // "session expired" message instead of the form vanishing.
  return user || sessionExpired ? (
    <Form title={title} onSubmitted={onSubmitted} />
  ) : (
    <LoginPrompt />
  );
}
