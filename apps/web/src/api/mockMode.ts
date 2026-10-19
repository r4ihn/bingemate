/**
 * Mocks default ON in dev and test builds and OFF in production builds, so fake data cannot ship by
 * accident. Set VITE_USE_MOCKS=true|false to override either way.
 */
export function resolveUseMock(flag: string | undefined, dev: boolean): boolean {
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return dev;
}

export const useMock = resolveUseMock(import.meta.env.VITE_USE_MOCKS, import.meta.env.DEV);

const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 200;

/** Simulated network delay so loading states are visible while building. */
export const delay = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

/** Return copies so UI code can never mutate the mock store by accident. */
export const clone = <T>(value: T): T => structuredClone(value);

export function notWired(what: string): never {
  throw new Error(`Real API not wired yet: ${what}`);
}
