import type { CSSProperties } from 'react';

/** Placeholder poster: a gradient from the title's hue. Replace with real posterUrl once the data exists. */
export function posterBackground(hue: number): CSSProperties {
  return {
    background: `linear-gradient(165deg, hsl(${hue} 70% 52%), hsl(${hue} 45% 14%) 70%, #050505)`,
  };
}
