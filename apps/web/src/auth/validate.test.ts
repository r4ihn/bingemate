import { describe, expect, it } from 'vitest';
import { validateCredentials } from './validate.js';

describe('validateCredentials', () => {
  it('accepts a valid email and a strong-enough password', () => {
    expect(validateCredentials('a@b.co', 'abcdefg1')).toEqual({});
  });

  it('flags a bad email', () => {
    expect(validateCredentials('not-an-email', 'abcdefg1').email).toBeDefined();
    expect(validateCredentials('', 'abcdefg1').email).toBeDefined();
  });

  it.each(['short1', 'abcdefghij', '12345678'])('flags the weak password %s', (pw) => {
    expect(validateCredentials('a@b.co', pw).password).toBeDefined();
  });
});
