/** Mock mode is the default until each endpoint owner confirms their response shape. */
export const useMock = import.meta.env.VITE_USE_MOCKS !== 'false';

const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 200;

/** Simulated network delay so loading states are visible while building. */
export const delay = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

/** Return copies so UI code can never mutate the mock store by accident. */
export const clone = <T>(value: T): T => structuredClone(value);

export function notWired(what: string): never {
  throw new Error(`Real API not wired yet: ${what}`);
}
