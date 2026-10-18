import type { CSSProperties } from 'react';

/** Style for a title's poster: the real image when the data has one, else the mock gradient. */
export function posterStyle(title: { posterUrl?: string | null; hue?: number }): CSSProperties {
  return title.posterUrl
    ? { background: `center / cover url(${title.posterUrl})` }
    : posterBackground(title.hue ?? 210);
}

/** Placeholder poster: a gradient from the title's hue. Replace with real posterUrl once the data exists. */
export function posterBackground(hue: number): CSSProperties {
  return {
    background: `linear-gradient(165deg, hsl(${hue} 70% 52%), hsl(${hue} 45% 14%) 70%, #050505)`,
  };
}
