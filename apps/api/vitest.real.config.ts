import { defineConfig } from 'vitest/config';

// Vitest installs these in workers before importing app modules (env.ts parses at import time).
// Never fall back to the development store URLs. globalSetup rejects missing TEST_* values.
export default defineConfig({
  test: {
    include: ['tests/real/**/*.real.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false },
    testTimeout: 30000,
    hookTimeout: 60000,
    globalSetup: ['tests/real/globalSetup.ts'],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      MONGO_URI: process.env.TEST_MONGO_URI ?? '',
      JWT_SECRET: process.env.JWT_SECRET ?? 'real-test-secret-at-least-16-chars',
      NODE_ENV: 'test',
      TRENDING_REFRESH_MINUTES: '0',
    },
  },
});
