import { useEffect, useRef } from 'react';

/** Only a YouTube id goes into the embed URL; the database CHECK enforces the same format. */
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{11}$/;

export const trailerEmbedUrl = (key: string) =>
  `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0`;

/**
 * A title's trailer in a modal. youtube-nocookie keeps YouTube from setting cookies until the video
 * plays. Escape, the Close button or a click on the backdrop closes it, and focus goes back to the
 * button that opened it. Unmounting removes the iframe, which stops the video.
 */
export function TrailerDialog({
  trailerKey,
  title,
  onClose,
}: {
  trailerKey: string;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    el.querySelector('button')?.focus();
    return () => {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
      opener?.focus();
    };
  }, []);

  if (!YOUTUBE_KEY.test(trailerKey)) return null;
  return (
    <dialog
      ref={ref}
      aria-label={`Trailer for ${title}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click outside the video lands on the dialog element itself (its backdrop).
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[min(94vw,64rem)] overflow-visible bg-transparent p-0 backdrop:bg-black/85"
    >
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-full border border-white px-5 py-2 text-sm font-semibold text-white"
        >
          Close
        </button>
      </div>
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe
          src={trailerEmbedUrl(trailerKey)}
          title={`Trailer for ${title}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    </dialog>
  );
}
