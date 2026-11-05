/** Refuse application/test databases before constructing either database client. */
export function assertBenchDatabase(url: string): void {
  const rule = 'Benchmark safety rule: database name must end in _bench';
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.slice(1));
    if (
      !['postgresql:', 'mongodb:', 'mongodb+srv:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      !name.endsWith('_bench') ||
      name.includes('/')
    ) {
      throw new Error(rule);
    }
  } catch {
    // Never echo credentials in error messages.
    throw new Error(`${rule} (use a valid PostgreSQL or MongoDB URL with an explicit database)`);
  }
}
