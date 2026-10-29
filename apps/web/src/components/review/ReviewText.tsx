import { useId, useState } from 'react';
import { actionClass } from './actionStyles.js';

/** Review text longer than this is folded behind "Read more". */
export const FOLD_AT = 600;

/** Cut near `limit` at a word boundary, so the fold never splits a word. */
function preview(text: string, limit: number): string {
  const cut = text.slice(0, limit);
  const space = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * A review's text. Line breaks are kept (the imported reviews have them) and long unbroken strings
 * wrap instead of widening the card. Long reviews fold behind a Read more / Show less button.
 */
export function ReviewText({
  text,
  limit = FOLD_AT,
  className = '',
}: {
  text: string;
  limit?: number;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const long = text.length > limit;

  return (
    <div className={className}>
      <p id={id} className="max-w-[65ch] break-words whitespace-pre-line">
        {long && !open ? preview(text, limit) : text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className={actionClass}
        >
          {open ? (
            'Show less'
          ) : (
            <>
              Read more <span className="sr-only">of this review</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
