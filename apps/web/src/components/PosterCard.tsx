import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { TitleSummary } from '@bingemate/shared';
import { posterStyle } from './MockPoster.js';

export type PosterTitle = TitleSummary & { hue?: number; year?: number };

/**
 * Portrait poster that links to the title page. Greyscale until hovered or keyboard-focused
 * (docs/ui.md A6). Uses `posterUrl` when the data has one, else the mock gradient.
 */
export function PosterCard({ title, children }: { title: PosterTitle; children?: ReactNode }) {
  const style = posterStyle(title);

  return (
    <div className="grid content-start gap-3">
      <Link
        to={`/titles/${title.id}`}
        style={style}
        className="relative block aspect-[2/3] overflow-hidden rounded-lg brightness-75 grayscale transition duration-300 hover:-translate-y-1.5 hover:brightness-100 hover:grayscale-0 focus-visible:-translate-y-1.5 focus-visible:brightness-100 focus-visible:grayscale-0 motion-reduce:transition-none"
      >
        {title.year !== undefined && (
          <span className="absolute top-3 left-2.5 text-xs tracking-widest opacity-80">
            {title.year}
          </span>
        )}
        <span className="absolute right-2.5 bottom-3.5 left-2.5 text-base leading-none font-bold tracking-tight uppercase">
          {title.name}
        </span>
      </Link>
      {children}
    </div>
  );
}
