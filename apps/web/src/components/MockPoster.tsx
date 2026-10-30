import type { CSSProperties } from 'react';

/**
 * Style for a title's poster. The real image is the top layer of the background with the gradient
 * underneath, so a hotlink that is slow or fails to load shows the gradient rather than a blank box.
 */
export function posterStyle(title: { posterUrl?: string | null; hue?: number }): CSSProperties {
  const gradient = gradientFor(title.hue ?? 210);
  return title.posterUrl
    ? {
        background: `center / cover url("${title.posterUrl.replace(/["\\]/g, '\\$&')}"), ${gradient}`,
      }
    : { background: gradient };
}

/** Placeholder poster: a gradient from the title's hue. */
export function posterBackground(hue: number): CSSProperties {
  return { background: gradientFor(hue) };
}

function gradientFor(hue: number): string {
  return `linear-gradient(165deg, hsl(${hue} 70% 52%), hsl(${hue} 45% 14%) 70%, #050505)`;
}
