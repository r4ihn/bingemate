import { useId, useState } from 'react';
import { MAX_RATING, RATING_WORDS } from '../../rating.js';

const STARS = Array.from({ length: MAX_RATING }, (_, i) => i + 1);
const PATH = 'M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.5l-6 3.4 1.3-6.7-5-4.7 6.8-.8z';

function Star({ on, className }: { on: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      strokeWidth="1.4"
      className={`${className} ${on ? 'fill-accent stroke-accent' : 'fill-white/10 stroke-field'}`}
    >
      <path d={PATH} />
    </svg>
  );
}

/** Click-to-rate stars. A radio group underneath, so arrow keys and screen readers work. */
export function StarRating({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (n: number) => void;
  error?: string;
}) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div>
      <div className="flex items-center gap-1">
        <div
          role="radiogroup"
          aria-label="Your rating"
          onMouseLeave={() => setHover(0)}
          className="flex"
        >
          {STARS.map((n) => (
            <label
              key={n}
              data-testid={`star-${n}`}
              onMouseEnter={() => setHover(n)}
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white"
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                className="sr-only"
              />
              <Star
                on={n <= shown}
                className={`h-9 w-9 transition-transform motion-reduce:transition-none ${
                  hover === n ? 'scale-110' : ''
                }`}
              />
            </label>
          ))}
        </div>
        <span
          className={`ml-3 text-sm font-semibold ${value ? 'text-accent' : 'text-muted'}`}
          aria-live="polite"
        >
          {shown ? RATING_WORDS[shown] : 'Tap a star'}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Read-only stars for a posted review. */
export function StarsDisplay({ value }: { value: number }) {
  return (
    <span
      role="img"
      aria-label={`${value} out of ${MAX_RATING} stars`}
      className="inline-flex items-center gap-0.5"
    >
      {STARS.map((n) => (
        <Star key={n} on={n <= value} className="h-[18px] w-[18px]" />
      ))}
    </span>
  );
}
