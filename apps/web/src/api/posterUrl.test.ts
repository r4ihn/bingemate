import { describe, expect, it } from 'vitest';
import { resolvePosterUrl } from './posterUrl.js';
describe('poster URLs', () => {
  it('resolves against the API origin without duplicating /api', () => {
    expect(resolvePosterUrl('/api/titles/t1/poster?v=42', 'https://api.example.com/api')).toBe('https://api.example.com/api/titles/t1/poster?v=42');
  });
  it('preserves same-origin paths and external or mock images', () => {
    expect(resolvePosterUrl('/api/titles/t1/poster', '/api')).toBe('/api/titles/t1/poster');
    for (const url of ['https://img.example.com/a.jpg', 'data:image/png;base64,abc', '//img.example.com/a.jpg']) {
      expect(resolvePosterUrl(url, 'https://api.example.com/api')).toBe(url);
    }
  });
});
