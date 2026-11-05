import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaConstructor } = vi.hoisted(() => ({ prismaConstructor: vi.fn() }));
vi.mock('@prisma/client', () => ({ PrismaClient: prismaConstructor }));
const file = fileURLToPath(new URL('../../../../benchmarks/explain.ts', import.meta.url));
const { main, describePlan, describeMongoExplain, postgresQueries } = (await import(
  /* @vite-ignore */ file
)) as {
  main: (args: string[], env: NodeJS.ProcessEnv) => Promise<void>;
  describePlan: (json: unknown) => Record<string, unknown>;
  describeMongoExplain: (json: unknown) => Record<string, unknown>;
  postgresQueries: (input: {
    hotId: string;
    quietId: string;
    mediaType: string;
    name: string;
    genre: string;
  }) => { name: string; sql: string; params: unknown[] }[];
};
beforeEach(() => {
  prismaConstructor.mockClear();
  vi.spyOn(mongoose, 'createConnection').mockImplementation(() => {
    throw new Error('Unexpected connection');
  });
});
afterEach(() => vi.restoreAllMocks());

describe('PostgreSQL explain parser', () => {
  it('describes an Index Scan with root metrics', () => {
    expect(
      describePlan([
        {
          Plan: {
            'Node Type': 'Index Scan',
            'Index Name': 'title_idx',
            'Actual Rows': 20,
            'Shared Hit Blocks': 12,
            'Shared Read Blocks': 3,
          },
          'Execution Time': 1.5,
          'Planning Time': 0.2,
        },
      ]),
    ).toEqual({
      node: 'Index Scan',
      scan: 'Index Scan',
      index: 'title_idx',
      rows: 20,
      executionMs: 1.5,
      planningMs: 0.2,
      sharedHit: 12,
      sharedRead: 3,
    });
  });
  it('finds a Seq Scan below Limit and Sort without adding child buffers', () => {
    expect(
      describePlan([
        {
          Plan: {
            'Node Type': 'Limit',
            'Actual Rows': 20,
            'Shared Hit Blocks': 10,
            Plans: [
              {
                'Node Type': 'Sort',
                Plans: [{ 'Node Type': 'Seq Scan', 'Actual Rows': 500, 'Shared Hit Blocks': 10 }],
              },
            ],
          },
          'Execution Time': 2,
          'Planning Time': 0.1,
        },
      ]),
    ).toMatchObject({
      node: 'Limit',
      scan: 'Seq Scan',
      index: null,
      rows: 20,
      sharedHit: 10,
      sharedRead: 0,
    });
  });
  it('finds the index beneath a Bitmap Heap Scan', () => {
    expect(
      describePlan([
        {
          Plan: {
            'Node Type': 'Bitmap Heap Scan',
            'Actual Rows': 7,
            Plans: [{ 'Node Type': 'Bitmap Index Scan', 'Index Name': 'review_title_idx' }],
          },
        },
      ]),
    ).toMatchObject({ scan: 'Bitmap Heap Scan', index: 'review_title_idx', rows: 7 });
  });
});
describe('MongoDB explain parser', () => {
  it('reads an IXSCAN from a Mongo 7 aggregate cursor and final output rows', () => {
    expect(
      describeMongoExplain({
        stages: [
          {
            $cursor: {
              queryPlanner: {
                winningPlan: {
                  stage: 'FETCH',
                  inputStage: { stage: 'IXSCAN', indexName: 'titleId_1' },
                },
                rejectedPlans: [{ stage: 'COLLSCAN' }],
              },
              executionStats: {
                totalKeysExamined: 12,
                totalDocsExamined: 10,
                nReturned: 10,
                executionTimeMillis: 3,
              },
            },
          },
          { $group: {}, nReturned: 2 },
        ],
      }),
    ).toEqual({
      scan: 'IXSCAN',
      index: 'titleId_1',
      keysExamined: 12,
      docsExamined: 10,
      nReturned: 2,
      executionTimeMillis: 3,
    });
  });
  it('reads a COLLSCAN from a top-level SBE queryPlanner', () => {
    expect(
      describeMongoExplain({
        queryPlanner: {
          winningPlan: { queryPlan: { stage: 'GROUP', inputStage: { stage: 'COLLSCAN' } } },
        },
        executionStats: {
          totalKeysExamined: 0,
          totalDocsExamined: 100,
          nReturned: 4,
          executionTimeMillis: 5,
        },
      }),
    ).toEqual({
      scan: 'COLLSCAN',
      index: null,
      keysExamined: 0,
      docsExamined: 100,
      nReturned: 4,
      executionTimeMillis: 5,
    });
  });
});
describe('benchmark explain offline preflight', () => {
  const env = {
    BENCH_DATABASE_URL: 'postgresql://u:p@localhost/bingemate_bench',
    BENCH_MONGO_URI: 'mongodb://localhost/bingemate_bench',
  };
  it.each(['BENCH_DATABASE_URL', 'BENCH_MONGO_URI'] as const)(
    'guards %s before either client',
    async (key) => {
      await expect(
        main(['--label', 'before'], { ...env, [key]: env[key].replace('_bench', '') }),
      ).rejects.toThrow(/database name must end in _bench/);
      expect(prismaConstructor).not.toHaveBeenCalled();
      expect(mongoose.createConnection).not.toHaveBeenCalled();
    },
  );
  it.each(['BENCH_DATABASE_URL', 'BENCH_MONGO_URI'] as const)(
    'requires %s without app credential fallback',
    async (key) => {
      const input: NodeJS.ProcessEnv = {
        ...env,
        DATABASE_URL: env.BENCH_DATABASE_URL,
        MONGO_URI: env.BENCH_MONGO_URI,
      };
      delete input[key];
      await expect(main(['--label', 'before'], input)).rejects.toThrow(key);
      expect(prismaConstructor).not.toHaveBeenCalled();
      expect(mongoose.createConnection).not.toHaveBeenCalled();
    },
  );
  it('lists queries without credentials or connections', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await main(['--list'], {});
    expect(log.mock.calls.flat().join(' ')).toMatch(/browse-rating/);
    expect(log.mock.calls.flat().join(' ')).toMatch(/recent-review-counts/);
    expect(prismaConstructor).not.toHaveBeenCalled();
    expect(mongoose.createConnection).not.toHaveBeenCalled();
  });
  it.each([
    [],
    ['--label', '../bad'],
    ['--label', 'before', '--runs', '0'],
    ['--label', 'before', '--runs', '1.5'],
    ['--wat'],
    ['--list', '--runs', 'oops'],
  ])('rejects bad arguments %j without connecting', async (...args) => {
    await expect(main(args, {})).rejects.toThrow();
    expect(prismaConstructor).not.toHaveBeenCalled();
    expect(mongoose.createConnection).not.toHaveBeenCalled();
  });
  it('constructs only the guarded bench Prisma client when loading app pipelines and cleans up on failure', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    prismaConstructor.mockImplementation(function () {
      return { $disconnect: disconnect };
    });
    await expect(main(['--label', 'before'], env)).rejects.toThrow('Unexpected connection');
    expect(prismaConstructor).toHaveBeenCalledExactlyOnceWith({
      datasourceUrl: env.BENCH_DATABASE_URL,
    });
    expect(mongoose.createConnection).toHaveBeenCalledExactlyOnceWith(env.BENCH_MONGO_URI, {
      autoIndex: false,
      autoCreate: false,
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it('binds inputs and mirrors all browse sort tie breakers', () => {
    const queries = postgresQueries({
      hotId: 'hot',
      quietId: 'quiet',
      mediaType: 'MOVIE',
      name: "name's",
      genre: 'Drama',
    });
    expect(queries).toHaveLength(12);
    expect(queries.find((q) => q.name === 'browse-rating')?.sql).toContain(
      '"avgRating" DESC, "reviewCount" DESC, "id" ASC',
    );
    expect(queries.find((q) => q.name === 'browse-year')?.sql).toContain(
      '"releaseYear" DESC NULLS LAST, "id" ASC',
    );
    expect(queries.find((q) => q.name === 'search-name')?.params).toContain("%name's%");
    expect(queries.every((q) => !q.sql.includes("name's"))).toBe(true);
  });
});
