import { describe, expect, it } from 'vitest';
import { posterStyle } from './MockPoster.js';

describe('posterStyle', () => {
  it('uses the real image when the title has one', () => {
    expect(posterStyle({ posterUrl: 'https://img.test/a.jpg' }).background).toBe(
      'center / cover url("https://img.test/a.jpg")',
    );
  });

  it('quotes the URL so spaces and brackets cannot break the style', () => {
    const { background } = posterStyle({ posterUrl: 'https://img.test/my poster (1).jpg' });
    expect(background).toBe('center / cover url("https://img.test/my poster (1).jpg")');
  });

  it('escapes a quote or backslash in the URL', () => {
    const { background } = posterStyle({ posterUrl: 'https://img.test/a"b\\c.jpg' });
    expect(background).toBe('center / cover url("https://img.test/a\\"b\\\\c.jpg")');
  });

  it('falls back to the gradient from the hue when there is no image', () => {
    expect(String(posterStyle({ hue: 120 }).background)).toContain('hsl(120 70% 52%)');
    expect(String(posterStyle({ posterUrl: null }).background)).toContain('hsl(210 70% 52%)');
  });
});
