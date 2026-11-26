/**
 * The website reads the real API by default, in dev and in production builds. Mock data is opt-in:
 * set VITE_USE_MOCKS=true to use it (for example to work on the UI without the API). The test suite
 * defaults to mocks, which act as its in-memory backend. VITE_USE_MOCKS=false overrides that too.
 */
export function resolveUseMock(flag: string | undefined, testRun: boolean): boolean {
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return testRun;
}

export const useMock = resolveUseMock(
  import.meta.env.VITE_USE_MOCKS,
  import.meta.env.MODE === 'test',
);

const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 200;

/** Simulated network delay so loading states are visible while building. */
export const delay = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

/** Return copies so UI code can never mutate the mock store by accident. */
export const clone = <T>(value: T): T => structuredClone(value);
