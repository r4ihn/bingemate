import { describe, expect, it } from 'vitest';
import { resolveUseMock } from './mockMode.js';

describe('resolveUseMock', () => {
  it('reads the real API by default outside the test suite, in dev and production builds', () => {
    expect(resolveUseMock(undefined, false)).toBe(false);
    expect(resolveUseMock('', false)).toBe(false);
  });
  it('uses mock data by default in the test suite', () => {
    expect(resolveUseMock(undefined, true)).toBe(true);
  });
  it('uses mock data only when VITE_USE_MOCKS is exactly "true"', () => {
    expect(resolveUseMock('true', false)).toBe(true);
    expect(resolveUseMock('TRUE', false)).toBe(false);
    expect(resolveUseMock('1', false)).toBe(false);
  });
  it('honours VITE_USE_MOCKS=false in the test suite', () => {
    expect(resolveUseMock('false', true)).toBe(false);
  });
});
