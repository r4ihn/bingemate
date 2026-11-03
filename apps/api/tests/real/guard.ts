/** Validate before opening either store; errors deliberately omit the connection string. */
export function assertTestDatabase(url: string, label: string): void {
  const fail = () => new Error(`${label} must name a database ending in _test`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw fail();
  }
  if (!['postgres:', 'postgresql:', 'mongodb:', 'mongodb+srv:'].includes(parsed.protocol)
    || !parsed.hostname || !/^\/[^/]*_test$/.test(parsed.pathname)) {
    throw fail();
  }
}
