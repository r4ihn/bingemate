import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Like the ETL tests, resolve at runtime to respect the API package's rootDir.
const file = fileURLToPath(new URL('../../../../benchmarks/lib/guard.ts', import.meta.url));
const { assertBenchDatabase } = (await import(/* @vite-ignore */ file)) as {
  assertBenchDatabase: (url: string) => void;
};

describe('assertBenchDatabase', () => {
  it.each([
    'postgresql://u:p@localhost:5432/bingemate',
    'postgresql://u:p@localhost:5432/bingemate_test',
    'postgresql://u:p@localhost:5432/bingemate?schema=public',
    'mongodb://localhost:27017',
    'postgresql://localhost/',
    'garbage',
    '',
    'https://localhost/bingemate_bench',
    'mongodb://localhost/other/bingemate_bench',
  ])('rejects unsafe database URL %j with the safety rule', (url) => {
    expect(() => assertBenchDatabase(url)).toThrow(/database name must end in _bench/);
  });

  it.each([
    'postgresql://u:p@localhost:5432/bingemate_bench?schema=public',
    'mongodb://localhost:27017/bingemate_bench',
    'mongodb+srv://cluster.example.test/bingemate_bench?retryWrites=true',
  ])('accepts benchmark database URL %j', (url) => {
    expect(() => assertBenchDatabase(url)).not.toThrow();
  });
});
