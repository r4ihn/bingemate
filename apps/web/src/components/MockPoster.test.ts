import { describe, expect, it } from 'vitest';
import { posterStyle } from './MockPoster.js';

describe('posterStyle', () => {
  it('uses the real image when the title has one', () => {
    expect(posterStyle({ posterUrl: 'https://img.test/a.jpg' }).background).toBe(
      'center / cover url("https://img.test/a.jpg"), linear-gradient(165deg, hsl(210 70% 52%), hsl(210 45% 14%) 70%, #050505)',
    );
  });

  it('quotes the URL so spaces and brackets cannot break the style', () => {
    const { background } = posterStyle({ posterUrl: 'https://img.test/my poster (1).jpg' });
    expect(background).toBe(
      'center / cover url("https://img.test/my poster (1).jpg"), linear-gradient(165deg, hsl(210 70% 52%), hsl(210 45% 14%) 70%, #050505)',
    );
  });

  it('escapes a quote or backslash in the URL', () => {
    const { background } = posterStyle({ posterUrl: 'https://img.test/a"b\\c.jpg' });
    expect(background).toBe(
      'center / cover url("https://img.test/a\\"b\\\\c.jpg"), linear-gradient(165deg, hsl(210 70% 52%), hsl(210 45% 14%) 70%, #050505)',
    );
  });

  it('keeps the gradient under the image so a failed hotlink is not a blank box', () => {
    expect(
      String(posterStyle({ posterUrl: 'https://img.test/a.jpg', hue: 40 }).background),
    ).toMatch(/^center \/ cover url\("[^"]+"\), linear-gradient\(165deg, hsl\(40 70% 52%\)/);
  });

  it('falls back to the gradient from the hue when there is no image', () => {
    expect(String(posterStyle({ hue: 120 }).background)).toContain('hsl(120 70% 52%)');
    expect(String(posterStyle({ posterUrl: null }).background)).toContain('hsl(210 70% 52%)');
  });
});
