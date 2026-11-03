import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from '../real/guard.js';

describe('assertTestDatabase', () => {
  it.each([
    'postgresql://user:secret@localhost/bingemate',
    'postgresql://user:secret@localhost/bingemate_bench',
    'postgresql://user:secret@localhost/bingemate?schema=public',
    'postgresql://localhost/',
    'mongodb://localhost:27017',
    'garbage',
    '',
    'https://localhost/bingemate_test',
    'mongodb://localhost/other/bingemate_test',
  ])('refuses unsafe URL %# before any database operation', (url) => {
    expect(() => assertTestDatabase(url, 'TEST_DATABASE_URL'), 'unsafe databases must be refused')
      .toThrow('TEST_DATABASE_URL must name a database ending in _test');
    try {
      assertTestDatabase(url, 'TEST_DATABASE_URL');
    } catch (error) {
      expect(String(error), 'guard errors must not expose credentials').not.toContain('secret');
    }
  });

  it.each([
    'postgresql://user:secret@localhost/bingemate_test',
    'postgresql://user:secret@localhost/bingemate_test?schema=public',
    'mongodb://localhost:27017/bingemate_test',
    'mongodb+srv://cluster.example.test/bingemate_test?retryWrites=true',
  ])('accepts isolated test database %#', (url) => {
    expect(() => assertTestDatabase(url, 'test database'), 'isolated test databases must be allowed')
      .not.toThrow();
  });
});
