import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaConstructor } = vi.hoisted(() => ({ prismaConstructor: vi.fn() }));
vi.mock('@prisma/client', () => ({ PrismaClient: prismaConstructor }));

const file = fileURLToPath(new URL('../../../../benchmarks/seed-bench.ts', import.meta.url));
const { main } = (await import(/* @vite-ignore */ file)) as {
  main: (args: string[], env: NodeJS.ProcessEnv) => Promise<void>;
};
const env = {
  BENCH_DATABASE_URL: 'postgresql://u:p@localhost:5432/bingemate_bench',
  BENCH_MONGO_URI: 'mongodb://localhost:27017/bingemate_bench',
};

beforeEach(() => {
  prismaConstructor.mockClear();
  vi.spyOn(mongoose, 'createConnection').mockImplementation(() => {
    throw new Error('Unexpected database connection');
  });
});
afterEach(() => vi.restoreAllMocks());

describe('benchmark seed offline preflight', () => {
  it.each(['BENCH_DATABASE_URL', 'BENCH_MONGO_URI'] as const)(
    'requires %s without falling back to app credentials',
    async (key) => {
      const input = { ...env, DATABASE_URL: env.BENCH_DATABASE_URL, MONGO_URI: env.BENCH_MONGO_URI };
      delete (input as NodeJS.ProcessEnv)[key];
      await expect(main(['--dry-run'], input)).rejects.toThrow(key);
      expect(prismaConstructor).not.toHaveBeenCalled();
      expect(mongoose.createConnection).not.toHaveBeenCalled();
    },
  );

  it.each(['BENCH_DATABASE_URL', 'BENCH_MONGO_URI'] as const)(
    'guards %s before constructing either client',
    async (key) => {
      await expect(main([], { ...env, [key]: env[key].replace('_bench', '') }))
        .rejects.toThrow(/database name must end in _bench/);
      expect(prismaConstructor).not.toHaveBeenCalled();
      expect(mongoose.createConnection).not.toHaveBeenCalled();
    },
  );

  it('prints a synthetic plan and exits dry-run without constructing clients', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await main(['--dry-run', '--titles', '12', '--reviews', '24', '--users', '8', '--replies', '6'], env);
    const output = log.mock.calls.flat().join(' ');
    expect(output).toMatch(/SYNTHETIC/);
    expect(output).toContain('bingemate_bench');
    for (const size of [12, 24, 8, 6]) expect(output).toContain(String(size));
    expect(prismaConstructor).not.toHaveBeenCalled();
    expect(mongoose.createConnection).not.toHaveBeenCalled();
  });

  it.each([['--users', '0'], ['--titles', '-1'], ['--reviews', '1.5'], ['--replies', 'NaN'], ['--typo']])(
    'rejects invalid options %j without connecting',
    async (...args) => {
      await expect(main(args, env)).rejects.toThrow();
      expect(prismaConstructor).not.toHaveBeenCalled();
      expect(mongoose.createConnection).not.toHaveBeenCalled();
    },
  );
});
