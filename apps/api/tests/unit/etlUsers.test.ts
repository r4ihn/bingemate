import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const file = fileURLToPath(new URL('../../../../data/etl/clean-users.ts', import.meta.url));
const { uniqueUsername, ROLE_BY_ID } = (await import(/* @vite-ignore */ file)) as {
  uniqueUsername: (name: string, seen: Set<string>) => string;
  ROLE_BY_ID: Record<string, string>;
};
describe('ETL users', () => {
  it('maps both non-admin role ids to MEMBER', () => {
    expect(ROLE_BY_ID).toEqual({ '1': 'MEMBER', '2': 'MEMBER', '3': 'ADMIN' });
  });
  it('deduplicates ignoring case in input order and loops past occupied suffixes', () => {
    const seen = new Set<string>();
    expect(['Casey Lee', 'Casey Lee (2)', 'casey lee', 'Casey Lee', "O'Neil", "o'neil"].map(name => uniqueUsername(name, seen))).toEqual([
      'Casey Lee', 'Casey Lee (2)', 'casey lee (3)', 'Casey Lee (4)', "O'Neil", "o'neil (2)",
    ]);
  });
});
