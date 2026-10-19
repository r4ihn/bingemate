import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// Mock API calls have simulated latency; the 1s default is too tight when suites run in parallel
configure({ asyncUtilTimeout: 5000 });

// jsdom has no IntersectionObserver; Home's poster strip uses one for its entrance animation
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??=
  NoopIntersectionObserver as unknown as typeof IntersectionObserver;
