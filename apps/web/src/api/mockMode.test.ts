import { describe, expect, it } from 'vitest';
import { resolveUseMock } from './mockMode.js';

describe('resolveUseMock', () => {
  it('is on by default in dev and test builds', () => {
    expect(resolveUseMock(undefined, true)).toBe(true);
  });
  it('is OFF by default in a production build, so fake data never ships by accident', () => {
    expect(resolveUseMock(undefined, false)).toBe(false);
  });
  it('honours an explicit flag in either build', () => {
    expect(resolveUseMock('false', true)).toBe(false);
    expect(resolveUseMock('true', false)).toBe(true);
  });
});
