import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import type * as PrismaModule from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaConstructor } = vi.hoisted(() => ({ prismaConstructor: vi.fn() }));
vi.mock('@prisma/client', async (original) => ({
  ...await original<typeof PrismaModule>(), PrismaClient: prismaConstructor,
}));
const load = (path: string) => import(/* @vite-ignore */ fileURLToPath(new URL(path, import.meta.url)));
const { summarize } = await load('../../../../benchmarks/lib/stats.ts') as {
  summarize(samples: number[]): { runs: number; median: number; p95: number; max: number; min: number };
};
const { main, measureScenario } = await load('../../../../benchmarks/run.ts') as {
  main(args: string[], env: NodeJS.ProcessEnv): Promise<void>;
  measureScenario(scenario: TestScenario, ctx: TestCtx, options: { runs?: number; warmup?: number }): Promise<{ store: string; runs: number; warmup: number }[]>;
};
const { default: scenarios } = await load('../../../../benchmarks/scenarios/index.ts') as {
  default: { name: string; description: string; sql: unknown; mongo: unknown }[];
};
type TestCtx = { keepSetup: boolean };
type TestScenario = { name: string; description: string; defaultRuns?: number; defaultWarmup?: number; setup?(ctx: TestCtx): Promise<void>; sql(ctx: TestCtx): Promise<void>; mongo(ctx: TestCtx): Promise<void>; app?(ctx: TestCtx): Promise<void>; teardown?(ctx: TestCtx): Promise<void> };
const names = ['reviews-for-title', 'top-n-trending', 'insert-review', 'replies-of-review', 'filtered-browse'];
const env = {
  BENCH_DATABASE_URL: 'postgresql://u:p@localhost/bingemate_bench',
  BENCH_MONGO_URI: 'mongodb://localhost/bingemate_bench',
};
beforeEach(() => {
  prismaConstructor.mockClear();
  vi.spyOn(mongoose, 'createConnection').mockImplementation(() => { throw new Error('Unexpected connection'); });
});
afterEach(() => vi.restoreAllMocks());
describe('benchmark statistics', () => {
  it('uses nearest-rank median and p95, with extrema and count', () => {
    const values = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(summarize(values)).toEqual({ runs: 20, median: 10, p95: 19, min: 1, max: 20 });
    expect(values[0]).toBe(20);
    expect(summarize([7])).toEqual({ runs: 1, median: 7, p95: 7, min: 7, max: 7 });
    expect(summarize([3, 1, 2]).median).toBe(2);
  });
  it('rejects empty samples', () => expect(() => summarize([])).toThrow());
});
describe('benchmark harness offline preflight', () => {
  it.each(['BENCH_DATABASE_URL', 'BENCH_MONGO_URI'] as const)('guards %s before either client', async (key) => {
    await expect(main([], { ...env, [key]: env[key].replace('_bench', '') })).rejects.toThrow(/_bench/);
    expect(prismaConstructor).not.toHaveBeenCalled();
    expect(mongoose.createConnection).not.toHaveBeenCalled();
  });
  it.each(['BENCH_DATABASE_URL', 'BENCH_MONGO_URI'] as const)('requires %s without application fallback', async (key) => {
    const input: NodeJS.ProcessEnv = { ...env, DATABASE_URL: env.BENCH_DATABASE_URL, MONGO_URI: env.BENCH_MONGO_URI };
    delete input[key];
    await expect(main([], input)).rejects.toThrow(key);
    expect(prismaConstructor).not.toHaveBeenCalled();
    expect(mongoose.createConnection).not.toHaveBeenCalled();
  });
  it('lists all five scenarios without credentials or connections', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await main(['--list'], {});
    for (const name of names) expect(log.mock.calls.flat().join(' ')).toContain(name);
    expect(prismaConstructor).not.toHaveBeenCalled();
    expect(mongoose.createConnection).not.toHaveBeenCalled();
  });
  it.each([['--typo'], ['--runs', '0'], ['--warmup', '-1'], ['--scenario', 'unknown'], ['--runs'], ['--list', '--typo']])(
    'rejects invalid arguments %j offline', async (...args) => {
      await expect(main(args, {})).rejects.toThrow();
      expect(prismaConstructor).not.toHaveBeenCalled();
      expect(mongoose.createConnection).not.toHaveBeenCalled();
    },
  );
  it('exports five complete scenario contracts', () => {
    expect(scenarios.map((s) => s.name)).toEqual(names);
    for (const scenario of scenarios) {
      expect(scenario.description.length).toBeGreaterThan(0);
      expect(scenario.sql).toBeTypeOf('function');
      expect(scenario.mongo).toBeTypeOf('function');
    }
  });
});

describe('benchmark runner lifecycle without databases', () => {
  const options = {};
  it('runs setup once, then each store sequentially with warmup discarded, then teardown', async () => {
    const calls: string[] = [];
    let active = 0;
    const work = (store: string) => async () => {
      expect(active++).toBe(0);
      await Promise.resolve();
      calls.push(store);
      active--;
    };
    const scenario: TestScenario = {
      name: 'fake', description: 'pure fake', defaultRuns: 2, defaultWarmup: 1,
      setup: async () => { calls.push('setup'); },
      sql: work('sql'), mongo: work('mongo'), app: work('app'),
      teardown: async () => { calls.push('teardown'); },
    };
    const rows = await measureScenario(scenario, { keepSetup: false }, options);
    expect(calls).toEqual(['setup', 'sql', 'sql', 'sql', 'mongo', 'mongo', 'mongo', 'app', 'app', 'app', 'teardown']);
    expect(rows.map(({ store, runs, warmup }) => ({ store, runs, warmup }))).toEqual(
      ['sql', 'mongo', 'app'].map((store) => ({ store, runs: 2, warmup: 1 })),
    );
  });
  it('honors explicit overrides, zero warmup, and keep-setup', async () => {
    const work = vi.fn(async () => {});
    const teardown = vi.fn(async () => {});
    const rows = await measureScenario({ name: 'fake', description: 'pure fake', defaultRuns: 20,
      defaultWarmup: 3, sql: work, mongo: work, teardown }, { keepSetup: true }, { runs: 1, warmup: 0 });
    expect(work).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ runs: 1, warmup: 0 });
    expect(teardown).not.toHaveBeenCalled();
  });
  it.each(['setup', 'sql', 'mongo', 'app'] as const)('always tears down after %s failure', async (phase) => {
    const ok = async () => {};
    const teardown = vi.fn(ok);
    const scenario: TestScenario = { name: 'fake', description: 'pure fake', setup: ok, sql: ok, mongo: ok, app: ok, teardown };
    scenario[phase] = async () => { throw new Error('work failed'); };
    await expect(measureScenario(scenario, { keepSetup: false }, { runs: 1, warmup: 0 })).rejects.toThrow('work failed');
    expect(teardown).toHaveBeenCalledOnce();
  });
});
