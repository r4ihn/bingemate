import { describe, expect, it } from 'vitest';
import { MAX_PENDING_SUBMISSIONS, normalizeUsername, usernameError } from '@bingemate/shared';
import { registerSchema } from '../../src/modules/auth/auth.schemas.js';
describe('username', () => {
  it('trims, NFKC-normalises and collapses whitespace', () => {
    expect(normalizeUsername('  Jose\u0301 \t Lee  ')).toBe('José Lee');
    expect(MAX_PENDING_SUBMISSIONS).toBe(10);
  });
  it.each([
    ['ａｄｍｉｎ', 'admin'],
    ['Ｃａｓｅｙ', 'Casey'],
  ])('NFKC folds %s to %s', (raw, normalized) => {
    expect(normalizeUsername(raw)).toBe(normalized);
  });
  it.each(['Admin', 'A D M I N', 'a.d.m.i.n', 'ad-min', 'ad_min', 'A_.-D M I N', 'ａｄｍｉｎ'])(
    'rejects reserved form %s',
    (name) => {
      expect(usernameError(name)).toBe('This username is reserved');
    },
  );
  it.each(['аdmin', 'Pаul', 'Αlex', 'Дмитрий Ελένη', 'Ｃаsey'])(
    'rejects mixed scripts in %s',
    (name) => {
      expect(usernameError(name)).toBe('Username cannot mix Latin, Cyrillic and Greek letters');
    },
  );
  it.each([
    'Padmini',
    'BingeMate Fan',
    'Madmin',
    'Sam Support Fan',
    'Дмитрий',
    'Müller',
    'Yuki 雪',
    '李小龍',
    'Ελένη',
  ])('allows %s without substring matching or restricting other scripts', (name) => {
    expect(usernameError(name)).toBeNull();
  });
  it.each(['Casey Lee', '李小龍', 'User_1-2.3', 'a'.repeat(30)])('accepts %s', (name) => {
    expect(usernameError(name)).toBeNull();
  });
  it.each([
    'ab',
    'a'.repeat(31),
    'Casey!',
    'AdMiN',
    'ADMINISTRATOR',
    'Moderator',
    'BingeMate',
    'Support',
    'System',
    '.Casey',
    'Casey-',
    '_Casey',
    'Casey.',
  ])('rejects %s', (name) => {
    expect(usernameError(name)).toEqual(expect.any(String));
  });
});
describe('register schema username', () => {
  const body = { email: 'me@example.com', password: 'Password123' };
  it('requires a string username', () => {
    expect(registerSchema.safeParse(body).success).toBe(false);
    expect(registerSchema.safeParse({ ...body, username: 123 }).success).toBe(false);
  });
  it('accepts and normalises a valid username including double spaces', () => {
    expect(registerSchema.parse({ ...body, username: '  Casey  Lee ' }).username).toBe('Casey Lee');
  });
  it.each(['ab', 'a'.repeat(31), 'Casey!', 'aDmIn', '.Casey', 'Casey-'])(
    'surfaces the shared error for %s',
    (username) => {
      const result = registerSchema.safeParse({ ...body, username });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.flatten().fieldErrors.username).toEqual([usernameError(username)]);
    },
  );
});
